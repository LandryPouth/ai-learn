"use strict";

// `ai-learn check [--root <dir>]` — the scanner. Walks a root (default cwd) for
// learning projects and cross-checks each progress.json against what actually
// exists: a phase marked `done` must carry a passing verify evidence and its
// declared artifacts; a phase with evidence but not marked done is drift. This is
// the command that makes "the AI skipped the rule" visible.

const fs = require("fs");
const path = require("path");
const { log, findLearningProjects } = require("./util");
const { readProgress, validateProgress, runsDir, progressPath } = require("./progress");
const { latestEvidenceForPhase } = require("./status");
const { docSourceList } = require("./docs");
const { MARKER: CODEX_GUARD_MARKER } = require("./platforms/codex-guard");
const { appendAutoEntry } = require("./dogfood");

// Signals that a docs/solutions/*.md reveal was deliberately left incomplete:
// a bracketed placeholder, an ellipsis, a "TODO/à compléter/à finir" note, or
// a line that trails off with "...". Anchored loosely on purpose — this is a
// presence check for *some* hole-shaped marker, not a judge of whether the
// hole is well-placed.
const HOLE_MARKER_RE = /\[\s*\.\.\.\s*\]|…|\bTODO\b|à (?:compl[ée]ter|finir)|\.\.\.\s*$/im;

