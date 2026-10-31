"use strict";

// The learning ledger: progress.json is the single source of truth for a learning
// project. It is data, not prose — committed, inspectable, and cross-checked by
// `ai-learn check` against what actually exists on disk.

const fs = require("fs");
const path = require("path");
const { readJson, writeJson } = require("./util");

const PHASE_STATUSES = ["pending", "in_progress", "done"];
const DAY_MS = 24 * 60 * 60 * 1000;

function progressPath(dir) {
  return path.join(dir, "progress.json");
}

function runsDir(dir) {
  return path.join(dir, ".ai-learn", "runs");
}

// Walks a phase's evidence files newest-first, returning the first one
// matching `predicate` (or null). Shared by `latestEvidenceForPhase` and
// `latestAnyEvidenceForPhase` below, which differ only in that predicate.
function findEvidence(dir, phaseId, predicate) {
  const runs = runsDir(dir);

  if (!fs.existsSync(runs)) {
    return null;
  }

  const files = fs.readdirSync(runs).filter((name) => name.endsWith("-verify.json")).sort().reverse();

  for (const name of files) {
    try {
      const ev = JSON.parse(fs.readFileSync(path.join(runs, name), "utf8"));

      if (ev.phaseId === phaseId && predicate(ev)) {
        return ev;
      }
    } catch {
      // Unreadable evidence is not proof; skip it.
    }
  }

  return null;
}

// The latest passing verify evidence for a phase, or null. Lives here (a
// leaf module with no further requires) rather than in status.js, which
// several modules (scan.js, check.js, next.js) import from — status.js now
// also reaches into tracks/domain.js → scan.js, so keeping this function on
// status.js would create a require cycle back into scan.js/check.js/next.js.
// status.js still re-exports it for backward compatibility.
function latestEvidenceForPhase(dir, phaseId) {
  return findEvidence(dir, phaseId, (ev) => ev.ok === true);
}

// The most recent evidence for a phase, passing or not — unlike
// `latestEvidenceForPhase`, which only ever returns a passing one.
// `check` uses this to tell a legitimate demotion (the most recent run for
// this phase failed, which is *why* it left `done` — see verify.js) apart
// from stale passing evidence nobody explained (forged, copied in, or the
// phase reset by hand without a new verify run).
function latestAnyEvidenceForPhase(dir, phaseId) {
  return findEvidence(dir, phaseId, () => true);
}

// Every readable evidence for a phase, oldest first (the reverse of
// `findEvidence`) — for callers that need to observe a transition over time
// (tracks/tests.js), not just the latest state. Chronological order relies on
// the same lexicographic file-name sort `findEvidence` already trusts.
function allEvidenceForPhase(dir, phaseId) {
  const runs = runsDir(dir);

  if (!fs.existsSync(runs)) {
    return [];
  }

  const found = [];

  for (const name of fs.readdirSync(runs).filter((n) => n.endsWith("-verify.json")).sort()) {
    try {
      const ev = JSON.parse(fs.readFileSync(path.join(runs, name), "utf8"));

      if (ev.phaseId === phaseId) {
        found.push(ev);
      }
    } catch {
      // Unreadable evidence is not proof; skip it.
    }
  }

  return found;
}

// Where a malformed JSON text breaks, as "message (ligne L, colonne C)". Node
// reports an offset only for some errors; a truncated file has none, so the
// end of the text is the position.
function jsonErrorDetail(text, error) {
  const match = /position (\d+)/.exec(error.message);
  const offset = match ? Math.min(Number(match[1]), text.length) : text.length;
  const before = text.slice(0, offset).split("\n");
  const message = error.message.replace(/\s*\(line \d+ column \d+\)/, "");
  return `${message} (ligne ${before.length}, colonne ${before[before.length - 1].length + 1})`;
}

// The message every command shows when it finds no usable progress.json. A
// file that exists but does not parse must never read as "run init": the AI
// obeys it and scaffolds a second project beside the damaged one.
function missingProgressMessage(dir) {
  const filePath = progressPath(dir);

  if (fs.existsSync(filePath)) {
    const text = fs.readFileSync(filePath, "utf8");

    try {
      JSON.parse(text);
    } catch (error) {
      return `progress.json illisible : ${jsonErrorDetail(text, error)} — corriger le fichier ; ne pas relancer \`init\``;
    }
  }

  return `No progress.json in ${dir}. Run \`ai-learn init\` first.`;
}

// Walks up from `start` to the nearest directory holding a progress.json,
// stopping before the home directory (a progress.json there is ignored) and at
// the filesystem root. Falls back to `start` so callers keep their own error.
function findProjectDir(start, home = require("os").homedir()) {
  let dir = path.resolve(start);

  for (;;) {
    if (dir === path.resolve(home)) {
      return start;
    }

    if (fs.existsSync(progressPath(dir))) {
      return dir;
    }

    const parent = path.dirname(dir);

    if (parent === dir) {
      return start;
    }

    dir = parent;
  }
}

