"use strict";

// The domain mastery ledger — `~/.ai-learn/domains/<stack-key>.json`. Where
// `tracks/git.js` is domain-agnostic (git/gh apply everywhere), this one is
// the opposite: it accumulates concept mastery *within* one stack, across
// every project the learner has built in it, so "3 projects → expert" is a
// real, falsifiable status instead of a hardcoded counter (see docs/plans —
// Partie C).
//
// Same home-scoped, injectable-`home` pattern as tracks/git.js. Reuses
// scan.js's own detection engine (`walkSources`, `detectStack`,
// `detectConcepts`, `loadStack`, `stackKey`) rather than re-implementing
// concept detection a second time.

const os = require("os");
const path = require("path");
const { readJson, writeJson } = require("../util");
const { walkSources, detectStack, detectConcepts, loadStack, stackKey } = require("../scan");

function domainsHome({ home = os.homedir() } = {}) {
  return path.join(home, ".ai-learn", "domains");
}

// The ledger is keyed by the *detected* stack key (see detectDomainKey
// below), not by the free-text `technology` string a learner types at
// `/learn` time — "React", "Node CLI", and "API web" all resolve to the same
// "javascript" stack key and the same concept bank, so they must accumulate
// into the same ledger rather than three disconnected ones.
function slugifyTechnology(key) {
  const slug = String(key || "generic")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "generic";
}

function domainPath({ technology, home = os.homedir() } = {}) {
  return path.join(domainsHome({ home }), `${slugifyTechnology(technology)}.json`);
}

function defaultDomainLedger(technology) {
  return {
    version: 1,
    technology: slugifyTechnology(technology),
    updatedAt: null,
    concepts: {},
    directionsCompleted: [],
    projects: {},
  };
}

function readDomainLedger({ technology, home = os.homedir() } = {}) {
  const file = domainPath({ technology, home });
  const config = readJson(file, null);
  return { config, exists: config !== null };
}

// Same "structurally validated, never silently trusted" contract as
// progress.js#validateProgress and tracks/git.js#validateGitTracks.
function validateDomainLedger(config) {
  const issues = [];

  if (!config || typeof config !== "object") {
    issues.push({ level: "error", message: "domain ledger is not a valid object" });
    return issues;
  }

  if (config.version !== 1) {
    issues.push({ level: "error", message: `unsupported domain ledger version ${config.version}` });
  }
  if (!config.concepts || typeof config.concepts !== "object") {
    issues.push({ level: "error", message: "domain ledger .concepts must be an object" });
  }
  if (!Array.isArray(config.directionsCompleted)) {
    issues.push({ level: "error", message: "domain ledger .directionsCompleted must be an array" });
  }
  if (!config.projects || typeof config.projects !== "object") {
    issues.push({ level: "error", message: "domain ledger .projects must be an object" });
  }

  return issues;
}

function writeDomainLedger(config, { home = os.homedir() } = {}) {
  writeJson(domainPath({ technology: config.technology, home }), config);
}

function readOrDefaultDomainLedger({ technology, home = os.homedir() } = {}) {
  const { config } = readDomainLedger({ technology, home });
  return config && validateDomainLedger(config).length === 0 ? config : defaultDomainLedger(technology);
}

// The real stack key for a project, detected from its actual code — see the
// module comment above for why this, and not `progress.json`'s free-text
// `technology` field, is what keys the ledger.
function detectDomainKey(dir) {
  const walked = walkSources(dir);
  const stack = detectStack(dir, walked.files);
  return { key: stackKey(stack.language), stack, walked };
}

// Read-modify-write at phase closure (same call site + isolation contract as
// tracks/git.js#syncGitTrack: called from verify.js right after a real pass,
// wrapped in its own try/catch there). A concept already `achieved` never
// regresses — `firstProject`/`evidenceDate` are set once, on first proof,
// and never overwritten by a later project that merely confirms it again.
function syncDomainLedger({ dir, verifyEvidence, home } = {}) {
  if (!verifyEvidence || verifyEvidence.ok !== true) {
    return null;
  }

  const { key, stack, walked } = detectDomainKey(dir);
  const detected = detectConcepts(stack.language, walked.files);

  const config = readOrDefaultDomainLedger({ technology: key, home });
  const now = new Date().toISOString();
  const touched = [];

  for (const concept of detected.used) {
    const existing = config.concepts[concept.id];

    if (!existing || !existing.achieved) {
      config.concepts[concept.id] = {
        achieved: true,
        tier: concept.tier,
        firstProject: existing ? existing.firstProject : dir,
        evidenceDate: existing ? existing.evidenceDate : now,
      };
      touched.push(concept.id);
    }
  }

  config.updatedAt = now;
  const previous =
    config.projects[dir] && Array.isArray(config.projects[dir].conceptsContributed)
      ? config.projects[dir].conceptsContributed
      : [];
  config.projects[dir] = { lastSyncedAt: now, conceptsContributed: [...new Set([...previous, ...touched])] };

  writeDomainLedger(config, { home });
  return { key, touched };
}

// Coverage + "Expert" status. For a stack with a real concept bank
// (javascript.js, c.js…): concepts achieved / concepts in the bank — the
// falsifiable, evidence-derived answer to "3 projects → expert". For a stack
// with no concept bank (generic.js's `concepts: []`, any untracked
// language): falls back to directions/recipes completed vs. the bank size,
// otherwise "expert" would be permanently unreachable for anything untracked.
function domainSummary({ technology, home = os.homedir() } = {}) {
  const { config, exists } = readDomainLedger({ technology, home });

  if (!exists || !config) {
    return null;
  }

  const key = slugifyTechnology(technology);
  const pack = loadStack(key);
  const bankConcepts = pack.concepts || [];

  if (bankConcepts.length > 0) {
    const totalIds = bankConcepts.map((concept) => concept.id);
    const achievedIds = totalIds.filter((id) => config.concepts[id] && config.concepts[id].achieved);

    return {
      technology: key,
      metric: "concepts",
      achieved: achievedIds.length,
      total: totalIds.length,
      coverage: achievedIds.length / totalIds.length,
      expert: achievedIds.length === totalIds.length,
      missing: totalIds.filter((id) => !achievedIds.includes(id)),
    };
  }

  const directionBank = [...(pack.directions || []), ...(pack.recipes || [])];
  const totalIds = directionBank.map((entry) => entry.id);
  const doneIds = totalIds.filter((id) => config.directionsCompleted.includes(id));

  return {
    technology: key,
    metric: "directions",
    achieved: doneIds.length,
    total: totalIds.length,
    coverage: totalIds.length > 0 ? doneIds.length / totalIds.length : 0,
    expert: totalIds.length > 0 && doneIds.length === totalIds.length,
    missing: totalIds.filter((id) => !doneIds.includes(id)),
  };
}

module.exports = {
  domainsHome,
  slugifyTechnology,
  domainPath,
  defaultDomainLedger,
  readDomainLedger,
  readOrDefaultDomainLedger,
  validateDomainLedger,
  writeDomainLedger,
  detectDomainKey,
  syncDomainLedger,
  domainSummary,
};