function checkProject(dir) {
  const issues = { errors: [], warnings: [] };
  const { config, exists } = readProgress(dir);

  if (!exists) {
    return null;
  }

  if (!config) {
    issues.errors.push({ file: "progress.json", message: "unreadable or invalid JSON" });
    return { dir, config: null, issues };
  }

  for (const issue of validateProgress(config)) {
    (issue.level === "error" ? issues.errors : issues.warnings).push(issue);
  }

  // Doc sources the ledger declares should exist. A local source that vanished
  // is worth knowing — the plan's citations point at it. A *generated* source is
  // stricter: it was not cloned, the AI had to recreate it locally from a
  // verified origin, so check demands provenance, a non-empty doc, and that the
  // doc cites its origin — otherwise it is an unverifiable invention. Handles
  // both the new `docSource.sources[]` shape and the legacy single-source shape.
  let hasLocalSource = false;

  for (const source of docSourceList(config.docSource)) {
    if (source.mode !== "local" || !source.path) {
      continue; // remote sources are URLs — nothing local to check
    }

    hasLocalSource = true;
    const expanded = source.path.replace(/^~/, process.env.HOME || "");
    const resolved = path.isAbsolute(expanded) ? expanded : path.join(dir, expanded);

    if (source.generated) {
      checkGeneratedSource(resolved, source, issues);
      continue;
    }

    if (!fs.existsSync(resolved)) {
      issues.warnings.push({
        file: "progress.json",
        message: `declared doc source does not exist: ${source.path} (${source.name})`,
      });
    }
  }

  // The friction bank is derived from the local docs. Its absence is a warning,
  // not an error: a project can legitimately have zero traps — but if local
  // sources exist, the protocol should know whether any warning callouts live
  // in them. And a bank that exists but flags `possibleMisses` means the
  // extractor found warning-marker lines it could not parse (an admonition
  // syntax it doesn't recognize) — "0 traps" there is not proof the doc is
  // clean, so surface it rather than let it read as silence.
  if (hasLocalSource) {
    const trapsPath = path.join(dir, ".ai-learn", "traps.json");

    if (!fs.existsSync(trapsPath)) {
      issues.warnings.push({
        file: ".ai-learn/traps.json",
        message: "local doc sources exist but no friction bank — run `ai-learn traps`",
      });
    } else {
      try {
        const trapsData = JSON.parse(fs.readFileSync(trapsPath, "utf8"));

        if (Number.isFinite(trapsData.possibleMisses) && trapsData.possibleMisses > 0) {
          issues.warnings.push({
            file: ".ai-learn/traps.json",
            message:
              `${trapsData.possibleMisses} warning-marker line(s) found outside any syntax the extractor ` +
              "recognizes (blockquote, admonition :::, <div>) — extraction may be incomplete; check those docs manually",
          });
        }
      } catch {
        // unreadable/corrupt traps.json — not this check's job to fix
      }
    }
  }

  // The learner-file block ("blocage apprenant") is enforced by the `ai-learn
  // guard` PreToolUse hook. If the policy (.ai-learn/guard.json) exists but the
  // hook is not wired into .claude/settings.json, the block is configured yet
  // inactive — exactly the silent skip this check exists to surface. Guarded
  // only when the policy file exists, so older projects stay quiet.
  if (fs.existsSync(path.join(dir, ".ai-learn", "guard.json")) && !guardHookWired(dir)) {
    issues.warnings.push({
      file: ".claude/settings.json",
      message: "guard policy exists (.ai-learn/guard.json) but the `ai-learn guard` hook is not wired — " +
        "the learner-file block is inactive. Run `ai-learn update --root <dir>`.",
    });
    // Mechanical, not agent-authored: check writes the finding itself the
    // moment it's detected — see bin/lib/dogfood.js.
    appendAutoEntry(dir, {
      platform: "claude-code",
      surface: "hook-guard",
      expected: "le hook PreToolUse ai-learn guard aurait dû être câblé dans .claude/settings.json par init/update",
      problem: "guard.json existe mais aucun hook PreToolUse pointant vers ai-learn.js guard n'est présent dans .claude/settings.json",
    });
  }

  // Codex's mechanical guard (a .codex/config.toml permissions profile, see
  // bin/lib/platforms/codex-guard.js) is a separate wiring from the Claude
  // hook above — a project can have one without the other.
  if (fs.existsSync(path.join(dir, ".ai-learn", "guard.json")) && !codexGuardWired(dir)) {
    issues.warnings.push({
      file: ".codex/config.toml",
      message: "guard policy exists (.ai-learn/guard.json) but no ai-learn permissions profile in " +
        ".codex/config.toml — Codex's sandbox-level block is inactive. Run `ai-learn update --root <dir>`.",
    });
    appendAutoEntry(dir, {
      platform: "codex",
      surface: "config",
      expected: "le profil de permissions ai-learn-guard aurait dû être câblé dans .codex/config.toml par init/update",
      problem: "guard.json existe mais .codex/config.toml ne porte pas le marqueur ai-learn (absent, ou fichier personnalisé jamais rafraîchi)",
    });
  }

  // The guard blocks the AI from writing `src/**`, but the reveal it deposits
  // in docs/solutions/ is meant to be "non-collable" — written with holes
  // ([...], an incomplete line, a comment to finish) so a blind Cmd+A cannot
  // pass the checkpoint (see templates/AGENTS-apprentissage.md and the
  // SOLUTIONS_README in guard.js). That rule lived only as prose: nothing
  // checked it was actually followed. This is the same structural, not
  // semantic, guarantee as checkGeneratedSource below — it cannot tell a
  // thoughtfully-holed reveal from a lazily-holed one, it only catches the
  // degenerate case of zero hole markers anywhere in the file (a fully
  // complete, copy-pasteable solution).
  const solutionsDir = path.join(dir, "docs", "solutions");

  if (fs.existsSync(solutionsDir)) {
    for (const entry of fs.readdirSync(solutionsDir)) {
      if (entry === "README.md" || !entry.endsWith(".md")) {
        continue; // README.md is the generated index, not a reveal
      }

      const filePath = path.join(solutionsDir, entry);
      const content = fs.readFileSync(filePath, "utf8");

      if (!HOLE_MARKER_RE.test(content)) {
        issues.warnings.push({
          file: `docs/solutions/${entry}`,
          message:
            "no hole marker found ([...], …, TODO, or a truncated line) — this reveal may be copy-pasteable " +
            "as-is, defeating the \"non-collable\" guarantee. Rewrite it with real gaps to complete.",
        });
      }
    }
  }

  // Prediction journal: phases that require predictions must have a journal, and
  // ideally enough entries to cover the phases already done.
  const required = (config.phases || []).reduce(
    (sum, phase) => sum + (Number.isFinite(phase.predictionsRequired) ? phase.predictionsRequired : 0),
    0,
  );
  const journalPath = path.join(dir, "docs", "plans", "predictions.md");
  const journalExists = fs.existsSync(journalPath);
  const journalCount = journalExists ? countJournalEntries(journalPath) : 0;

  if (required > 0 && !journalExists) {
    issues.warnings.push({
      file: "docs/plans/predictions.md",
      message: `predictions.md missing; ${required} prediction(s) required across phases`,
    });
  } else if (journalCount < required) {
    issues.warnings.push({
      file: "docs/plans/predictions.md",
      message: `${journalCount}/${required} recorded predictions; ${required - journalCount} missing`,
    });
  }

  // The visible escape hatch: a correction the AI typed because the learner was
  // genuinely stuck. Legitimate, but worth surfacing so it never becomes the
  // default — the learner-file block exists to prevent exactly that drift.
  if (journalExists) {
    const iaTyped = countIATypedCorrections(journalPath);

    if (iaTyped > 0) {
      issues.warnings.push({
        file: "docs/plans/predictions.md",
        message: `${iaTyped} correction(s) marked "Corrigé par : IA" — the learner-file block was bypassed for those bricks (visible escape hatch)`,
      });
    }
  }

  for (const phase of config.phases || []) {
    const relative = (artifact) => normalizeRelative(dir, artifact);

    if (phase.status === "done") {
      if (!phase.checkpoint) {
        issues.warnings.push({
          file: "progress.json",
          message: `phase ${phase.id} ("${phase.name}") is done but has no checkpoint — it cannot be proven`,
        });
      } else {
        const ev = latestEvidenceForPhase(dir, phase.id);

        if (!ev) {
          issues.errors.push({
            file: "progress.json",
            message: `phase ${phase.id} ("${phase.name}") is marked done but has no passing evidence. Run \`ai-learn verify ${phase.id}\`.`,
          });
        }
      }

      for (const artifact of phase.artifacts || []) {
        if (!fs.existsSync(path.join(dir, artifact))) {
          issues.errors.push({ file: relative(artifact), message: `phase ${phase.id} requires artifact ${relative(artifact)}` });
        }
      }
    } else {
      const ev = latestEvidenceForPhase(dir, phase.id);

      if (ev) {
        issues.warnings.push({
          file: "progress.json",
          message: `phase ${phase.id} has passing evidence but is not marked done (stale or reverted?)`,
        });
      }

      // The structural backstop: a checkpoint test file that exists but has no
      // passing evidence means the agent wrote the proof but never ran it —
      // verify was skipped even though the work was done. This is what makes
      // verify non-skippable by omission, not just by word.
      const checkpointFile = checkpointFilePath(dir, phase.checkpoint);

      if (checkpointFile && !latestEvidenceForPhase(dir, phase.id)) {
        issues.errors.push({
          file: relative(checkpointFile),
          message: `checkpoint exists but no passing evidence — run \`ai-learn verify ${phase.id}\``,
        });
      }
    }
  }

  return { dir, config, issues };
}