function readProgress(dir) {
  const filePath = progressPath(dir);

  if (!fs.existsSync(filePath)) {
    return { config: null, exists: false };
  }

  return { config: readJson(filePath, null), exists: true };
}

// Structural validation of the ledger. Errors block a check; warnings do not.
function validateProgress(config) {
  const issues = [];

  if (!config || typeof config !== "object") {
    issues.push({ level: "error", message: "progress.json is not a valid object" });
    return issues;
  }

  if (config.version !== 1) {
    issues.push({ level: "error", message: `unsupported progress.json version ${config.version}` });
  }

  if (!Array.isArray(config.phases)) {
    issues.push({ level: "error", message: "progress.json.phases must be an array" });
    return issues;
  }

  const ids = new Set();

  for (const phase of config.phases) {
    if (!phase || typeof phase !== "object") {
      issues.push({ level: "error", message: "a phase entry is not an object" });
      continue;
    }

    if (typeof phase.id !== "number") {
      issues.push({ level: "error", message: "a phase has no numeric id" });
    } else if (ids.has(phase.id)) {
      issues.push({ level: "error", message: `duplicate phase id ${phase.id}` });
    } else {
      ids.add(phase.id);
    }

    if (typeof phase.name !== "string" || !phase.name) {
      issues.push({ level: "error", message: `phase ${phase.id} has no name` });
    }

    if (!PHASE_STATUSES.includes(phase.status)) {
      issues.push({ level: "error", message: `phase ${phase.id} has invalid status "${phase.status}"` });
    }

    if (phase.status === "done" && typeof phase.checkpoint !== "string") {
      issues.push({ level: "warning", message: `phase ${phase.id} is done but has no checkpoint — it cannot be proven` });
    }

    // Optional: which git/gh tier (1-6, see bin/lib/tracks/git.js) this phase
    // is deliberately teaching. Lenient — an out-of-range value is a mistake
    // worth flagging, not a reason to refuse an otherwise valid ledger.
    if (phase.gitTier !== undefined && phase.gitTier !== null) {
      if (typeof phase.gitTier !== "number" || phase.gitTier < 1 || phase.gitTier > 6) {
        issues.push({ level: "warning", message: `phase ${phase.id} has an out-of-range gitTier (${phase.gitTier}) — expected 1-6` });
      }
    }

    // Optional: the "casse réelle" checkpoint (see bin/lib/stacks/*.js's
    // `stresses` bank) — `ai-learn verify` requires both this and the base
    // `checkpoint` to pass before marking the phase done.
    if (phase.stressCheckpoint !== undefined && phase.stressCheckpoint !== null && typeof phase.stressCheckpoint !== "string") {
      issues.push({ level: "warning", message: `phase ${phase.id} has a non-string stressCheckpoint` });
    }

    // Optional: whether `ai-learn verify` must kill every mutant found in
    // this phase's scope before marking it done (story 02.03). Same lenient
    // discipline as gitTier/stressCheckpoint above — a non-boolean value is a
    // mistake worth flagging, not a reason to refuse an otherwise valid
    // ledger; `mutate.js#mutationReport` also checks `=== true` strictly, so
    // a non-boolean value never accidentally turns mutation on.
    if (phase.mutation !== undefined && phase.mutation !== null && typeof phase.mutation !== "boolean") {
      issues.push({ level: "warning", message: `phase ${phase.id} has a non-boolean mutation flag` });
    }

    // Optional: the reading budget of the phase's digest, in minutes (story
    // 06.03). A malformed value is an error, not a warning: `check` would
    // otherwise skip its over-budget warning in silence.
    if (phase.readingBudgetMin !== undefined && phase.readingBudgetMin !== null) {
      if (!Number.isInteger(phase.readingBudgetMin) || phase.readingBudgetMin <= 0) {
        issues.push({
          level: "error",
          message: `phase ${phase.id} has an invalid readingBudgetMin (${phase.readingBudgetMin}) — expected a positive integer (minutes)`,
        });
      }
    }

    // Optional: how many days a proven phase stays fresh before `next`
    // suggests revisiting it (story 07.01). Same hard discipline as
    // readingBudgetMin: a malformed value would silently disable the reminder,
    // so it is an error rather than a warning.
    if (phase.reviewAfterDays !== undefined && phase.reviewAfterDays !== null) {
      if (!Number.isInteger(phase.reviewAfterDays) || phase.reviewAfterDays <= 0) {
        issues.push({
          level: "error",
          message: `phase ${phase.id} has an invalid reviewAfterDays (${phase.reviewAfterDays}) — expected a positive integer (days)`,
        });
      }
    }
  }

  return issues;
}

