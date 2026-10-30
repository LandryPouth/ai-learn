"use strict";

// `ai-learn ledgers --repair | --sync` (story 09.01) — machinery, called by
// `update` and by the agent, never one of the learner's commands.
//
// repair: drops every project whose folder no longer exists from the
// cross-project ledgers, then recomputes each tier from the evidence that
// remains. Tiers store their own evidence (`evidence[].project`), so no
// evaluation is replayed: a tier with no remaining proof becomes not achieved
// again. This is the one place a tier may go back to false — on purpose, since
// the proof it rested on is gone. Repair only ever lowers: it never grants.
//
// sync: replays a project's latest passing verify evidence per phase through
// the three ledger syncs verify runs at phase closure. Idempotent: the syncs
// dedupe their evidence and skip the write when only timestamps would change.

const fs = require("fs");
const os = require("os");
const path = require("path");
const { log, readJson } = require("./util");
const { readProgress, latestEvidenceForPhase } = require("./progress");
const git = require("./tracks/git");
const tests = require("./tracks/tests");
const domain = require("./tracks/domain");
const { assertWritable, writeLedgerFile, withoutTimestamps, projectKey, canonicalizeProjects } = require("./tracks/store");

// --- repair ------------------------------------------------------------------

// Only a folder that is really gone (ENOENT) is vanished: an unreadable,
// unmounted or offline path is kept rather than erased from the ledger.
function folderGone(project) {
  try {
    fs.lstatSync(project);
    return false;
  } catch (error) {
    return error.code === "ENOENT" || error.code === "ENOTDIR";
  }
}

function vanished(project, gone) {
  return typeof project === "string" && gone(project);
}

function dropProjects(config, gone) {
  const removed = Object.keys(config.projects || {}).filter((project) => vanished(project, gone));

  for (const project of removed) {
    delete config.projects[project];
  }

  return removed;
}

function dropEvidence(tier, gone, removed) {
  for (const e of tier.evidence) {
    if (vanished(e && e.project, gone)) {
      removed.add(e.project);
    }
  }
  tier.evidence = tier.evidence.filter((e) => !vanished(e && e.project, gone));
}

function settle(tier, tierId, stillProven, tiersReset) {
  if (tier.achieved && !stillProven) {
    tiersReset.push(tierId);
  }
  tier.achieved = tier.achieved && stillProven;
}

// git: only a `phase-verified` entry ever marked a tier achieved — ambient
// reflog/stash/gh signals are recorded but never count (see syncGitTrack).
function repairGit(config, gone) {
  const removed = new Set(dropProjects(config, gone));
  const tiersReset = [];

  for (const tierId of git.TIER_IDS) {
    const tier = config.tiers[String(tierId)];
    dropEvidence(tier, gone, removed);
    settle(tier, tierId, tier.evidence.some((e) => e.kind === "phase-verified"), tiersReset);
  }

  return { removed: [...removed], tiersReset };
}

// tests: tiers 1-5 rest on their own evidence; tier 6 is "tier 2 in >= 2
// projects", recomputed from the projects that remain.
function repairTests(config, gone) {
  const removed = new Set(dropProjects(config, gone));
  const tiersReset = [];

  for (const tierId of tests.TIER_IDS) {
    const tier = config.tiers[String(tierId)];
    dropEvidence(tier, gone, removed);

    let stillProven = tier.evidence.length > 0;
    if (tierId === 6) {
      const withTier2 = Object.values(config.projects || {}).filter((p) => (p.tiersAchieved || []).includes(2));
      stillProven = withTier2.length >= 2;
      if (!stillProven) {
        tier.evidence = [];
      }
    }

    settle(tier, tierId, stillProven, tiersReset);
  }

  return { removed: [...removed], tiersReset };
}

// domain: a concept is credited to its first project only, so a concept whose
// first project vanished is dropped; a remaining project that also uses it
// earns it back on its next verify or `ledgers --sync`.
function repairDomain(config, gone) {
  const removed = new Set(dropProjects(config, gone));
  const tiersReset = [];

  for (const [id, concept] of Object.entries(config.concepts || {})) {
    if (concept && vanished(concept.firstProject, gone)) {
      removed.add(concept.firstProject);
      delete config.concepts[id];
      tiersReset.push(id);
    }
  }

  return { removed: [...removed], tiersReset };
}

