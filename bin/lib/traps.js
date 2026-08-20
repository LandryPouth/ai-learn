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

// Docusaurus/VitePress-style fenced admonitions: `:::warning ... :::`. Only
// the warning-ish types count as traps — `:::tip`/`:::note`/`:::info` are not.
const ADMONITION_TYPE_RE = /^:::(warning|caution|danger|important)\b/i;

// A best-effort match for an HTML admonition block, ex.
// `<div class="admonition warning">…</div>` — common in doc sites that render
// Markdown to HTML with a warning/caution/danger class on the wrapper.
const HTML_WARNING_DIV_RE = /^<div\b[^>]*\bclass\s*=\s*["'][^"']*\b(?:warning|caution|danger|important)\b[^"']*["'][^>]*>/i;

// A much narrower marker for "possible miss" detection outside recognized
// block syntax: the label form real admonitions use ("Warning: …",
// "**Important:** …"), anchored at the start of the (trimmed, de-emphasized)
// line. WARNING_MARKERS matches anywhere in a line and includes prose
// starters ("Do not", "Never", bare "Important") — reused as-is on whole-file
// prose it floods the signal with ordinary sentences ("this is important
// because…", a package named `process-warning`, a "## Emit Warnings"
// heading). Requiring the label-plus-colon shape at the very start keeps
// precision high at the cost of recall — a real but unlabeled prose warning
// outside any block can still slip past, same honesty limit as the rest of
// this extractor.
const POSSIBLE_MISS_RE = /^(?:[*_]{1,2}\s*)?(?:⚠|warning\s*:|security consideration\s*:|caution\s*:|important\s*:)/i;

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

// Extract warning blocks from a single markdown file. Each trap records the
// nearest preceding heading as its section and the 1-based line of the
// block's first line. Three block syntaxes are recognized:
//   1. Markdown blockquote callout: consecutive `>` lines whose first line
//      carries a warning marker (also covers GFM alerts like `> [!WARNING]`,
//      since "WARNING" is itself a marker).
//   2. Docusaurus/VitePress fenced admonition: `:::warning ... :::`.
//   3. HTML admonition block: `<div class="…warning…">…</div>` (best-effort,
//      does not handle nested divs of the same class).
// Any warning-marker line that falls outside all three (an unrecognized
// admonition syntax, a plain paragraph) is counted as a "possible miss" —
// not extracted, but surfaced so a silent "0 traps" is never confused with
// "the doc has none".
function extractFromFile(file, fileRel) {
  const traps = [];
  let possibleMisses = 0;
  let content;

  try {
    content = fs.readFileSync(file, "utf8");
  } catch {
    return { traps, possibleMisses };
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

      traps.push({ file: fileRel, section, line: startLine, text: block.join("\n").trim() });
      continue;
    }

    const fence = line.match(ADMONITION_TYPE_RE);

    if (fence) {
      const startLine = i + 1;
      i += 1;
      const block = [];

      while (i < lines.length && !/^:::\s*$/.test(lines[i])) {
        block.push(lines[i]);
        i += 1;
      }

      if (i < lines.length) {
        i += 1; // consume the closing ':::'
      }

      traps.push({ file: fileRel, section, line: startLine, text: block.join("\n").trim() });
      continue;
    }

    if (HTML_WARNING_DIV_RE.test(line)) {
      const startLine = i + 1;
      const openTag = line.match(HTML_WARNING_DIV_RE)[0];
      const block = [];
      let rest = line.slice(openTag.length);
      i += 1;

      while (!/<\/div>/i.test(rest) && i < lines.length) {
        if (rest.trim()) {
          block.push(rest.trim());
        }
        rest = lines[i];
        i += 1;
      }

      const closingIndex = rest.search(/<\/div>/i);
      const before = closingIndex >= 0 ? rest.slice(0, closingIndex) : rest;

      if (before.trim()) {
        block.push(before.trim());
      }

      traps.push({ file: fileRel, section, line: startLine, text: block.join("\n").replace(/<[^>]+>/g, "").trim() });
      continue;
    }

    if (POSSIBLE_MISS_RE.test(line.trim())) {
      possibleMisses += 1;
    }

    i += 1;
  }

  return { traps, possibleMisses };
}