function findPhase(config, id) {
  return (config && Array.isArray(config.phases) && config.phases.find((p) => p && p.id === id)) || null;
}

// When a phase was last actually proven, read off its evidence — never from a
// hand-written field. `verify` stamps `lastProvenAt` on passing evidence (the
// same instant as `generatedAt`); evidence written before that field existed
// falls back to `generatedAt` (a failed run's `null` does not), so old ledgers keep working unchanged.
function lastProvenAt(evidence) {
  if (!evidence) {
    return null;
  }

  // `lastProvenAt: null` is a failed run (verify.js): not a proof, so no
  // fallback. Only a missing field means "evidence predating the stamp".
  const stamp = evidence.lastProvenAt === undefined ? evidence.generatedAt : evidence.lastProvenAt;

  return typeof stamp === "string" && !Number.isNaN(Date.parse(stamp)) ? stamp : null;
}

// Spaced repetition (story 07.01): a done phase whose latest passing proof is
// older than its `reviewAfterDays` is due for a revisit. Pure on purpose — the
// caller passes `now` in, so day-boundary behaviour is testable without
// freezing the process clock. Returns null when the phase is not done, has no
// `reviewAfterDays`, or has no proof to age from: an absent field changes
// nothing for existing ledgers.
function revisitState({ phase, evidence, now }) {
  const days = phase && phase.reviewAfterDays;

  if (!phase || phase.status !== "done" || !Number.isInteger(days) || days <= 0) {
    return null;
  }

  const provenAt = lastProvenAt(evidence);

  if (!provenAt) {
    return null;
  }

  const ageMs = now.getTime() - Date.parse(provenAt);

  return {
    due: ageMs > days * DAY_MS,
    lastProvenAt: provenAt,
    reviewAfterDays: days,
  };
}

// The verdict of a phase's proof — the single place `check`, `status` and
// `next` all derive "is this phase actually proven" from, instead of each
// re-deriving `status × does evidence exist` its own way.
//
// Pure on purpose: every fact (the phase, its latest evidence, a freshly
// computed hash, whether a checkpoint file exists) is passed in by the
// caller. That is what lets this stay in progress.js, a leaf module — the
// hash itself needs scan.js/guard.js (see bin/lib/source-hash.js), and
// importing either here would recreate the require cycle that already forced
// `latestEvidenceForPhase` out of status.js.
//
// States: pending · in-progress · proven · proven-unhashed · stale · unproven.
// `unproven` is the only one that is still an error: a checkpoint file
// exists, the phase isn't in progress, and nothing has proven it. An
// evidence written before this field existed (`sourceHash` absent) is
// `proven-unhashed`, never `stale` — backward compatibility is a locked
// decision, not an oversight.
function phaseVerdict({ phase, evidence, currentHash, checkpointFileExists }) {
  const status = phase && phase.status;

  if (status === "done") {
    if (!evidence) {
      return { state: "unproven" };
    }

    // Story 09.02 — the contract moved: the checkpoint command in the ledger
    // is no longer the one the proof ran. Stale (re-provable with `verify`),
    // never red, and named so nobody reads it as "your code changed".
    const sameCommand = (a, b) => a.replace(/\s+/g, " ").trim() === b.replace(/\s+/g, " ").trim();

    if (typeof evidence.checkpoint === "string" && typeof phase.checkpoint === "string" && !sameCommand(evidence.checkpoint, phase.checkpoint)) {
      return { state: "stale", reason: "checkpoint-changed" };
    }

    if (!evidence.sourceHash) {
      return { state: "proven-unhashed" };
    }

    const same =
      currentHash && evidence.sourceHash.algo === currentHash.algo && evidence.sourceHash.digest === currentHash.digest;

    return { state: same ? "proven" : "stale" };
  }

  if (status === "in_progress") {
    return { state: "in-progress" };
  }

  if (checkpointFileExists && !evidence) {
    return { state: "unproven" };
  }

  return { state: "pending" };
}

function setPhaseStatus(dir, id, status) {
  const { config, exists } = readProgress(dir);

  if (!exists || !config) {
    return false;
  }

  const phase = findPhase(config, id);

  if (!phase) {
    return false;
  }

  phase.status = status;
  writeJson(progressPath(dir), config);
  return true;
}

module.exports = {
  PHASE_STATUSES,
  progressPath,
  runsDir,
  readProgress,
  missingProgressMessage,
  findProjectDir,
  validateProgress,
  findPhase,
  setPhaseStatus,
  latestEvidenceForPhase,
  latestAnyEvidenceForPhase,
  allEvidenceForPhase,
  phaseVerdict,
  lastProvenAt,
  revisitState,
};
