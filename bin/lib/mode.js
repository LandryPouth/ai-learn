"use strict";

// `ai-learn mode <apprenti|dirigeant>` — the gate that makes the learning mode
// *earned* rather than declared. Switching to `dirigeant` requires tiers 1-3 of
// the global test-mastery ledger (`~/.ai-learn/tracks/tests.json`, story 02.05)
// to be achieved: the learner must have killed a mutant, reached a perfect
// mutation score on a phase, and observed red-before-green. Returning to
// `apprenti` is always allowed — the mode is a proof of judgement, not a trap.
//
// Failure is closed here, the opposite of the ledger syncs: `syncTestsTrack`
// treats an unreadable ledger as "nothing observed yet" (fail-open) because it
// only ever *adds* evidence. The gate makes an authorization decision, so an
// absent/corrupt/unknown-version ledger proves nothing and must refuse. The
// ledger stays learner-editable: this is a pedagogical guardrail, not a security
// control, and the docs say so instead of implying it is tamper-proof.

const fs = require("fs");
const os = require("os");
const path = require("path");
const { fail, log, readJson, writeJson } = require("./util");
const { tracksPath, readTestsTracks, validateTestsTracks } = require("./tracks/tests");
const { MODE_APPRENTI, MODE_DIRIGEANT, ensureGuardHook, loadGuardConfig } = require("./guard");

const REQUIRED_TIERS = [1, 2, 3];

const TIER_REQUIREMENTS = {
  1: { label: "un mutant tué", requirement: "a verify evidence with mutation.killed >= 1" },
  2: {
    label: "score 100 % sur une phase",
    requirement: "a verify evidence with mutation.mutants >= 1 and mutation.score === 100",
  },
  3: {
    label: "rouge d'abord observé",
    requirement: "the same phase showing mutation.ok:false, then a later evidence with mutation.ok:true",
  },
};

function guardConfigFile(dir) {
  return path.join(dir, ".ai-learn", "guard.json");
}

// Reads the global ledger and answers one question: are tiers 1-3 proven?
// `status` is one of `ok`, `incomplete`, `absent`, `unreadable`, `invalid`.
// Never writes the ledger — the gate only observes it.
function requiredTiersStatus({ home = os.homedir() } = {}) {
  const file = tracksPath({ home });
  const { config } = readTestsTracks({ home });

  if (!config) {
    return {
      ok: false,
      status: fs.existsSync(file) ? "unreadable" : "absent",
      path: file,
      issues: [],
      tiers: [],
      missing: REQUIRED_TIERS.slice(),
    };
  }

  const issues = validateTestsTracks(config);

  if (issues.length > 0) {
    return { ok: false, status: "invalid", path: file, issues, tiers: [], missing: REQUIRED_TIERS.slice() };
  }

  const tiers = REQUIRED_TIERS.filter((tier) => config.tiers[String(tier)].achieved === true);
  const missing = REQUIRED_TIERS.filter((tier) => !tiers.includes(tier));

  return { ok: missing.length === 0, status: missing.length === 0 ? "ok" : "incomplete", path: file, issues: [], tiers, missing };
}

function describeMissingTier(tier) {
  const info = TIER_REQUIREMENTS[tier];
  return `tier ${tier} ("${info.label}") is not achieved — it requires ${info.requirement}`;
}

// A message the learner can act on. `ai-learn check` reuses this when a
// hand-edited `guard.json` claims `dirigeant` while the ledger does not back it.
function formatLedgerRefusal(status) {
  switch (status.status) {
    case "absent":
      return (
        `the test ledger is absent (${status.path}) — tiers 1-3 must be earned first; ` +
        "run `ai-learn verify` on a phase with mutation enabled"
      );
    case "unreadable":
      return `the test ledger is unreadable (${status.path}) — a broken ledger proves nothing; repair or remove it, then retry`;
    case "invalid":
      return `the test ledger is invalid (${status.path}): ${status.issues.map((issue) => issue.message).join("; ")}`;
    case "incomplete":
      return `${status.missing.map(describeMissingTier).join("; ")} (${status.tiers.length}/3 achieved)`;
    default:
      return "the test ledger does not prove tiers 1-3";
  }
}

// The files `ensureGuardHook` may (re)write. Snapshotted before the switch so a
// wiring failure can be rolled back completely — restoring only `guard.json`
// would leave the Codex profile and the solutions README on the *new* mode while
// the policy says the old one, i.e. two guards enforcing opposite rules.
const WIRING_FILES = [".codex/config.toml", "docs/solutions/README.md", ".claude/settings.json"];

