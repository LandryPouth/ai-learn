"use strict";

// The global test-mastery ledger — `~/.ai-learn/tracks/tests.json`. Same
// home-scoped, versioned, validated shape as `tracks/git.js` (see its header
// for the `home = os.homedir()` injection rationale), but where `git.js`
// captures ambient signals, every tier here is *observed* from verify
// evidence already written under `.ai-learn/runs/` — never declared.
//
// There is no pre-existing plan listing these tiers (the roadmap only fixed
// that six exist); they are defined by story 02.05
// (epics/epic-02-tests-preuves-par-mutation/story-02-05-ledger-tests-cross-projet/plan.md,
// Decisions):
//   1 un mutant tué            — some evidence has `mutation.killed >= 1`
//   2 score 100 % sur une phase — `mutation.score === 100` with `mutants >= 1`
//   3 rouge d'abord observé    — same phase: `mutation.ok:false` then, later,
//                                `mutation.ok:true`
//   4 diversité d'opérateurs   — >= 2 distinct operators killed in the project
//   5 résiste à une re-preuve  — a 100 % phase re-proven at 100 % on changed
//                                code (different `sourceHash`)
//   6 généralisation           — tier 2 reached in >= 2 distinct projects
// A tier only ever progresses: `achieved` never goes back to false.

const os = require("os");
const path = require("path");
const { readJson } = require("../util");
const { writeLedgerFile, withoutTimestamps, canonicalizeProjects } = require("./store");
const { allEvidenceForPhase } = require("../progress");

const TIER_IDS = [1, 2, 3, 4, 5, 6];

function tracksHome({ home = os.homedir() } = {}) {
  return path.join(home, ".ai-learn", "tracks");
}

function tracksPath({ home = os.homedir() } = {}) {
  return path.join(tracksHome({ home }), "tests.json");
}

function defaultTestsTracks() {
  const tiers = {};

  for (const tier of TIER_IDS) {
    tiers[String(tier)] = { achieved: false, evidence: [] };
  }

  return { version: 1, updatedAt: null, tiers, projects: {} };
}

function readTestsTracks({ home = os.homedir() } = {}) {
  const config = readJson(tracksPath({ home }), null);
  return { config, exists: config !== null };
}

function validateTestsTracks(config) {
  const issues = [];

  if (!config || typeof config !== "object") {
    issues.push({ level: "error", message: "tracks/tests.json is not a valid object" });
    return issues;
  }

  if (config.version !== 1) {
    issues.push({ level: "error", message: `unsupported tracks/tests.json version ${config.version}` });
  }

  if (!config.tiers || typeof config.tiers !== "object") {
    issues.push({ level: "error", message: "tracks/tests.json.tiers must be an object" });
    return issues;
  }

  for (const tier of TIER_IDS) {
    const entry = config.tiers[String(tier)];

    if (!entry || typeof entry !== "object") {
      issues.push({ level: "error", message: `tier ${tier} entry missing or invalid` });
      continue;
    }
    if (typeof entry.achieved !== "boolean") {
      issues.push({ level: "error", message: `tier ${tier}.achieved must be a boolean` });
    }
    if (!Array.isArray(entry.evidence)) {
      issues.push({ level: "error", message: `tier ${tier}.evidence must be an array` });
    }
  }

  if (config.projects && typeof config.projects !== "object") {
    issues.push({ level: "error", message: "tracks/tests.json.projects must be an object" });
  }

  return issues;
}

function writeTestsTracks(config, { home = os.homedir(), before } = {}) {
  return writeLedgerFile(tracksPath({ home }), config, { before, validate: validateTestsTracks });
}

function readOrDefaultTestsTracks({ home = os.homedir() } = {}) {
  const { config } = readTestsTracks({ home });
  return config && validateTestsTracks(config).length === 0 ? config : defaultTestsTracks();
}

const measured = (ev) => ev && ev.mutation && ev.mutation.required === true && ev.mutation.mutants >= 1;
const perfect = (ev) => measured(ev) && ev.mutation.score === 100;

