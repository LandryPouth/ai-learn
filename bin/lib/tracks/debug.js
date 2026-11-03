"use strict";

// The global debugging ledger — `~/.ai-learn/tracks/debug.json`. Same
// home-scoped, versioned, structurally validated shape as `tracks/git.js`: it
// follows the learner across projects. Tiers (story 10.04): 1 incident résolu,
// 2 incident de niveau 2 résolu, 3 site prédit « exact » avant la réparation.
// 4 panne d'environnement résolue (story 10.05).

const os = require("os");
const path = require("path");
const { readJson } = require("../util");
const { writeLedgerFile, withoutTimestamps, canonicalizeProjects } = require("./store");

const TIER_IDS = [1, 2, 3, 4];
// Ledgers written before story 10.05 carry tiers 1-3 only: still valid.
const REQUIRED_TIER_IDS = [1, 2, 3];

function tracksPath({ home = os.homedir() } = {}) {
  return path.join(home, ".ai-learn", "tracks", "debug.json");
}

function defaultDebugTracks() {
  const tiers = {};

  for (const tier of TIER_IDS) {
    tiers[String(tier)] = { achieved: false, evidence: [] };
  }

  return { version: 1, updatedAt: null, tiers, projects: {} };
}

function validateDebugTracks(config) {
  const issues = [];

  if (!config || typeof config !== "object") {
    return [{ level: "error", message: "tracks/debug.json is not a valid object" }];
  }

  if (config.version !== 1) {
    issues.push({ level: "error", message: `unsupported tracks/debug.json version ${config.version}` });
  }

  if (!config.tiers || typeof config.tiers !== "object") {
    issues.push({ level: "error", message: "tracks/debug.json.tiers must be an object" });
    return issues;
  }

  for (const tier of TIER_IDS) {
    const entry = config.tiers[String(tier)];

    if (entry === undefined && !REQUIRED_TIER_IDS.includes(tier)) {
      continue;
    }

    if (!entry || typeof entry !== "object") {
      issues.push({ level: "error", message: `tier ${tier} entry missing or invalid` });
    } else if (typeof entry.achieved !== "boolean" || !Array.isArray(entry.evidence)) {
      issues.push({ level: "error", message: `tier ${tier} must carry a boolean achieved and an evidence array` });
    }
  }

  if (config.secondOpinion !== undefined && !validSecondOpinion(config.secondOpinion)) {
    issues.push({ level: "error", message: "tracks/debug.json.secondOpinion is malformed" });
  }

  return issues;
}

function validSecondOpinion(value) {
  const counts = (v) => v && typeof v === "object" && ["exact", "fichier", "manque", "aucune"].every((k) => Number.isInteger(v[k]) && v[k] >= 0);

  return Boolean(value) && Number.isInteger(value.incidents) && value.incidents >= 0 && counts(value.learner) && counts(value.ai) && Number.isInteger(value.learnerExactAiMissed) && Array.isArray(value.incidentIds);
}

function readOrDefaultDebugTracks({ home = os.homedir() } = {}) {
  const config = readJson(tracksPath({ home }), null);
  return config && validateDebugTracks(config).length === 0 ? config : defaultDebugTracks();
}

// Marks the given tiers reached. One evidence entry per (incident, tier): a
// replay confirms instead of piling up. An unreadable ledger on disk is refused
// by `writeLedgerFile`, never overwritten.
function recordDebugTiers({ home, dir, incidentId, tiers, detail }) {
  const config = readOrDefaultDebugTracks({ home });
  const existing = readJson(tracksPath({ home }), null);
  const before = existing && validateDebugTracks(existing).length === 0 ? withoutTimestamps(config) : null;
  canonicalizeProjects(config);
  const now = new Date().toISOString();

  for (const tierId of tiers) {
    config.tiers[String(tierId)] = config.tiers[String(tierId)] || { achieved: false, evidence: [] };
    const tier = config.tiers[String(tierId)];
    const known = tier.evidence.some((e) => e.incidentId === incidentId);

    if (!known) {
      tier.evidence.push({ at: now, project: dir, incidentId, detail });
    }
    tier.achieved = true;
  }

  config.updatedAt = now;
  config.projects[dir] = { lastSyncedAt: now, tiersTouched: [...new Set([...((config.projects[dir] || {}).tiersTouched || []), ...tiers])].sort() };

  writeLedgerFile(tracksPath({ home }), config, { before, validate: validateDebugTracks });
  return config;
}

// Story 11.01 — the AI's second opinion, measured against the real site. A
// statistic, not a tier: it carries no "achieved". Idempotent per incident.
const VERDICT_KEYS = { exact: "exact", fichier: "fichier", "manqué": "manque", aucune: "aucune" };

function emptyVerdicts() {
  return { exact: 0, fichier: 0, manque: 0, aucune: 0 };
}

function recordSecondOpinion({ home, incidentId, learner, ai }) {
  const config = readOrDefaultDebugTracks({ home });
  const existing = readJson(tracksPath({ home }), null);
  const before = existing && validateDebugTracks(existing).length === 0 ? withoutTimestamps(config) : null;
  const opinion = config.secondOpinion || { incidents: 0, learner: emptyVerdicts(), ai: emptyVerdicts(), learnerExactAiMissed: 0, incidentIds: [] };

  if (opinion.incidentIds.includes(incidentId)) {
    return config;
  }

  const learnerKey = VERDICT_KEYS[learner] || "aucune";
  const aiKey = VERDICT_KEYS[ai] || "aucune";
  opinion.incidents += 1;
  opinion.learner[learnerKey] += 1;
  opinion.ai[aiKey] += 1;
  opinion.learnerExactAiMissed += learnerKey === "exact" && aiKey === "manque" ? 1 : 0;
  opinion.incidentIds.push(incidentId);
  config.secondOpinion = opinion;
  config.updatedAt = new Date().toISOString();
  canonicalizeProjects(config);

  writeLedgerFile(tracksPath({ home }), config, { before, validate: validateDebugTracks });
  return config;
}

module.exports = { recordSecondOpinion, TIER_IDS, tracksPath, defaultDebugTracks, readOrDefaultDebugTracks, validateDebugTracks, recordDebugTiers };