function snapshotFiles(dir, rels) {
  return rels.map((rel) => {
    const full = path.join(dir, rel);
    let content = null;
    let link = null;

    try {
      const stat = fs.lstatSync(full);

      if (stat.isSymbolicLink()) {
        // Including a broken link, which `writeFileSync` would otherwise turn
        // into a regular file that the rollback then deletes outright.
        link = fs.readlinkSync(full);
      } else if (stat.isFile()) {
        content = fs.readFileSync(full, "utf8");
      }
    } catch {
      // absent, or a directory where a file is expected — nothing to snapshot
    }
    return { full, content, link };
  });
}

function restoreFiles(snapshots) {
  for (const { full, content, link } of snapshots) {
    try {
      if (link !== null) {
        fs.rmSync(full, { force: true });
        fs.symlinkSync(link, full);
      } else if (content === null) {
        fs.rmSync(full, { force: true });
      } else {
        fs.writeFileSync(full, content);
      }
    } catch {
      // Best effort: the command is already failing loudly, and a half-restored
      // wiring is no worse than the half-applied switch this replaces.
    }
  }
}

// Writes the mode into `.ai-learn/guard.json` while preserving every other
// field (the learner's custom `learnerFiles`, `implementationFiles`, …). The
// switch is traced with its date and the tiers observed at that moment. Then
// re-renders the generated wiring (solutions README, Codex permissions profile)
// so the mode is not half-applied across platforms.
function modeCommand({ dir, target, home = os.homedir() }) {
  if (target !== MODE_APPRENTI && target !== MODE_DIRIGEANT) {
    fail(`mode requires a target: "apprenti" or "dirigeant" (got ${JSON.stringify(target)})`);
  }

  const status = requiredTiersStatus({ home });

  if (target === MODE_DIRIGEANT && !status.ok) {
    fail(`refusing to switch to dirigeant: ${formatLedgerRefusal(status)}`);
  }

  const file = guardConfigFile(dir);
  const existing = readJson(file, null);
  const isObject = existing && typeof existing === "object" && !Array.isArray(existing);
  const fileExists = fs.existsSync(file);

  // `apprenti` is unconditional: a hand-broken policy must never trap the
  // learner in a mode, so it is recovered with a default config. `dirigeant`,
  // on the other hand, never overwrites a broken file — the learner may have a
  // custom `learnerFiles`/`implementationFiles` in there, and `init`/`update`
  // are already non-destructive.
  if (fileExists && !isObject) {
    if (target === MODE_DIRIGEANT) {
      fail(".ai-learn/guard.json is unreadable or not an object — repair it before switching mode (nothing was overwritten)");
    }
    log(".ai-learn/guard.json was unreadable — replacing it with a default apprenti config.");
  }

  const resolved = loadGuardConfig(dir);
  const config = isObject
    ? { ...existing }
    : {
        version: 1,
        learnerFiles: resolved.learnerFiles,
        blockedCommands: resolved.blockedCommands,
        gitAliases: resolved.gitAliases,
      };

  if (config.version === undefined) {
    config.version = 1;
  }
  config.mode = target;
  config.modeChangedAt = new Date().toISOString();
  config.modeTiers = status.tiers;

  // The mode is written before the wiring because `ensureGuardHook` reads it to
  // render the Codex profile. Every file that wiring may touch is snapshotted
  // first: a failure restores all of them, because a mode applied while the
  // Codex profile and solutions README kept the other mode is worse than no
  // switch at all.
  const backups = snapshotFiles(dir, [".ai-learn/guard.json", ...WIRING_FILES]);

  let wiring;

  try {
    writeJson(file, config);
    wiring = ensureGuardHook(dir);
  } catch (error) {
    restoreFiles(backups);
    fail(`mode wiring failed (${error.message}) — guard.json and the generated wiring were restored; fix the filesystem issue and retry`);
  }

  if (wiring.codex && wiring.codex.skipped) {
    log("Warning: .codex/config.toml is customized — its guard profile was not refreshed; Codex keeps the previous mode's sandbox.");
  }

  if (target === MODE_DIRIGEANT) {
    log(`Mode dirigeant: ${status.tiers.length}/3 tiers proven (${status.tiers.join(", ")}).`);
    log("L'IA écrit l'implémentation ; l'apprenant garde test/** et checkpoint/**.");
  } else {
    log("Mode apprenti: retour permis sans condition.");
    log("L'IA ne touche plus à src/** ; l'apprenant écrit le code.");
  }
}

module.exports = {
  MODE_APPRENTI,
  MODE_DIRIGEANT,
  REQUIRED_TIERS,
  requiredTiersStatus,
  formatLedgerRefusal,
  guardConfigFile,
  modeCommand,
};