// Pure: what one phase's evidence history (oldest first) proves. Tiers 1, 2, 3
// and 5 are per-phase facts; `operators` feeds tier 4 across the project.
function observePhase(evidences) {
  const observed = { 1: null, 2: null, 3: null, 5: null, operators: [] };
  const operators = new Set();
  let sawRed = false;
  let perfectHash;

  for (const ev of evidences) {
    const mutation = ev && ev.mutation;

    if (!mutation || mutation.required !== true) {
      continue;
    }

    if (measured(ev) && mutation.killed >= 1 && !observed[1]) {
      observed[1] = `${mutation.killed} mutant(s) tué(s)`;
    }
    for (const operator of Array.isArray(mutation.killedOperators) ? mutation.killedOperators : []) {
      operators.add(operator);
    }
    if (perfect(ev)) {
      observed[2] = observed[2] || `score 100 % sur ${mutation.mutants} mutant(s)`;
      if (perfectHash && ev.sourceHash && ev.sourceHash !== perfectHash && !observed[5]) {
        observed[5] = "score 100 % retrouvé après un changement de code";
      }
      perfectHash = perfectHash || ev.sourceHash;
    }
    if (mutation.ok === false) {
      sawRed = true;
    } else if (mutation.ok === true && sawRed && !observed[3]) {
      observed[3] = "mutation ok:false puis ok:true observés";
    }
  }

  observed.operators = [...operators];
  return observed;
}

// Read-modify-write at phase closure, only for a verify that really passed.
// Re-reads the phase's whole evidence history (not just `verifyEvidence`) so a
// transition that happened across earlier, never-synced runs is still seen.
function syncTestsTrack({ dir, phase, verifyEvidence, home } = {}) {
  if (!phase || !verifyEvidence || verifyEvidence.ok !== true) {
    return null;
  }

  const config = readOrDefaultTestsTracks({ home });
  const before = readTestsTracks({ home }).exists ? withoutTimestamps(config) : null;
  canonicalizeProjects(config);
  const observed = observePhase(allEvidenceForPhase(dir, phase.id));
  const now = new Date().toISOString();
  const project = config.projects[dir] || {};
  const previousTiers = Array.isArray(project.tiersAchieved) ? project.tiersAchieved : [];
  const operators = [...new Set([...(Array.isArray(project.operators) ? project.operators : []), ...observed.operators])].sort();
  const tiersAchieved = new Set(previousTiers);

  const record = (tierId, detail) => {
    const tier = config.tiers[String(tierId)];
    const known = tier.evidence.some((e) => e.project === dir && e.phaseId === phase.id);

    if (!known) {
      tier.evidence.push({ at: now, project: dir, phaseId: phase.id, kind: "mutation-observed", detail, source: "evidence" });
    }
    tier.achieved = true;
    tiersAchieved.add(tierId);
  };

  for (const tierId of [1, 2, 3, 5]) {
    if (observed[tierId]) {
      record(tierId, observed[tierId]);
    }
  }
  if (operators.length >= 2) {
    record(4, `opérateurs tués : ${operators.join(", ")}`);
  }

  config.projects[dir] = { lastSyncedAt: now, tiersAchieved: [...tiersAchieved].sort(), operators };

  const withTier2 = Object.keys(config.projects).filter((p) => (config.projects[p].tiersAchieved || []).includes(2));
  if (withTier2.length >= 2) {
    record(6, `score 100 % sur ${withTier2.length} projets`);
  }

  config.updatedAt = now;
  writeTestsTracks(config, { home, before });
  return { tiersAchieved: [...tiersAchieved].sort() };
}

module.exports = {
  TIER_IDS,
  tracksHome,
  tracksPath,
  defaultTestsTracks,
  readTestsTracks,
  readOrDefaultTestsTracks,
  validateTestsTracks,
  writeTestsTracks,
  observePhase,
  syncTestsTrack,
};