// A `generated` source was never cloned — the AI had to recreate the doc
// locally from a verified origin. The origin is either a URL (`--regen`) or a
// local file (ex. a PDF book: the file is embedded whole, the AI distills only
// what the plan needs into a .md). Same structural guards, mirroring the way
// verify proves phases: the origin is the provenance, a non-empty .md must
// exist (the recreation actually happened), and it must cite its origin with
// real content around the citation — not just a trailing "Source: X" line
// stapled onto an otherwise empty or hallucinated file. This is a presence +
// minimum-substance check, not a truth check: it cannot tell a faithful
// distillation from a hallucinated one that happens to cite its source
// correctly. It only refuses the degenerate, cheap-to-fake case.
function checkGeneratedSource(dirPath, source, issues) {
  const origin = source.url || source.file;

  if (!origin) {
    issues.errors.push({
      file: "progress.json",
      message: `generated source "${source.name}" has no origin — nothing to verify it against`,
    });
  }

  if (!findTranscript(dirPath)) {
    issues.errors.push({
      file: "progress.json",
      message: `generated source "${source.name}" is empty — no essential .md yet; the AI must recreate it locally from its verified origin (${origin || "no origin recorded"})`,
    });
    return;
  }

  if (origin && !docCitesOrigin(dirPath, String(origin))) {
    issues.warnings.push({
      file: source.path,
      message:
        `generated source "${source.name}" does not cite its origin with enough real content around it — ` +
        `a bare "Source: ${origin}" line is not enough (this check verifies presence and minimum ` +
        `substance, not that the content is accurate)`,
    });
  }
}

