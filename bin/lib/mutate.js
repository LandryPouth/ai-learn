"use strict";

// `ai-learn mutate --phase <id>` — mutation testing. Breaks the learner's code
// in precise, reversible ways and asks the phase's own checkpoint whether it
// notices. A test that stays green while the code underneath it changed
// behavior is a test that protects nothing — this is the mechanical way to
// see that, instead of trusting that "the test passed" means "the test
// works".
//
// Isolation is in-place + backup (in memory) + restoration, never a copy of
// the whole project — see docs/roadmap.md (locked decision) and
// epics/epic-02-tests-preuves-par-mutation/index.md (Decisions). The
// restoration is guaranteed by a `finally`, even if the checkpoint command
// itself throws.
//
// Story 02.01 shipped a single hardcoded operator and the first mutable site
// only. Story 02.02 generalizes both: a per-stack bank of operators
// (MUTATION_OPERATORS, selected per stack pack via its `mutators` field,
// mirroring `norm`), and every mutable site in the learner's scope — not just
// the first — mutated and tested one at a time.

const fs = require("fs");
const path = require("path");
const { log, fail, readJson, writeJson } = require("./util");
const { readProgress, findPhase } = require("./progress");
const { walkSources, detectStack, detectTests, stackKey, loadStack, ALL_SOURCE_EXTS } = require("./scan");
const { loadGuardConfig, matchesLearnerPath } = require("./guard");
const { stripStringsAndComments } = require("./norm");
const { runCommand } = require("./exec");

const DEFAULT_MAX_MUTANTS_PER_RUN = 50;

// Used when a detected stack has no `mutators` field at all (a third-party or
// future pack) — boolean literal is the one operator safe for any language's
// syntax, same fallback spirit as generic.js.
const FALLBACK_MUTATORS = ["boolean-literal"];

// `comparison-operator`'s lone `<`/`>` alternatives cannot tell a real
// comparison from a JSX tag delimiter (`<div>`, `</div>`) — regex has no
// notion of "this angle bracket opens markup" the way it can spot `=>`/`->`
// immediately to one side of `>`. Rather than guess, JSX-bearing files are
// excluded from this operator entirely (boolean-literal still applies) —
// same under-detect-over-guess discipline as the rest of this codebase (see
// module header). Plain `.ts`/`.js` generics (`Array<string>`) are a
// narrower, accepted residual risk — see plan.md Decisions.
const JSX_EXTS = new Set([".jsx", ".tsx"]);

// Word-bounded so `truely`/`falsey` never match — same discipline as
// `norm.js`'s brace strategy: under-detect rather than guess.
function invertBoolean(text) {
  return text === "true" ? "false" : "true";
}

// Boundary-condition mutation (`<` ↔ `<=`, `>` ↔ `>=`) — the classic mutator
// that reveals an off-by-one comparison, not a direction flip. The `>` of an
// arrow function (`=>`) is excluded by the pattern's negative lookbehind
// below, never by this function: by the time `mutate` runs, the matched text
// is always a real comparison operator.
function invertComparison(text) {
  switch (text) {
    case "<":
      return "<=";
    case "<=":
      return "<";
    case ">":
      return ">=";
    case ">=":
      return ">";
    default:
      return text;
  }
}

// Canonical bank of mutation operators, keyed by id. Stack packs only select
// which ids apply to them (`mutators: [...]`, a plain string list — same
// JSON-serializable shape `.ai-learn/mutate.json` persists); the actual
// pattern/mutate implementation lives here once, never duplicated per stack.
const MUTATION_OPERATORS = {
  "boolean-literal": {
    id: "boolean-literal",
    pattern: /\b(?:true|false)\b/,
    mutate: invertBoolean,
  },
  // `<=`/`>=` tried before the lone `<`/`>` alternatives so a compound
  // operator is never split. The lone `>` excludes the one immediately
  // preceded by `=` (an arrow function's `=>`) or by `-` (C's pointer/struct
  // access `->`) — otherwise every arrow function or struct dereference in
  // the scanned scope would be "mutable" into a syntax error, producing
  // meaningless SURVÉCU/TUÉ verdicts on code that was never a real
  // comparison. JSX tag brackets (`<div>`) are not excludable this way — a
  // JSX file's sites for this operator are dropped entirely, see JSX_EXTS.
  "comparison-operator": {
    id: "comparison-operator",
    pattern: /<=|>=|<|(?<![=-])>/,
    mutate: invertComparison,
  },
};

function mutateConfigPath(dir) {
  return path.join(dir, ".ai-learn", "mutate.json");
}

