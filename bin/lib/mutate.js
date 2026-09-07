"use strict";

// `ai-learn mutate --phase <id>` — mutation testing, walking skeleton (story
// 02.01). Breaks the learner's code in one precise, reversible way and asks
// the phase's own checkpoint whether it notices. A test that stays green
// while the code underneath it changed behavior is a test that protects
// nothing — this is the mechanical way to see that, instead of trusting that
// "the test passed" means "the test works".
//
// Isolation is in-place + backup (in memory) + restoration, never a copy of
// the whole project — see docs/roadmap.md (locked decision) and
// epics/epic-02-tests-preuves-par-mutation/index.md (Decisions). The
// restoration is guaranteed by a `finally`, even if the checkpoint command
// itself throws.

const fs = require("fs");
const { log, fail } = require("./util");
const { readProgress, findPhase } = require("./progress");
const { walkSources, detectTests, ALL_SOURCE_EXTS } = require("./scan");
const { loadGuardConfig, matchesLearnerPath } = require("./guard");
const { stripStringsAndComments } = require("./norm");
const { runCommand } = require("./verify");

// Word-bounded so `truely`/`falsey` never match — same discipline as
// `norm.js`'s brace strategy: under-detect rather than guess.
const BOOLEAN_LITERAL_RE = /\b(?:true|false)\b/;

function invertBoolean(text) {
  return text === "true" ? "false" : "true";
}

// The single mutation operator of this story's skeleton. Story 02.02
// generalizes this into a per-stack bank; this one stays hardcoded on
// purpose (see plan.md Decisions).
const BOOLEAN_LITERAL_OPERATOR = {
  id: "boolean-literal",
  pattern: BOOLEAN_LITERAL_RE,
  mutate: invertBoolean,
};

// Finds the first mutable site in the learner's own files (`learnerFiles`,
// same scope as `norm.js#normProject` and the epic 01 source hash — never a
// hardcoded `src/**`). Detection runs on `stripStringsAndComments`'s output,
// which preserves length and newlines exactly, so an index found there maps
// 1:1 onto the real source text.
//
// Scanned candidates are restricted to `ALL_SOURCE_EXTS` — same filter as
// `norm.js#normProject` — so a boolean literal sitting in prose (README.md,
// a doc file under `src/**`) or in a data file (JSON/YAML config) is never
// picked as a mutant: it isn't code the checkpoint is meant to protect, and
// mutating it would only ever produce a misleading SURVÉCU.
//
// Test files are excluded the same way `norm.js#normProject` excludes them
// (`detectTests`) — by default `learnerFiles` is `src/**`, so this rarely
// bites, but a widened `learnerFiles` (e.g. `**/*.js`) could otherwise let
// a learner's own test file become the mutant: asking a test to detect a
// mutation of itself proves nothing.
function findFirstSite(dir) {
  const walked = walkSources(dir);
  const { learnerFiles } = loadGuardConfig(dir);
  const testRels = new Set(detectTests(walked.files).files.map((f) => f.rel));

  for (const file of walked.files) {
    if (file.binary) {
      continue;
    }
    if (!ALL_SOURCE_EXTS.has(file.ext)) {
      continue;
    }
    if (testRels.has(file.rel)) {
      continue;
    }
    if (!matchesLearnerPath(file.rel, learnerFiles)) {
      continue;
    }

    let original;

    try {
      original = fs.readFileSync(file.abs, "utf8");
    } catch {
      continue;
    }

    const clean = stripStringsAndComments(original);
    const match = BOOLEAN_LITERAL_OPERATOR.pattern.exec(clean);

    if (!match) {
      continue;
    }

    const line = clean.slice(0, match.index).split("\n").length;

    return {
      file,
      original,
      index: match.index,
      length: match[0].length,
      matchedText: match[0],
      line,
      operator: BOOLEAN_LITERAL_OPERATOR.id,
    };
  }

  return null;
}

function applyMutant(site) {
  const mutatedText = BOOLEAN_LITERAL_OPERATOR.mutate(site.matchedText);
  const content = site.original.slice(0, site.index) + mutatedText + site.original.slice(site.index + site.length);
  fs.writeFileSync(site.file.abs, content);
}

function restoreOriginal(site) {
  fs.writeFileSync(site.file.abs, site.original);
}

// Applies the mutant, runs the checkpoint against it, and restores the
// original file unconditionally — success, a failing checkpoint, or an
// exception thrown by `execute` itself. `execute` is injectable (same
// testability seam as `{ home = os.homedir() }` elsewhere in this codebase)
// so a test can force the exception path without depending on a real command
// crashing mid-run.
function testMutant(site, phase, dir, { execute = runCommand } = {}) {
  applyMutant(site);

  try {
    return execute(phase.checkpoint, dir);
  } finally {
    restoreOriginal(site);
  }
}

function formatSiteResult(site, verdict) {
  return `${site.file.rel}:${site.line} — ${site.operator} — ${verdict}`;
}

function mutateCommand({ dir, phaseId }) {
  const { config, exists } = readProgress(dir);

  if (!exists || !config) {
    fail(`No progress.json in ${dir}. Run \`ai-learn init\` first.`);
  }

  const phase = findPhase(config, phaseId);

  if (!phase) {
    fail(`No phase ${phaseId} in progress.json.`);
  }

  if (!phase.checkpoint) {
    fail(`Phase ${phase.id} ("${phase.name}") has no checkpoint command. Add "checkpoint" to progress.json.`);
  }

  log(`Mutating phase ${phase.id} — ${phase.name}`);
  log(`Checkpoint: ${phase.checkpoint}\n`);

  // Mutating code whose test already fails proves nothing — a checkpoint
  // that never passes cannot "notice" anything a mutation would do to it.
  const baseline = runCommand(phase.checkpoint, dir);

  if (!baseline.ok) {
    log("Le test était déjà rouge avant toute mutation — rien à mesurer.");
    process.exitCode = 1;
    return;
  }

  const site = findFirstSite(dir);

  if (!site) {
    log("Aucun mutant à tester : aucun site mutable trouvé dans le périmètre de l'apprenant.");
    process.exitCode = 0;
    return;
  }

  const result = testMutant(site, phase, dir);
  const survived = result.ok;
  const verdict = survived ? "SURVÉCU" : "TUÉ";

  log(formatSiteResult(site, verdict));
  log("");

  if (survived) {
    log("Un mutant a SURVÉCU : le test est passé malgré la mutation — il ne protège pas ce code.");
    process.exitCode = 1;
  } else {
    log("Le mutant a été TUÉ : le test a échoué face à la mutation — il protège ce code.");
    process.exitCode = 0;
  }
}

module.exports = {
  mutateCommand,
  findFirstSite,
  applyMutant,
  restoreOriginal,
  testMutant,
  formatSiteResult,
  invertBoolean,
  BOOLEAN_LITERAL_RE,
};