function ledgerFiles(home) {
  const files = [
    { name: "tracks/git.json", file: git.tracksPath({ home }), validate: git.validateGitTracks, repair: repairGit },
    { name: "tracks/tests.json", file: tests.tracksPath({ home }), validate: tests.validateTestsTracks, repair: repairTests },
  ];
  const domainsDir = domain.domainsHome({ home });

  if (fs.existsSync(domainsDir)) {
    for (const entry of fs.readdirSync(domainsDir).filter((n) => n.endsWith(".json")).sort()) {
      files.push({
        name: `domains/${entry}`,
        file: path.join(domainsDir, entry),
        validate: domain.validateDomainLedger,
        repair: repairDomain,
      });
    }
  }

  return files;
}

function backupStamp(now) {
  return now.toISOString().replace(/[:.]/g, "-");
}

function repairLedgers({ home = os.homedir(), dryRun = false, gone = folderGone, now = new Date() } = {}) {
  const report = [];

  for (const ledger of ledgerFiles(home)) {
    if (!fs.existsSync(ledger.file)) {
      continue;
    }

    const config = readJson(ledger.file, null);
    const issues = config === null ? [{ message: "JSON illisible" }] : ledger.validate(config);

    // Never rewrite a file we cannot read: the learner fixes or removes it.
    if (issues.length > 0) {
      report.push({ name: ledger.name, file: ledger.file, corrupt: issues.map((i) => i.message).join("; ") });
      continue;
    }

    const before = withoutTimestamps(config);
    // Fold aliased spellings first, so a project counted twice (tests tier 6)
    // is counted once before the tiers are recomputed.
    const merged = canonicalizeProjects(config);
    const { removed, tiersReset } = ledger.repair(config, gone);
    const changed = withoutTimestamps(config) !== before;
    const entry = { name: ledger.name, file: ledger.file, removed, merged, tiersReset, changed, backup: null };

    if (changed && !dryRun) {
      assertWritable(ledger.file);
      entry.backup = `${ledger.file}.bak-${backupStamp(now)}`;
      fs.copyFileSync(ledger.file, entry.backup);
      config.updatedAt = now.toISOString();
      writeLedgerFile(ledger.file, config, { validate: ledger.validate });
    }

    report.push(entry);
  }

  return report;
}

// --- sync --------------------------------------------------------------------

// Same three syncs, same isolated failure domains as verify's phase closure:
// one failing ledger never stops the other two, and every failure is returned.
function syncEvidence({ dir, phase, evidence, home }) {
  const key = projectKey(dir);
  const failures = [];
  const attempts = [
    ["git", () => git.syncGitTrack({ dir: key, phase, verifyEvidence: evidence, home }), () => git.tracksPath({ home })],
    ["domaine", () => domain.syncDomainLedger({ dir: key, verifyEvidence: evidence, home }), () => domain.domainsHome({ home })],
    ["tests", () => tests.syncTestsTrack({ dir: key, phase, verifyEvidence: evidence, home }), () => tests.tracksPath({ home })],
  ];

  for (const [name, run, where] of attempts) {
    try {
      run();
    } catch (error) {
      failures.push({ ledger: name, code: error.code || error.message, path: error.path || where() });
    }
  }

  return failures;
}

function formatSyncFailure(failure) {
  return (
    `⚠ ledger ${failure.ledger} non mis à jour : ${failure.code} (${failure.path}) — ` +
    "relancer `ai-learn ledgers --sync` hors bac à sable"
  );
}

// What a replay may trust: the latest passing run of a phase that is still
// `done`, that closed the phase (not a `--no-mark` observation or a revisit),
// and that ran the checkpoint the phase declares today. A phase reopened, or
// retagged with another checkpoint since, is not replayed — verify will sync
// it when it really passes again.
function replayableEvidence(dir, phase) {
  if (phase.status !== "done") {
    return null;
  }

  const evidence = latestEvidenceForPhase(dir, phase.id);

  if (!evidence || evidence.marking === "skipped" || evidence.revisit || evidence.checkpoint !== phase.checkpoint) {
    return null;
  }

  return evidence;
}

