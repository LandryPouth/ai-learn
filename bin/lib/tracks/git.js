"use strict";

// The global git/gh mastery ledger — `~/.ai-learn/tracks/git.json`. Unlike
// `progress.json` (per learning project, reset with every new project), this
// tracks git/gh tier mastery *across* every project the learner has worked
// in, so it is never re-taught from tier 1 in project #2. First home-scoped
// `.ai-learn` state in the codebase — mirrors the `home = os.homedir()`
// injection pattern already used by `install.js#installCommand`, which is
// what makes this testable without touching the real `$HOME` (see
// `test/tracks-git.test.js`, same `tmpHome()` shape as `test/install.test.js`).
//
// Same schema/validation *shape* as `progress.js` (versioned, structurally
// validated) — not a parallel format, the same discipline applied to a
// different, home-scoped file.

const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");
const { readJson, writeJson } = require("../util");

// The tier bank this ledger tracks (see docs/plans — Partie A of the git/gh
// module plan): 1 vocabulaire+format de commit, 2 diff/stash/restore, 3
// branches+conflit réel, 4 amend/rebase -i/cherry-pick, 5 workflow PR via gh,
// 6 lecture de diffs/commits d'autrui.
const TIER_IDS = [1, 2, 3, 4, 5, 6];

function tracksHome({ home = os.homedir() } = {}) {
  return path.join(home, ".ai-learn", "tracks");
}

function tracksPath({ home = os.homedir() } = {}) {
  return path.join(tracksHome({ home }), "git.json");
}

function defaultGitTracks() {
  const tiers = {};

  for (const tier of TIER_IDS) {
    tiers[String(tier)] = { achieved: false, evidence: [] };
  }

  return { version: 1, updatedAt: null, tiers, projects: {} };
}

function readGitTracks({ home = os.homedir() } = {}) {
  const file = tracksPath({ home });
  const config = readJson(file, null);
  return { config, exists: config !== null };
}

// Same "structurally validated, errors vs nothing" contract as
// `progress.js#validateProgress` — a corrupt or hand-edited ledger is
// reported, never silently trusted.
function validateGitTracks(config) {
  const issues = [];

  if (!config || typeof config !== "object") {
    issues.push({ level: "error", message: "tracks/git.json is not a valid object" });
    return issues;
  }

  if (config.version !== 1) {
    issues.push({ level: "error", message: `unsupported tracks/git.json version ${config.version}` });
  }

  if (!config.tiers || typeof config.tiers !== "object") {
    issues.push({ level: "error", message: "tracks/git.json.tiers must be an object" });
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
    issues.push({ level: "error", message: "tracks/git.json.projects must be an object" });
  }

  return issues;
}

function writeGitTracks(config, { home = os.homedir() } = {}) {
  writeJson(tracksPath({ home }), config);
}

// Read the ledger, or hand back a fresh default (never written to disk here
// — callers that intend to mutate it call `writeGitTracks` themselves once
// they've made a real change, so a read-only caller like `status.js` never
// creates a ledger file just by looking at it).
function readOrDefaultGitTracks({ home = os.homedir() } = {}) {
  const { config } = readGitTracks({ home });
  return config && validateGitTracks(config).length === 0 ? config : defaultGitTracks();
}

// --- signal capture --------------------------------------------------------
//
// Best-effort, fail-open readers — same contract as `gitState()` in scan.js:
// never throw, missing git/gh or an unauthenticated `gh` silently yields an
// empty signal, never a crash. These do NOT independently re-prove a tier —
// the phase's own scripted checkpoint (already verified by `verify.js`
// before this runs) is the proof. This durably captures the fleeting local
// signals (the reflog expires, ~90 days, and is absent after a fresh clone)
// that corroborate it, before they disappear.

function spawnGit(dir, args) {
  try {
    const res = spawnSync("git", ["-C", dir, ...args], { encoding: "utf8" });
    return res.status === 0 ? res.stdout : null;
  } catch {
    return null;
  }
}