function loadMutateConfig(dir) {
  const config = readJson(mutateConfigPath(dir), null);

  // `maxMutantsPerRun <= 0` would slice every run's site list down to zero
  // mutants tested while still reporting `ok: true` (nothing survived because
  // nothing ran) — silently defeating the whole hard block story 02.03 adds.
  // Floored at 1 so the field can only ever narrow a run, never disable
  // mutation testing outright (review finding, story 02.03).
  const rawMax = config && config.maxMutantsPerRun;
  const maxMutantsPerRun = Number.isFinite(rawMax) && rawMax >= 1 ? rawMax : DEFAULT_MAX_MUTANTS_PER_RUN;

  return {
    mutators: config && Array.isArray(config.mutators) ? config.mutators : null,
    maxMutantsPerRun,
    ignore: config && Array.isArray(config.ignore) ? config.ignore : [],
  };
}

// Auto-created once by init/update, mirroring ensureNormConfig exactly:
// concrete resolved operator ids written so the file is immediately
// discoverable/editable, never rewritten once present.
function ensureMutateConfig(dir, language) {
  const configPath = mutateConfigPath(dir);
  if (fs.existsSync(configPath)) return { created: false };

  const stack = loadStack(stackKey(language));
  const bankIds = Array.isArray(stack.mutators) ? stack.mutators : FALLBACK_MUTATORS;

  writeJson(configPath, {
    version: 1,
    mutators: bankIds,
    maxMutantsPerRun: DEFAULT_MAX_MUTANTS_PER_RUN,
    ignore: [],
  });

  return { created: true };
}

// Resolves the active operator objects for this project: config override (if
// present) filtered against the canonical bank, falling back to the detected
// stack's own bank, falling back to FALLBACK_MUTATORS — same three-level
// fallback shape as `norm.js#resolveThresholds`. An id the bank/canonical map
// no longer recognizes is silently dropped rather than erroring — a stale
// `.ai-learn/mutate.json` referencing a removed operator should not block
// `mutate`.
function resolveMutators(dir, language) {
  const stack = loadStack(stackKey(language));
  const bankIds = Array.isArray(stack.mutators) ? stack.mutators : FALLBACK_MUTATORS;
  const { mutators: overrideIds } = loadMutateConfig(dir);
  const activeIds = Array.isArray(overrideIds) ? overrideIds : bankIds;

  return activeIds.map((id) => MUTATION_OPERATORS[id]).filter(Boolean);
}

// Finds every mutable site in one already-whitened source text, across every
// active operator, in first-occurrence order. Whitened text preserves length
// and newlines exactly (`stripStringsAndComments`), so an index found here
// maps 1:1 onto the real source text.
function detectAllSites(clean, mutators) {
  const sites = [];

  for (const operator of mutators) {
    const flags = operator.pattern.flags.includes("g") ? operator.pattern.flags : `${operator.pattern.flags}g`;
    const re = new RegExp(operator.pattern.source, flags);
    let match = re.exec(clean);

    while (match !== null) {
      sites.push({
        index: match.index,
        length: match[0].length,
        matchedText: match[0],
        operator: operator.id,
        mutate: operator.mutate,
      });

      if (match[0].length === 0) {
        re.lastIndex += 1;
      }

      match = re.exec(clean);
    }
  }

  sites.sort((a, b) => a.index - b.index);
  return sites;
}

// Walks the learner's own files (`learnerFiles`, same scope as
// `norm.js#normProject` and the epic 01 source hash — never a hardcoded
// `src/**`), restricted to `ALL_SOURCE_EXTS` and excluding test files
// (`detectTests`) exactly like `norm.js#normProject` — a boolean literal or
// comparison sitting in prose, a data file, or the learner's own test file is
// never picked as a mutant: it isn't code the checkpoint is meant to protect.
// `.ai-learn/mutate.json#ignore` follows the same glob as `norm.json#ignore`.
function findAllSites(dir) {
  const walked = walkSources(dir);
  const stack = detectStack(dir, walked.files);
  const mutators = resolveMutators(dir, stack.language);
  const { learnerFiles } = loadGuardConfig(dir);
  const testRels = new Set(detectTests(walked.files).files.map((f) => f.rel));
  const { ignore } = loadMutateConfig(dir);

  const sites = [];

  for (const file of walked.files) {
    if (file.binary) continue;
    if (!ALL_SOURCE_EXTS.has(file.ext)) continue;
    if (testRels.has(file.rel)) continue;
    if (!matchesLearnerPath(file.rel, learnerFiles)) continue;
    if (ignore.length > 0 && matchesLearnerPath(file.rel, ignore)) continue;

    let original;

    try {
      original = fs.readFileSync(file.abs, "utf8");
    } catch {
      continue;
    }

    const clean = stripStringsAndComments(original);
    const fileMutators = JSX_EXTS.has(file.ext) ? mutators.filter((op) => op.id !== "comparison-operator") : mutators;

    for (const site of detectAllSites(clean, fileMutators)) {
      sites.push({
        file,
        original,
        index: site.index,
        length: site.length,
        matchedText: site.matchedText,
        mutate: site.mutate,
        operator: site.operator,
        line: clean.slice(0, site.index).split("\n").length,
      });
    }
  }

  return sites;
}