function syncProjectLedgers({ dir, home = os.homedir() } = {}) {
  const { config } = readProgress(dir);

  if (!config) {
    return { replayed: 0, failures: [], skipped: "progress.json absent ou illisible" };
  }

  let replayed = 0;
  const failures = [];

  for (const phase of config.phases || []) {
    const evidence = replayableEvidence(dir, phase);

    if (!evidence) {
      continue;
    }

    replayed += 1;
    failures.push(...syncEvidence({ dir, phase, evidence, home }));
  }

  return { replayed, failures };
}

// --- check -------------------------------------------------------------------

// Which ledgers do not know this project, and which cannot be read at all?
// Read-only. An unreadable ledger is not "missing": a sync would refuse to
// write it, so it is reported apart, with its own fix.
function ledgerHealth({ dir, home = os.homedir() } = {}) {
  const key = projectKey(dir);
  const missing = [];
  const unreadable = [];

  const inspect = (name, file, validate) => {
    if (!fs.existsSync(file)) {
      missing.push(name);
      return;
    }
    const config = readJson(file, null);
    if (config === null || validate(config).length > 0) {
      unreadable.push(name);
    } else if (!(config.projects && config.projects[key])) {
      missing.push(name);
    }
  };

  inspect("tracks/git.json", git.tracksPath({ home }), git.validateGitTracks);
  inspect("tracks/tests.json", tests.tracksPath({ home }), tests.validateTestsTracks);

  let stack = null;
  try {
    stack = domain.detectDomainKey(dir).key;
  } catch {
    stack = null;
  }
  if (stack) {
    inspect(`domains/${domain.slugifyTechnology(stack)}.json`, domain.domainPath({ technology: stack, home }), domain.validateDomainLedger);
  }

  return { missing, unreadable };
}

function missingFromLedgers(options) {
  return ledgerHealth(options).missing;
}

// Is any phase of this project something `--sync` would replay? `check` asks
// the same question before warning, so its warning is always one a sync clears.
function hasReplayableEvidence(dir, config) {
  return (config.phases || []).some((phase) => replayableEvidence(dir, phase) !== null);
}

// --- command -----------------------------------------------------------------

function printRepair(report, dryRun) {
  let exitCode = 0;
  log(dryRun ? "Réparation des ledgers (simulation, rien n'est écrit) :" : "Réparation des ledgers :");

  if (report.length === 0) {
    log("  aucun ledger sous ~/.ai-learn");
  }

  for (const entry of report) {
    if (entry.corrupt) {
      exitCode = 1;
      log(`  ✗ ${entry.name} illisible, laissé intact : ${entry.corrupt} (${entry.file})`);
      continue;
    }

    const verb = dryRun ? "serai(en)t retiré(s)" : "retiré(s)";
    log(`  ${entry.name} : ${entry.removed.length} projet(s) disparu(s) ${verb}`);
    if (entry.merged > 0) {
      log(`    ${entry.merged} orthographe(s) d'un même projet fusionnée(s)`);
    }

    for (const project of entry.removed) {
      log(`    - ${project}`);
    }
    if (entry.tiersReset.length > 0) {
      log(`    redevien(nen)t non atteint(s) : ${entry.tiersReset.join(", ")}`);
    }
    if (entry.backup) {
      log(`    sauvegarde : ${entry.backup}`);
    }
  }

  return exitCode;
}

function ledgersCommand({ dir, repair, sync, dryRun, home = os.homedir() }) {
  if (!repair && !sync) {
    log("Usage : ai-learn ledgers --repair [--dry-run] | --sync [--dir <dir>]");
    return 1;
  }

  let exitCode = 0;

  if (repair) {
    exitCode = printRepair(repairLedgers({ home, dryRun }), dryRun);
  }

  if (sync) {
    const result = syncProjectLedgers({ dir, home });

    if (result.skipped) {
      log(`Synchronisation ignorée : ${result.skipped} (${dir}).`);
      return 1;
    }

    log(`Synchronisation : ${result.replayed} preuve(s) passante(s) rejouée(s) depuis ${dir}.`);

    for (const failure of result.failures) {
      exitCode = 1;
      log(`  ${formatSyncFailure(failure)}`);
    }
  }

  return exitCode;
}

module.exports = {
  projectKey,
  repairLedgers,
  syncProjectLedgers,
  syncEvidence,
  formatSyncFailure,
  replayableEvidence,
  hasReplayableEvidence,
  ledgerHealth,
  missingFromLedgers,
  ledgersCommand,
};
