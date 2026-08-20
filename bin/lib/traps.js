"use strict";

// `ai-learn traps` — extract the friction zones (traps) from the embedded docs.
//
// The learning protocol catches *vague* predictions ("something's missing") but
// not the *confidently wrong* answer — the classic place where a learner fools
// themselves into thinking they understood. The embedded reference docs
// (`docs/sources/`) are full of these traps in their warning callouts
// (`> ⚠ Warning:`, `> Security Consideration:`, "Do not…", "Never…"). This
// command extracts them verbatim, each cited `file:line`, so the agent can
// probe exactly where learners stumble — without inventing anything.

const fs = require("fs");
const path = require("path");
const { log, fail, writeJson, mkdirp, normalizePortable } = require("./util");
const { readProgress } = require("./progress");
const { docSourceList } = require("./docs");

const MAX_FILES = 500;

// A callout line that signals a trap. Fastify-style docs mark their warnings
// with `> ⚠ Warning:`, `> Security Consideration:`, or plain prose warnings
// ("Do not…", "Never…"). We keep the set deliberately narrow so a routine
// blockquote (a note, an example) is not mistaken for a trap.
const WARNING_MARKERS = /(⚠|Warning:|WARNING|Security Consideration|Do not|\bNever\b|must not|\bImportant\b|\bCaution\b)/i;

// Walk a source directory for markdown files, skipping noise and capping the
// walk so a huge vendored doc never hangs the command.
function walkMarkdown(dir) {
  const files = [];
  let capped = false;

  const walk = (current) => {
    if (files.length >= MAX_FILES) {
      capped = true;
      return;
    }

    let entries;

    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      return; // unreadable dir → skip silently
    }

    entries.sort((a, b) => (a.name < b.name ? -1 : 1));

    for (const entry of entries) {
      if (files.length >= MAX_FILES) {
        capped = true;
        return;
      }

      if (entry.name.startsWith(".")) {
        continue; // .git, hidden files
      }

      const abs = path.join(current, entry.name);

      if (entry.isDirectory()) {
        walk(abs);
      } else if (entry.isFile() && path.extname(entry.name).toLowerCase() === ".md") {
        files.push(abs);
      }
    }
  };

  walk(dir);

  return { files, capped };
}

// Extract warning callout blocks from a single markdown file. Each trap records
// the nearest preceding heading as its section and the 1-based line of the
// callout's first line. A callout is a run of consecutive `>` blockquote lines
// whose first line carries a warning marker.
function extractFromFile(file, fileRel) {
  const traps = [];
  let content;

  try {
    content = fs.readFileSync(file, "utf8");
  } catch {
    return traps;
  }

  const lines = content.split(/\r?\n/);
  let section = "";
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    const heading = line.match(/^#{1,4}\s+(.+)/);

    if (heading) {
      section = heading[1].trim();
      i += 1;
      continue;
    }

    const callout = line.match(/^>\s?(.*)/);

    if (callout && WARNING_MARKERS.test(callout[1])) {
      const block = [callout[1].trim()];
      const startLine = i + 1;
      i += 1;

      // Capture the consecutive blockquote lines that follow.
      while (i < lines.length) {
        const next = lines[i].match(/^>\s?(.*)/);

        if (!next) {
          break;
        }

        block.push(next[1].trim());
        i += 1;
      }

      traps.push({
        file: fileRel,
        section,
        line: startLine,
        text: block.join("\n").trim(),
      });
      continue;
    }

    i += 1;
  }

  return traps;
}

// Extract all traps from one local doc source (`docs/sources/<name>/`).
function extractTrapsFromSource(sourceName, sourcePath) {
  const traps = [];
  const { files } = walkMarkdown(sourcePath);

  for (const file of files) {
    const rel = normalizePortable(path.relative(sourcePath, file));
    traps.push(...extractFromFile(file, rel));
  }

  return traps.map((trap) => ({ source: sourceName, ...trap }));
}

// Human-readable bank written to docs/plans/pièges.md, grouped by source then
// file, each trap carrying its `file:line` citation.
function renderTraps(traps) {
  const lines = [
    "# Banque de pièges — zones de friction",
    "",
    "Extraits automatiquement par `ai-learn traps` depuis les docs embarquées",
    "(`docs/sources/`). Chaque piège cite sa source : `fichier:ligne`. L'IA sonde",
    "précisément ces zones dans le protocole (cf. AGENTS.md) — rien d'inventé.",
    "",
  ];

  let currentSource = null;
  let currentFile = null;

  for (const trap of traps) {
    if (trap.source !== currentSource) {
      currentSource = trap.source;
      currentFile = null;
      lines.push(`## ${trap.source}`, "");
    }

    if (trap.file !== currentFile) {
      currentFile = trap.file;
      lines.push(`### ${trap.file}`, "");
    }

    const section = trap.section ? ` (${trap.section})` : "";
    lines.push(`- **${trap.file}:${trap.line}**${section} :`);

    for (const textLine of trap.text.split("\n")) {
      lines.push(`  ${textLine}`);
    }

    lines.push("");
  }

  return `${lines.join("\n")}\n`;
}

// Regenerate the traps bank for a learning project. Reads the ledger's local
// doc sources, extracts their warning callouts, and writes both the machine
// file (.ai-learn/traps.json) and the human one (docs/plans/pièges.md).
// Best-effort: never throws — a missing source or an unreadable doc is a skip,
// not a crash. Returns `{ traps, sources }`.
function regenerateTraps(dir) {
  const { config, exists } = readProgress(dir);

  if (!exists || !config) {
    return { traps: [], sources: 0 };
  }

  const local = docSourceList(config.docSource).filter((source) => source.mode === "local" && source.path);

  const traps = [];
  let sources = 0;

  for (const source of local) {
    const abs = path.resolve(dir, source.path);

    if (!fs.existsSync(abs)) {
      continue; // declared but missing → skip, check will flag it
    }

    sources += 1;
    traps.push(...extractTrapsFromSource(source.name, abs));
  }

  // Deterministic order: source, then file, then line.
  traps.sort((a, b) => {
    if (a.source !== b.source) {
      return a.source < b.source ? -1 : 1;
    }
    if (a.file !== b.file) {
      return a.file < b.file ? -1 : 1;
    }
    return a.line - b.line;
  });

  writeJson(path.join(dir, ".ai-learn", "traps.json"), {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    traps,
  });

  const humanPath = path.join(dir, "docs", "plans", "pièges.md");
  mkdirp(path.dirname(humanPath));
  fs.writeFileSync(humanPath, renderTraps(traps));

  return { traps, sources };
}

function trapsCommand({ dir }) {
  const { config, exists } = readProgress(dir);

  if (!exists || !config) {
    fail(`No progress.json in ${dir}. Run \`ai-learn init\` first.`);
  }

  const { traps, sources } = regenerateTraps(dir);
  log(`Banque de pièges régénérée : ${traps.length} piège(s) extraits de ${sources} source(s).`);
  log(`  Fichiers : .ai-learn/traps.json · docs/plans/pièges.md`);

  if (traps.length > 0) {
    log(`  Zones de friction à sonder dans le protocole (cf. AGENTS.md).`);
  }
}

module.exports = { WARNING_MARKERS, extractTrapsFromSource, regenerateTraps, trapsCommand };