// The first non-empty markdown file in a generated source directory. A
// generated source is only "recreated" once the AI has written a real
// transcript — the origin file itself (a PDF, say) does not count.
function findTranscript(dirPath) {
  let entries;

  try {
    entries = fs.readdirSync(dirPath, { withFileTypes: true });
  } catch {
    return null;
  }

  for (const entry of entries) {
    if (!entry.isFile() || path.extname(entry.name).toLowerCase() !== ".md") {
      continue;
    }

    try {
      if (fs.statSync(path.join(dirPath, entry.name)).size > 0) {
        return path.join(dirPath, entry.name);
      }
    } catch {
      // unreadable file — skip
    }
  }

  return null;
}

// Does any file in the generated source mention its origin URL, with enough
// content around the citation to not be the degenerate case of a hallucinated
// (or empty) file with a citation stapled onto it? The AI may write the URL
// with or without scheme/trailing slash, so compare normalized. Presence
// check only — it cannot verify the surrounding content is *accurate*, only
// that there is a non-trivial amount of it next to a real citation.
const MIN_CONTENT_BEYOND_CITATION = 200;

function docCitesOrigin(dirPath, url) {
  const needle = normalizeOrigin(url);
  let entries;

  try {
    entries = fs.readdirSync(dirPath, { withFileTypes: true });
  } catch {
    return false;
  }

  for (const entry of entries) {
    if (!entry.isFile() || entry.name.startsWith(".")) {
      continue;
    }

    let content;

    try {
      content = fs.readFileSync(path.join(dirPath, entry.name), "utf8");
    } catch {
      continue; // unreadable file — skip
    }

    if (!content.includes(needle)) {
      continue;
    }

    const withoutCitationLines = content
      .split("\n")
      .filter((line) => !line.includes(needle))
      .join("\n")
      .trim();

    if (withoutCitationLines.length >= MIN_CONTENT_BEYOND_CITATION) {
      return true;
    }
  }

  return false;
}

