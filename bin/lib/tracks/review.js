"use strict";

// The global review-kata ledger — `~/.ai-learn/tracks/review.json` (story
// 12.03). Same home-scoped, versioned, structurally validated shape as
// `tracks/debug.js`. Tiers: 1 first kata revealed with a review, 2 every
// defect found with at most one false positive, 3 half the defects of a
// kata on someone else's code (story 12.04). `katas` keeps one line per
// revealed kata (idempotent per id) for the `status` summary.

const os = require("os");
const path = require("path");
const { readJson } = require("../util");
const { writeLedgerFile, withoutTimestamps, canonicalizeProjects } = require("./store");

// Tier 3 (story 12.04) is optional on disk: ledgers written before it stay valid.
const TIER_IDS = [1, 2, 3];
const REQUIRED_TIERS = [1, 2];

function tracksPath({ home = os.homedir() } = {}) {
  return path.join(home, ".ai-learn", "tracks", "review.json");
}

function defaultReviewTracks() {
  const tiers = {};

  for (const tier of TIER_IDS) {
    tiers[String(tier)] = { achieved: false, evidence: [] };
  }

  return { version: 1, updatedAt: null, tiers, katas: [], projects: {} };
}

function validateReviewTracks(config) {
  const issues = [];

  if (!config || typeof config !== "object") {
    return [{ level: "error", message: "tracks/review.json is not a valid object" }];
  }

  if (config.version !== 1) {
    issues.push({ level: "error", message: `unsupported tracks/review.json version ${config.version}` });
  }

  if (!config.tiers || typeof config.tiers !== "object") {
    issues.push({ level: "error", message: "tracks/review.json.tiers must be an object" });
    return issues;
  }

  for (const tier of TIER_IDS) {
    const entry = config.tiers[String(tier)];

    if (entry === undefined && !REQUIRED_TIERS.includes(tier)) {
      continue;
    }

    if (!entry || typeof entry !== "object" || typeof entry.achieved !== "boolean" || !Array.isArray(entry.evidence)) {
      issues.push({ level: "error", message: `tier ${tier} must carry a boolean achieved and an evidence array` });
    }
  }

  if (!Array.isArray(config.katas) || config.katas.some((kata) => !kata || !Number.isInteger(kata.found) || !Number.isInteger(kata.total))) {
    issues.push({ level: "error", message: "tracks/review.json.katas must be an array of { id, found, total } entries" });
  }

  return issues;
}

function readOrDefaultReviewTracks({ home = os.homedir() } = {}) {
  const config = readJson(tracksPath({ home }), null);
  return config && validateReviewTracks(config).length === 0 ? withAllTiers(config) : defaultReviewTracks();
}

function withAllTiers(config) {
  for (const tier of TIER_IDS) {
    config.tiers[String(tier)] = config.tiers[String(tier)] || { achieved: false, evidence: [] };
  }

  return config;
}

// Records one revealed kata. An unreadable ledger on disk is refused by
// `writeLedgerFile`, never overwritten; a replay of the same kata id confirms
// instead of piling up.
function recordReviewKata({ home, dir, kataId, found, total, falsePositives, tiers }) {
  const config = readOrDefaultReviewTracks({ home });
  const existing = readJson(tracksPath({ home }), null);
  const before = existing && validateReviewTracks(existing).length === 0 ? withoutTimestamps(config) : null;
  canonicalizeProjects(config);
  const now = new Date().toISOString();

  if (!config.katas.some((kata) => kata.id === kataId)) {
    config.katas.push({ id: kataId, at: now, project: dir, found, total, falsePositives });
  }

  for (const tierId of tiers) {
    const tier = config.tiers[String(tierId)];

    if (!tier.evidence.some((e) => e.kataId === kataId)) {
      tier.evidence.push({ at: now, project: dir, kataId, detail: `${found}/${total} défauts, ${falsePositives} faux positif(s)` });
    }
    tier.achieved = true;
  }

  config.updatedAt = now;
  config.projects[dir] = { lastSyncedAt: now, tiersTouched: [...new Set([...((config.projects[dir] || {}).tiersTouched || []), ...tiers])].sort() };

  writeLedgerFile(tracksPath({ home }), config, { before, validate: validateReviewTracks });
  return config;
}

// `{ katas, rate }` — the mean share of defects found, null before any kata.
function reviewSummary({ home } = {}) {
  const { katas } = readOrDefaultReviewTracks({ home });
  const total = katas.reduce((sum, kata) => sum + kata.total, 0);

  return katas.length === 0 ? null : { katas: katas.length, rate: total > 0 ? katas.reduce((sum, kata) => sum + kata.found, 0) / total : 0 };
}

module.exports = { TIER_IDS, tracksPath, defaultReviewTracks, readOrDefaultReviewTracks, validateReviewTracks, recordReviewKata, reviewSummary };