// Extract all traps from one local doc source (`docs/sources/<name>/`).
// Returns `{ traps, possibleMisses }` — traps carry their source name;
// possibleMisses is the count of warning-marker lines found outside any
// recognized block syntax, across every file in the source.
function extractTrapsFromSource(sourceName, sourcePath) {
  const traps = [];
  let possibleMisses = 0;
  const { files } = walkMarkdown(sourcePath);

  for (const file of files) {
    const rel = normalizePortable(path.relative(sourcePath, file));
    const result = extractFromFile(file, rel);
    traps.push(...result.traps);
    possibleMisses += result.possibleMisses;
  }

  return { traps: traps.map((trap) => ({ source: sourceName, ...trap })), possibleMisses };
}

// Human-readable bank written to docs/plans/pièges.md, grouped by source then
// file, each trap carrying its `file:line` citation.
function renderTraps(traps, possibleMisses = 0) {
  const lines = [
    "# Banque de pièges — zones de friction",
    "",
    "Extraits automatiquement par `ai-learn traps` depuis les docs embarquées",
    "(`docs/sources/`). Chaque piège cite sa source : `fichier:ligne`. L'IA sonde",
    "précisément ces zones dans le protocole (cf. AGENTS.md) — rien d'inventé.",
    "",
  ];

  if (possibleMisses > 0) {
    lines.push(
      `> ⚠ ${possibleMisses} ligne(s) contenant un marqueur d'avertissement ont été trouvées en dehors de toute`,
      "> syntaxe reconnue (blockquote, admonition `:::`, `<div>`) — l'extraction est peut-être incomplète pour",
      "> ces docs. Un total de 0 piège pour une source ne signifie pas forcément qu'elle est propre.",
      "",
    );
  }

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
// not a crash. Returns `{ traps, sources, possibleMisses }` — possibleMisses
// is the count of warning-marker lines found outside any recognized syntax,
// so "0 traps" (clean doc) is never silently confused with "0 traps because
// the extractor doesn't understand this doc's admonition syntax".
function regenerateTraps(dir) {
  const { config, exists } = readProgress(dir);

  if (!exists || !config) {
    return { traps: [], sources: 0, possibleMisses: 0 };
  }

  const local = docSourceList(config.docSource).filter((source) => source.mode === "local" && source.path);

  const traps = [];
  let sources = 0;
  let possibleMisses = 0;

  for (const source of local) {
    const abs = path.resolve(dir, source.path);

    if (!fs.existsSync(abs)) {
      continue; // declared but missing → skip, check will flag it
    }

    sources += 1;
    const result = extractTrapsFromSource(source.name, abs);
    traps.push(...result.traps);
    possibleMisses += result.possibleMisses;
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
    possibleMisses,
  });

  const humanPath = path.join(dir, "docs", "plans", "pièges.md");
  mkdirp(path.dirname(humanPath));
  fs.writeFileSync(humanPath, renderTraps(traps, possibleMisses));

  return { traps, sources, possibleMisses };
}

function trapsCommand({ dir }) {
  const { config, exists } = readProgress(dir);

  if (!exists || !config) {
    fail(`No progress.json in ${dir}. Run \`ai-learn init\` first.`);
  }

  const { traps, sources, possibleMisses } = regenerateTraps(dir);
  log(`Banque de pièges régénérée : ${traps.length} piège(s) extraits de ${sources} source(s).`);
  log(`  Fichiers : .ai-learn/traps.json · docs/plans/pièges.md`);

  if (traps.length > 0) {
    log(`  Zones de friction à sonder dans le protocole (cf. AGENTS.md).`);
  }

  if (possibleMisses > 0) {
    log(
      `  ⚠ ${possibleMisses} ligne(s) contenant un marqueur d'avertissement en dehors de toute syntaxe ` +
        `reconnue (blockquote, admonition :::, <div>) — l'extraction peut être incomplète, vérifier ces docs à la main.`,
    );
  }
}

module.exports = { WARNING_MARKERS, extractTrapsFromSource, regenerateTraps, trapsCommand };