function normalizeOrigin(url) {
  return String(url).replace(/^https?:\/\//, "").replace(/\/+$/, "");
}

// Evidence journal format: one `### Phase <N> — prédiction <k>/<total>` heading per
// recorded prediction. Structural count only — honesty is the learner's.
function countJournalEntries(journalPath) {
  const content = fs.readFileSync(journalPath, "utf8");
  return (content.match(/^###\s+Phase\s+\d+\s+—\s+prédiction/i) || []).length;
}

// Corrections the learner explicitly handed to the AI ("Corrigé par : IA").
// Structural count only; a legitimate stuck-learner exception, not a proof.
function countIATypedCorrections(journalPath) {
  const content = fs.readFileSync(journalPath, "utf8");
  return (content.match(/^-\s*Corrigé par\s*:\s*IA\b/gim) || []).length;
}

// Friction journal entries: one `### <severity> — <title>` heading per entry,
// same convention as docs/DOGFOODING.md. Purely informational — see
// printProjectReport: zero entries is a legitimate outcome, never flagged.
function countDogfoodEntries(dogfoodPath) {
  const content = fs.readFileSync(dogfoodPath, "utf8");
  return (content.match(/^###\s+(?:low|medium|high)\s+—/gim) || []).length;
}

// Is the `ai-learn guard` PreToolUse hook wired into the project's
// .claude/settings.json? The block is only real when the hook is installed.
function guardHookWired(dir) {
  const settingsPath = path.join(dir, ".claude", "settings.json");
  let settings = null;

  try {
    if (fs.existsSync(settingsPath)) {
      settings = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
    }
  } catch {
    return false;
  }

  const preToolUse =
    settings && settings.hooks && Array.isArray(settings.hooks.PreToolUse) ? settings.hooks.PreToolUse : [];

  return preToolUse.some(
    (entry) =>
      entry &&
      Array.isArray(entry.hooks) &&
      entry.hooks.some((h) => h && typeof h.command === "string" && /ai-learn(\.js)? guard/.test(h.command)),
  );
}

// Is Codex's mechanical guard (a .codex/config.toml permissions profile)
// wired for this project? Only true for a file ai-learn generated itself —
// see ensureCodexGuard's marker convention in guard.js.
function codexGuardWired(dir) {
  const configPath = path.join(dir, ".codex", "config.toml");

  try {
    return fs.readFileSync(configPath, "utf8").startsWith(CODEX_GUARD_MARKER);
  } catch {
    return false;
  }
}

function normalizeRelative(dir, value) {
  return path.relative(dir, path.resolve(dir, value)).replace(/\\/g, "/");
}

// Extract the test file path a checkpoint command points at, if any. The
// checkpoint format is a shell command (ex. `node --test checkpoint/phase-1.test.mjs`);
// we look for a token that resolves to an existing file relative to the project.
function checkpointFilePath(dir, command) {
  if (typeof command !== "string") {
    return null;
  }

  const tokens = command.split(/\s+/);

  for (const token of tokens) {
    if (!token || token.startsWith("-")) {
      continue;
    }

    const candidate = path.resolve(dir, token);

    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
      return candidate;
    }
  }

  return null;
}

function printProjectReport(entry) {
  const { config, issues } = entry;

  log(`\n${path.basename(entry.dir)}`);

  if (!config) {
    log("  ✗ progress.json invalid");
    return;
  }

  const done = config.phases.filter((phase) => phase.status === "done").length;
  log(`  ${done}/${config.phases.length} phases done`);

  for (const error of issues.errors) {
    log(`  ✗ ${error.file ? `${error.file}: ` : ""}${error.message}`);
  }

  for (const warning of issues.warnings) {
    log(`  ⚠ ${warning.file ? `${warning.file}: ` : ""}${warning.message}`);
  }

  // The learner-file block, when active, reports how many AI writes it has
  // refused so far — the reassurance that the block is real, not decorative.
  if (fs.existsSync(path.join(entry.dir, ".ai-learn", "guard.json"))) {
    const blocks = countGuardBlocks(entry.dir);
    const wired = guardHookWired(entry.dir);
    log(`  guard (claude): ${wired ? `actif — ${blocks} écriture(s) IA bloquée(s) sur les fichiers solution` : "configuré mais hook non câblé"}`);
    log(`  guard (codex): ${codexGuardWired(entry.dir) ? "actif (bac à sable OS)" : "configuré mais profil non câblé"}`);
  }

  // Purely informational: zero entries is a legitimate outcome (no friction
  // encountered), never a warning — see countDogfoodEntries.
  const dogfoodPath = path.join(entry.dir, ".ai-learn", "dogfood.md");

  if (fs.existsSync(dogfoodPath)) {
    log(`  dogfood: ${countDogfoodEntries(dogfoodPath)} entrée(s) de friction consignée(s)`);
  }
}

function countGuardBlocks(dir) {
  const logPath = path.join(dir, ".ai-learn", "guard.log");

  try {
    if (!fs.existsSync(logPath)) {
      return 0;
    }
    return fs.readFileSync(logPath, "utf8").split("\n").filter(Boolean).length;
  } catch {
    return 0;
  }
}

function checkCommand({ root }) {
  const projects = findLearningProjects(root);

  if (projects.length === 0) {
    log(`No learning projects (no progress.json) under ${root}.`);
    return;
  }

  log(`Checking ${projects.length} learning project(s) under ${root}:`);

  let errors = 0;
  let warnings = 0;

  for (const project of projects) {
    const entry = checkProject(project);

    if (entry) {
      printProjectReport(entry);
      errors += entry.issues.errors.length;
      warnings += entry.issues.warnings.length;
    }
  }

  log(`\n${errors} error(s), ${warnings} warning(s).`);

  if (errors > 0) {
    log("✗ check FAILED");
    process.exitCode = 1;
  } else {
    log("✓ check passed");
  }
}

module.exports = {
  checkCommand,
  checkProject,
  countJournalEntries,
  countIATypedCorrections,
  countDogfoodEntries,
  guardHookWired,
  codexGuardWired,
};
