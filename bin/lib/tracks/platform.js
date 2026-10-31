"use strict";

// The global platform-skills ledger — `~/.ai-learn/tracks/platform.json`
// (story 10.03). Same home-scoped, versioned, validated shape as
// `tracks/git.js` (see its header for the `home` injection rationale), minus the
// ambient signals: a tier is `achieved` only by a passing `verify` of a phase
// the plan explicitly tagged with `platformTier` — never inferred, so a chance
// occurrence is never counted as mastery.
//
//   1 Linux & processus   2 Réseau        3 Données       4 Conteneurs
//   5 CI/CD               6 Observabilité 7 Fiabilité

const os = require("os");
const path = require("path");
const { readJson } = require("../util");
const { writeLedgerFile, withoutTimestamps, canonicalizeProjects } = require("./store");

const TIER_IDS = [1, 2, 3, 4, 5, 6, 7];

function tracksPath({ home = os.homedir() } = {}) {
  return path.join(home, ".ai-learn", "tracks", "platform.json");
}

function defaultPlatformTracks() {
  const tiers = {};

  for (const tier of TIER_IDS) {
    tiers[String(tier)] = { achieved: false, evidence: [] };
  }

  return { version: 1, updatedAt: null, tiers, projects: {} };
}

function readPlatformTracks({ home = os.homedir() } = {}) {
  const config = readJson(tracksPath({ home }), null);
  return { config, exists: config !== null };
}

function validatePlatformTracks(config) {
  const issues = [];

  if (!config || typeof config !== "object") {
    issues.push({ level: "error", message: "tracks/platform.json is not a valid object" });
    return issues;
  }

  if (config.version !== 1) {
    issues.push({ level: "error", message: `unsupported tracks/platform.json version ${config.version}` });
  }

  if (!config.tiers || typeof config.tiers !== "object") {
    issues.push({ level: "error", message: "tracks/platform.json.tiers must be an object" });
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
    issues.push({ level: "error", message: "tracks/platform.json.projects must be an object" });
  }

  return issues;
}

function writePlatformTracks(config, { home = os.homedir(), before } = {}) {
  return writeLedgerFile(tracksPath({ home }), config, { before, validate: validatePlatformTracks });
}

function readOrDefaultPlatformTracks({ home = os.homedir() } = {}) {
  const { config } = readPlatformTracks({ home });
  return config && validatePlatformTracks(config).length === 0 ? config : defaultPlatformTracks();
}

// The tiers still to prove, or null when there is no readable ledger (a
// missing or corrupt ledger must never reorder anything).
function missingPlatformTiers({ home } = {}) {
  const { config } = readPlatformTracks({ home });

  if (!config || validatePlatformTracks(config).length > 0) {
    return null;
  }

  return TIER_IDS.filter((tier) => !config.tiers[String(tier)].achieved);
}

// Read-modify-write at phase closure. Only the tier declared on the phase is
// marked, and only when the checkpoint that just ran really passed.
function syncPlatformTrack({ dir, phase, verifyEvidence, home } = {}) {
  if (!phase || !verifyEvidence || verifyEvidence.ok !== true || !TIER_IDS.includes(phase.platformTier)) {
    return null;
  }

  const config = readOrDefaultPlatformTracks({ home });
  const before = readPlatformTracks({ home }).exists ? withoutTimestamps(config) : null;
  canonicalizeProjects(config);
  const now = new Date().toISOString();
  const tier = config.tiers[String(phase.platformTier)];

  // One entry per (project, phase): re-verifying confirms, never piles up.
  if (!tier.evidence.some((e) => e.project === dir && e.phaseId === phase.id)) {
    tier.evidence.push({ at: now, project: dir, phaseId: phase.id, kind: "phase-verified", detail: phase.name, source: "artifact" });
  }
  tier.achieved = true;

  const known = config.projects[dir] && Array.isArray(config.projects[dir].tiersTouched) ? config.projects[dir].tiersTouched : [];
  config.projects[dir] = { lastSyncedAt: now, tiersTouched: [...new Set([...known, phase.platformTier])].sort() };
  config.updatedAt = now;

  writePlatformTracks(config, { home, before });
  return { tier: phase.platformTier };
}

module.exports = {
  TIER_IDS,
  tracksPath,
  defaultPlatformTracks,
  readPlatformTracks,
  validatePlatformTracks,
  writePlatformTracks,
  missingPlatformTiers,
  syncPlatformTrack,
};