function applyMutant(site) {
  const mutatedText = site.mutate(site.matchedText);
  const content = site.original.slice(0, site.index) + mutatedText + site.original.slice(site.index + site.length);
  fs.writeFileSync(site.file.abs, content);
}

function restoreOriginal(site) {
  fs.writeFileSync(site.file.abs, site.original);
}

function mutateLockPath(dir) {
  return path.join(dir, ".ai-learn", "mutate.lock.json");
}

// A `.ai-learn/mutate.lock.json` present at startup means a previous
// `mutate` was interrupted (`kill -9`, a crash) while a mutant was in place —
// the in-memory backup a run keeps while it is alive is gone with the
// process, but this file (written just before the mutation, deleted just
// after a successful restore) survives it. Restoring here, before this run's
// own detection even starts, means the learner never has to notice a mutated
// file by hand. A missing or unreadable original target is recreated rather
// than treated as an error — the crash already happened, this is repair.
function recoverOrphanLock(dir) {
  const lockPath = mutateLockPath(dir);
  const lock = readJson(lockPath, null);

  if (!lock || typeof lock.file !== "string" || typeof lock.original !== "string") {
    return null;
  }

  const target = path.join(dir, lock.file);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, lock.original);
  fs.unlinkSync(lockPath);

  return lock.file;
}

// Shared by both callers that must self-heal from an orphan lock before
// doing anything else (`mutateCommand` and `verify.js#verifyCommand`) — same
// recovery, same announcement to the learner, one place to change the
// wording if it ever needs to (review finding, story 02.03).
function recoverOrphanLockAndLog(dir) {
  const recovered = recoverOrphanLock(dir);

  if (recovered) {
    log(`Un run précédent a été interrompu : ${recovered} a été restauré à son état d'origine — rien n'est perdu.\n`);
  }

  return recovered;
}

// Applies the mutant, runs the checkpoint against it, and restores the
// original file unconditionally — success, a failing checkpoint, or an
// exception thrown by `execute` itself. The recovery lock is written just
// before the mutation and removed only after a successful restore, so a
// crash anywhere in between leaves exactly the trail `recoverOrphanLock`
// expects. `execute` is injectable (same testability seam as
// `{ home = os.homedir() }` elsewhere in this codebase) so a test can force
// the exception path without depending on a real command crashing mid-run.
function testMutant(site, phase, dir, { execute = runCommand } = {}) {
  const lockPath = mutateLockPath(dir);
  writeJson(lockPath, { file: site.file.rel, original: site.original });
  applyMutant(site);

  try {
    return execute(phase.checkpoint, dir);
  } finally {
    restoreOriginal(site);
    if (fs.existsSync(lockPath)) {
      fs.unlinkSync(lockPath);
    }
  }
}

function formatSiteResult(site, verdict) {
  return `${site.file.rel}:${site.line} — ${site.operator} — ${verdict}`;
}

// `total = 0` never happens here (mutateCommand returns early on zero sites)
// but stays a named case rather than a naked division so a future caller
// cannot silently render "0%"/"100%" for "nothing was measured".
function formatScore(killed, total) {
  if (total === 0) {
    return "aucun site mutable — rien à mesurer";
  }
  return `${Math.round((killed / total) * 100)}%`;
}

// Stable "not computed" shape, shared by two callers: `mutationReport` itself
// when `phase.mutation` was never requested (`required: false`), and
// `verify.js` when it *was* requested but the base checkpoint had already
// failed, so the mutation engine was never invoked (`required: true`,
// `ok` still `true` — the base checkpoint's own failure is what fails verify,
// never an unmeasured mutation score; see plan.md Decisions).
function emptyMutationReport(required) {
  return { required, ok: true, mutants: 0, killed: 0, survived: [], score: null, truncated: false };
}