function captureGitSignals(dir) {
  const signals = {
    reflog: { amend: false, rebase: false, cherryPick: false },
    stash: { count: 0 },
    merge: null,
    gh: { available: false, prs: [] },
  };

  if (!fs.existsSync(path.join(dir, ".git"))) {
    return signals;
  }

  const reflog = spawnGit(dir, ["reflog", "show", "HEAD"]);

  if (reflog) {
    signals.reflog.amend = /commit \(amend\):/.test(reflog);
    signals.reflog.rebase = /rebase \(/.test(reflog);
    signals.reflog.cherryPick = /cherry-pick:/.test(reflog);
  }

  // `refs/stash`'s own reflog persists longer than HEAD's — a better signal
  // for tier 2 than piggybacking on the same expiring HEAD reflog above.
  const stashList = spawnGit(dir, ["stash", "list"]);

  if (stashList !== null) {
    signals.stash.count = stashList.split("\n").filter(Boolean).length;
  }

  // A merge commit is a durable pointer, not an expiring one — the real
  // proof that a conflict was provoked and resolved lives in the phase's own
  // checkpoint evidence; this is only a cross-reference to it.
  const mergeLog = spawnGit(dir, ["log", "--merges", "--format=%H %cI", "-1"]);

  if (mergeLog && mergeLog.trim()) {
    const [hash, at] = mergeLog.trim().split(" ");
    signals.merge = { hash, at };
  }

  try {
    const gh = spawnSync(
      "gh",
      ["pr", "list", "--author=@me", "--state=all", "--json", "number,title,mergedAt,url"],
      { cwd: dir, encoding: "utf8" },
    );

    if (gh.status === 0) {
      const prs = JSON.parse(gh.stdout);
      signals.gh = { available: true, prs: Array.isArray(prs) ? prs : [] };
    }
  } catch {
    // gh absent, unauthenticated, or unparsable output — stays unavailable
  }

  return signals;
}

// Read-modify-write the ledger at phase closure. Only the tier explicitly
// declared on the phase (`phase.gitTier`) is ever marked `achieved` — and
// only when the checkpoint that was just run really passed
// (`verifyEvidence.ok`). Ambient git/gh usage picked up by `captureGitSignals`
// during an untagged phase is still recorded (useful evidence for `ai-learn
// check`/debugging) but never silently counts as "mastered" — the same
// "provoked, not left to chance" discipline tiers 3/4 already apply to phase
// design, applied here to the ledger itself.
function syncGitTrack({ dir, phase, verifyEvidence, home } = {}) {
  if (!phase || !verifyEvidence || verifyEvidence.ok !== true) {
    return null;
  }

  const signals = captureGitSignals(dir);
  const config = readOrDefaultGitTracks({ home });
  const now = new Date().toISOString();
  const touchedTiers = [];

  const record = (tierId, kind, detail, source, achieved) => {
    const tier = config.tiers[String(tierId)];
    tier.evidence.push({ at: now, project: dir, phaseId: phase.id, kind, detail, source });
    if (achieved) {
      tier.achieved = true;
    }
    if (!touchedTiers.includes(tierId)) {
      touchedTiers.push(tierId);
    }
  };

  if (TIER_IDS.includes(phase.gitTier)) {
    record(phase.gitTier, "phase-verified", phase.name, "artifact", true);
  }

  if (signals.reflog.amend) {
    record(4, "amend", "reflog: commit (amend)", "reflog", false);
  }
  if (signals.reflog.rebase) {
    record(4, "rebase-i", "reflog: rebase (", "reflog", false);
  }
  if (signals.reflog.cherryPick) {
    record(4, "cherry-pick", "reflog: cherry-pick", "reflog", false);
  }
  if (signals.stash.count > 0) {
    record(2, "stash", `${signals.stash.count} stash(es)`, "stash-list", false);
  }
  if (signals.merge) {
    record(3, "merge", `merge commit ${signals.merge.hash}`, "merge-log", false);
  }
  if (signals.gh.available && signals.gh.prs.length > 0) {
    record(5, "gh-pr", `${signals.gh.prs.length} PR(s)`, "gh", false);
  }

  config.updatedAt = now;
  const previous = config.projects[dir] && Array.isArray(config.projects[dir].tiersTouched) ? config.projects[dir].tiersTouched : [];
  config.projects[dir] = { lastSyncedAt: now, tiersTouched: [...new Set([...previous, ...touchedTiers])] };

  writeGitTracks(config, { home });
  return { touchedTiers };
}

module.exports = {
  TIER_IDS,
  tracksHome,
  tracksPath,
  defaultGitTracks,
  readGitTracks,
  readOrDefaultGitTracks,
  validateGitTracks,
  writeGitTracks,
  captureGitSignals,
  syncGitTrack,
};