// `verify.js`'s pure fact-gathering call, mirroring
// `predictions.js#predictionsReport` exactly: reads/mutates the filesystem to
// produce a report object, never logs anything itself. Story 02.03: reuses
// the full 02-02 engine (bank, config, lock) one mutant at a time, exactly
// like `mutateCommand`, but returns a fact object instead of writing to the
// console/exit code. Assumes the base checkpoint already passed — that guard
// belongs to the caller (verify.js), explicitly, not hidden here (plan.md
// Decisions: "passer ce garde-fou explicitement, pas implicitement").
//
// `phase.mutation` is checked with strict `=== true`, not a truthiness
// coercion: a non-boolean value (a mistake `progress.js#validateProgress`
// already warns about) must never accidentally turn mutation on for a phase
// that didn't ask for it (spec.md Acceptance Criteria).
function mutationReport({ dir, phase }) {
  if (phase.mutation !== true) {
    return emptyMutationReport(false);
  }

  const allSites = findAllSites(dir);

  if (allSites.length === 0) {
    return emptyMutationReport(true);
  }

  const { maxMutantsPerRun } = loadMutateConfig(dir);
  const sites = allSites.slice(0, maxMutantsPerRun);
  const truncated = allSites.length > sites.length;

  let killed = 0;
  const survived = [];

  for (const site of sites) {
    const result = testMutant(site, phase, dir);

    if (result.ok) {
      survived.push({ file: site.file.rel, line: site.line, operator: site.operator });
    } else {
      killed += 1;
    }
  }

  return {
    required: true,
    ok: survived.length === 0,
    mutants: sites.length,
    killed,
    survived,
    // `sites.length` is guaranteed >= 1 by the `maxMutantsPerRun` floor in
    // `loadMutateConfig` — this guard is defense in depth for the contract
    // itself (`score: null` when nothing was measured), not for a path
    // currently reachable.
    score: sites.length === 0 ? null : Math.round((killed / sites.length) * 100),
    truncated,
  };
}

// Shared by `verify` so its blocking message never reads different words than
// `ai-learn mutate`'s own report for the same site — same discipline as
// `predictions.js#formatPredictionsGap`. The per-site detail line reuses the
// exact `fichier:ligne — opérateur — SURVÉCU` vocabulary `formatSiteResult`
// already prints (UX Notes, plan.md): never a second vocabulary for the same
// fact.
function formatMutationGap(phase, report) {
  return `phase ${phase.id}: ${report.killed}/${report.mutants} mutants tués, ${report.survived.length} survécu(s)`;
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

  recoverOrphanLockAndLog(dir);

  // Mutating code whose test already fails proves nothing — a checkpoint
  // that never passes cannot "notice" anything a mutation would do to it.
  const baseline = runCommand(phase.checkpoint, dir);

  if (!baseline.ok) {
    log("Le test était déjà rouge avant toute mutation — rien à mesurer.");
    process.exitCode = 1;
    return;
  }

  const allSites = findAllSites(dir);

  if (allSites.length === 0) {
    log("Aucun mutant à tester : aucun site mutable trouvé dans le périmètre de l'apprenant.");
    process.exitCode = 0;
    return;
  }

  const { maxMutantsPerRun } = loadMutateConfig(dir);
  const sites = allSites.slice(0, maxMutantsPerRun);

  if (allSites.length > sites.length) {
    log(
      `Plafond de ${maxMutantsPerRun} mutant(s) par run atteint — ${allSites.length - sites.length} site(s) supplémentaire(s) non testé(s) cette fois.\n`,
    );
  }

  let killed = 0;
  let anySurvived = false;

  for (const site of sites) {
    const result = testMutant(site, phase, dir);
    const survived = result.ok;

    if (survived) {
      anySurvived = true;
    } else {
      killed += 1;
    }

    log(formatSiteResult(site, survived ? "SURVÉCU" : "TUÉ"));
  }

  log("");
  log(`Score de mutation : ${formatScore(killed, sites.length)}`);

  if (anySurvived) {
    log("Au moins un mutant a SURVÉCU : un test est passé malgré une mutation — il ne protège pas ce code.");
    process.exitCode = 1;
  } else {
    log("Tous les mutants ont été TUÉS : les tests protègent ce code.");
    process.exitCode = 0;
  }
}

module.exports = {
  mutateCommand,
  findAllSites,
  detectAllSites,
  applyMutant,
  restoreOriginal,
  testMutant,
  formatSiteResult,
  formatScore,
  invertBoolean,
  invertComparison,
  mutateConfigPath,
  loadMutateConfig,
  ensureMutateConfig,
  resolveMutators,
  mutateLockPath,
  recoverOrphanLock,
  recoverOrphanLockAndLog,
  MUTATION_OPERATORS,
  mutationReport,
  formatMutationGap,
  emptyMutationReport,
};
