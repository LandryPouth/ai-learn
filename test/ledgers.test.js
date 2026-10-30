"use strict";

// Story 09.01 — clean cross-project ledgers: the production safety net against
// writing the real home from the test runner, `ledgers --repair` and
// `ledgers --sync`.

const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const { capture, sampleProgress, tmpProject, writeFile } = require("./helpers");
const { assertWritable, writeLedgerFile } = require("../bin/lib/tracks/store");
const { defaultGitTracks, tracksPath: gitPath } = require("../bin/lib/tracks/git");
const { defaultTestsTracks, tracksPath: testsPath } = require("../bin/lib/tracks/tests");
const { defaultDomainLedger, domainPath, detectDomainKey } = require("../bin/lib/tracks/domain");
const { projectKey, repairLedgers, syncProjectLedgers, ledgersCommand, missingFromLedgers } = require("../bin/lib/ledgers");
const { spawnSync } = require("child_process");
const { verifyCommand } = require("../bin/lib/verify");
const { checkProject } = require("../bin/lib/check");

function tmpHome() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "ai-learn-ledgers-"));
}

const GONE = path.join(os.tmpdir(), "ai-learn-ledgers-vanished-project-does-not-exist");
const GONE_TOO = `${GONE}-2`;

const readText = (file) => fs.readFileSync(file, "utf8");
const backups = (file) => fs.readdirSync(path.dirname(file)).filter((n) => n.startsWith(`${path.basename(file)}.bak-`));

// Never aims a write at the real home, even if the net were broken: the write
// path is proven against a stand-in "real" home, and the real one is only ever
// passed to the pure check.
test("ledger writes refuse the real home under the test runner", () => {
  assert.ok(process.env.NODE_TEST_CONTEXT, "node --test sets NODE_TEST_CONTEXT");

  const standIn = tmpHome();
  const target = path.join(standIn, ".ai-learn", "tracks", "git.json");
  assert.throws(
    () => writeLedgerFile(target, { version: 1 }, { realHomeDir: standIn }),
    (error) => error.code === "ELEDGER_REAL_HOME" && error.path === target && error.message.includes(target),
  );
  assert.strictEqual(fs.existsSync(target), false, "nothing is written");

  // The account's real home (read from the system, not HOME) is refused too.
  const realTarget = path.join(os.userInfo().homedir, ".ai-learn", "tracks", "git.json");
  assert.throws(() => assertWritable(realTarget), /refus d'écrire le ledger réel/);

  // Outside the test runner, or toward an isolated home, the net stays open.
  assert.doesNotThrow(() => assertWritable(realTarget, { env: {} }));
  assert.doesNotThrow(() => writeLedgerFile(path.join(tmpHome(), ".ai-learn", "tracks", "git.json"), { version: 1 }));
});

function pollutedHome() {
  const home = tmpHome();
  const kept = tmpProject(sampleProgress());

  const tests = defaultTestsTracks();
  for (const tier of [1, 2]) {
    tests.tiers[String(tier)] = {
      achieved: true,
      evidence: [GONE, GONE_TOO].map((project) => ({ project, phaseId: 0, kind: "mutation-observed" })),
    };
  }
  tests.tiers["6"] = { achieved: true, evidence: [{ project: GONE_TOO, phaseId: 0, kind: "mutation-observed" }] };
  tests.tiers["3"] = { achieved: true, evidence: [{ project: kept, phaseId: 0, kind: "mutation-observed" }] };
  tests.projects = {
    [GONE]: { tiersAchieved: [1, 2] },
    [GONE_TOO]: { tiersAchieved: [1, 2, 6] },
    [kept]: { tiersAchieved: [3] },
  };
  writeFile(home, ".ai-learn/tracks/tests.json", JSON.stringify(tests));

  const git = defaultGitTracks();
  git.tiers["1"] = { achieved: true, evidence: [{ project: GONE, phaseId: 0, kind: "phase-verified" }] };
  git.tiers["2"] = { achieved: false, evidence: [{ project: kept, phaseId: 0, kind: "stash" }] };
  git.tiers["3"] = { achieved: true, evidence: [{ project: kept, phaseId: 1, kind: "phase-verified" }] };
  git.projects = { [GONE]: { tiersTouched: [1] }, [kept]: { tiersTouched: [2, 3] } };
  writeFile(home, ".ai-learn/tracks/git.json", JSON.stringify(git));

  const domain = defaultDomainLedger("javascript");
  domain.concepts = {
    "js-routes": { achieved: true, tier: 1, firstProject: GONE },
    "js-async": { achieved: true, tier: 1, firstProject: kept },
  };
  domain.projects = { [GONE]: { conceptsContributed: ["js-routes"] }, [kept]: { conceptsContributed: ["js-async"] } };
  writeFile(home, ".ai-learn/domains/javascript.json", JSON.stringify(domain));

  return { home, kept };
}

test("repair drops vanished projects and recomputes tiers", () => {
  const { home, kept } = pollutedHome();

  const out = capture(() => assert.strictEqual(ledgersCommand({ home, repair: true }), 0));

  const tests = JSON.parse(readText(testsPath({ home })));
  for (const tier of ["1", "2", "6"]) {
    assert.strictEqual(tests.tiers[tier].achieved, false, `tests tier ${tier} rested only on vanished projects`);
    assert.deepStrictEqual(tests.tiers[tier].evidence, []);
  }
  assert.strictEqual(tests.tiers["3"].achieved, true, "a tier backed by an existing project is kept");
  assert.deepStrictEqual(Object.keys(tests.projects), [projectKey(kept)]);

  const git = JSON.parse(readText(gitPath({ home })));
  assert.strictEqual(git.tiers["1"].achieved, false);
  assert.strictEqual(git.tiers["2"].achieved, false, "an ambient signal never counts as achieved");
  assert.strictEqual(git.tiers["2"].evidence.length, 1);
  assert.strictEqual(git.tiers["3"].achieved, true);
  assert.deepStrictEqual(Object.keys(git.projects), [projectKey(kept)]);

  const domain = JSON.parse(readText(domainPath({ technology: "javascript", home })));
  assert.deepStrictEqual(Object.keys(domain.concepts), ["js-async"]);
  assert.deepStrictEqual(Object.keys(domain.projects), [projectKey(kept)]);

  for (const file of [testsPath({ home }), gitPath({ home }), domainPath({ technology: "javascript", home })]) {
    assert.strictEqual(backups(file).length, 1, `${file} is backed up before being rewritten`);
  }
  assert.match(out, /tracks\/tests\.json : 2 projet\(s\) disparu\(s\) retiré\(s\)/);
  assert.match(out, /tracks\/git\.json : 1 projet\(s\) disparu\(s\) retiré\(s\)/);
  assert.match(out, /redevien\(nen\)t non atteint\(s\) : 1, 2, 6/);

  // A second repair finds nothing left to remove and writes no new backup.
  capture(() => ledgersCommand({ home, repair: true }));
  assert.strictEqual(backups(testsPath({ home })).length, 1);
});

test("repair --dry-run writes nothing", () => {
  const { home } = pollutedHome();
  const files = [testsPath({ home }), gitPath({ home }), domainPath({ technology: "javascript", home })];
  const before = files.map(readText);

  const out = capture(() => ledgersCommand({ home, repair: true, dryRun: true }));

  assert.deepStrictEqual(files.map(readText), before);
  for (const file of files) {
    assert.deepStrictEqual(backups(file), []);
  }
  assert.match(out, /simulation, rien n'est écrit/);
  assert.match(out, /serai\(en\)t retiré\(s\)/);
  assert.ok(out.toLowerCase().includes(GONE.toLowerCase()), "the projects that would be removed are listed");
});

test("repair never rewrites a ledger it cannot read", () => {
  const home = tmpHome();
  writeFile(home, ".ai-learn/tracks/tests.json", "{ not json");

  let code;
  const out = capture(() => {
    code = ledgersCommand({ home, repair: true });
  });

  assert.strictEqual(code, 1);
  assert.strictEqual(readText(testsPath({ home })), "{ not json");
  assert.match(out, /tracks\/tests\.json illisible, laissé intact/);
  assert.deepStrictEqual(backups(testsPath({ home })), []);
});

function provenProject(phaseCount = 3) {
  const progress = sampleProgress();
  progress.phases = Array.from({ length: phaseCount }, (_, id) => ({
    id,
    name: `Phase ${id}`,
    status: "pending",
    checkpoint: 'node -e "process.exit(0)"',
    artifacts: [],
    predictionsRequired: 0,
  }));
  const dir = tmpProject(progress);
  // Verified against a throwaway home: the evidence exists, the home under
  // test has never heard of the project — a sync swallowed by a sandbox.
  const elsewhere = tmpHome();
  for (let id = 0; id < phaseCount; id += 1) {
    capture(() => verifyCommand({ dir, phaseId: id, home: elsewhere }));
  }
  return dir;
}

test("sync replays a project's passing evidence idempotently", () => {
  const dir = provenProject(3);
  const home = tmpHome();
  const { key } = detectDomainKey(dir);
  const files = [gitPath({ home }), testsPath({ home }), domainPath({ technology: key, home })];

  const first = syncProjectLedgers({ dir, home });

  assert.strictEqual(first.replayed, 3);
  assert.deepStrictEqual(first.failures, []);
  for (const file of files) {
    assert.ok(JSON.parse(readText(file)).projects[projectKey(dir)], `${file} knows the project`);
  }

  const before = files.map(readText);
  const second = syncProjectLedgers({ dir, home });
  assert.strictEqual(second.replayed, 3);
  assert.deepStrictEqual(files.map(readText), before, "a replay changes nothing, timestamps included");
});

test("a proven project missing from the ledgers is warned until it is synced", () => {
  const dir = provenProject(3);
  const home = tmpHome();
  const warned = () => checkProject(dir, { home }).issues.warnings.filter((w) => /progression absente des ledgers/.test(w.message));

  assert.strictEqual(warned().length, 1);
  assert.match(warned()[0].message, /ai-learn ledgers --sync/);
  assert.ok(missingFromLedgers({ dir, home }).includes("tracks/git.json"));

  capture(() => ledgersCommand({ dir, home, sync: true }));

  assert.deepStrictEqual(warned(), []);
});

test("a project with nothing proven is not warned", () => {
  const dir = tmpProject(sampleProgress());
  const warnings = checkProject(dir, { home: tmpHome() }).issues.warnings;
  assert.ok(!warnings.some((w) => /progression absente/.test(w.message)));
});

test("repair resets a tier claimed without any evidence, even when nothing vanished", () => {
  const home = tmpHome();
  const tests = defaultTestsTracks();
  for (const tier of [1, 2, 3]) {
    tests.tiers[String(tier)].achieved = true;
  }
  writeFile(home, ".ai-learn/tracks/tests.json", JSON.stringify(tests));

  capture(() => ledgersCommand({ home, repair: true }));

  const repaired = JSON.parse(readText(testsPath({ home })));
  for (const tier of ["1", "2", "3"]) {
    assert.strictEqual(repaired.tiers[tier].achieved, false);
  }
  assert.strictEqual(backups(testsPath({ home })).length, 1);
});

test("repair only lowers tiers, never grants one", () => {
  const home = tmpHome();
  const [a, b] = [tmpProject(sampleProgress()), tmpProject(sampleProgress())];
  const tests = defaultTestsTracks();
  tests.projects = { [a]: { tiersAchieved: [2] }, [b]: { tiersAchieved: [2] } };
  writeFile(home, ".ai-learn/tracks/tests.json", JSON.stringify(tests));
  const git = defaultGitTracks();
  git.tiers["1"].evidence.push({ project: a, phaseId: 0, kind: "phase-verified" });
  writeFile(home, ".ai-learn/tracks/git.json", JSON.stringify(git));

  capture(() => ledgersCommand({ home, repair: true }));

  assert.strictEqual(JSON.parse(readText(testsPath({ home }))).tiers["6"].achieved, false);
  assert.strictEqual(JSON.parse(readText(gitPath({ home }))).tiers["1"].achieved, false);
});

test("a symlinked spelling of a synced project is the same project", { skip: process.platform === "win32" }, () => {
  const dir = provenProject(1);
  const home = tmpHome();
  syncProjectLedgers({ dir, home });
  const link = path.join(tmpHome(), "link");
  fs.symlinkSync(dir, link);

  assert.deepStrictEqual(missingFromLedgers({ dir: link, home }), []);
  syncProjectLedgers({ dir: link, home });
  assert.strictEqual(Object.keys(JSON.parse(readText(testsPath({ home }))).projects).length, 1);
});

test("sync replays only phases still done under the checkpoint that was proven", () => {
  const dir = provenProject(3);
  const progressFile = path.join(dir, "progress.json");
  const progress = JSON.parse(readText(progressFile));
  progress.phases[1].status = "in_progress";
  progress.phases[2].checkpoint = 'node -e "process.exit(1)"';
  fs.writeFileSync(progressFile, JSON.stringify(progress));

  assert.strictEqual(syncProjectLedgers({ dir, home: tmpHome() }).replayed, 1);
});

test("ledgers refuses an unknown flag instead of repairing for real", () => {
  const home = tmpHome();
  const bin = path.join(__dirname, "..", "bin", "ai-learn.js");
  const result = spawnSync(process.execPath, [bin, "ledgers", "--repair", "--dryrun"], {
    encoding: "utf8",
    env: { ...process.env, HOME: home, USERPROFILE: home },
  });

  assert.notStrictEqual(result.status, 0);
  assert.match(result.stderr + result.stdout, /argument inconnu --dryrun/);
});

// Review 09.01 — a sync starts from a default ledger when the file on disk is
// unreadable; writing that default would erase the learner's progression.
test("a sync never overwrites a ledger it cannot read", () => {
  const dir = provenProject(1);
  const home = tmpHome();
  writeFile(home, ".ai-learn/tracks/tests.json", "{ not json");

  const result = syncProjectLedgers({ dir, home });

  assert.strictEqual(readText(testsPath({ home })), "{ not json", "the unreadable ledger is left as it was");
  assert.ok(
    result.failures.some((f) => f.ledger === "tests" && f.code === "ELEDGER_UNREADABLE" && f.path === testsPath({ home })),
    "the refusal is reported, not swallowed",
  );
  assert.ok(JSON.parse(readText(gitPath({ home }))).projects[projectKey(dir)], "the other ledgers are still synced");

  const warnings = checkProject(dir, { home }).issues.warnings.map((w) => w.message);
  assert.ok(warnings.some((m) => /ledger illisible, jamais réécrit \(tracks\/tests\.json\)/.test(m)));
  assert.ok(!warnings.some((m) => /progression absente/.test(m)), "an unreadable ledger is not reported as missing the project");
});

// Review 09.01 — ledgers written before the key was normalized hold the same
// project under another spelling (Windows casing, a symlink): it must not
// count as a second project toward tests tier 6.
function aliasedTestsLedger(home, dir) {
  const link = path.join(tmpHome(), "link");
  fs.symlinkSync(dir, link);
  const tests = defaultTestsTracks();
  tests.tiers["2"] = {
    achieved: true,
    evidence: [link, projectKey(dir)].map((project) => ({ project, phaseId: 0, kind: "mutation-observed" })),
  };
  tests.tiers["6"] = { achieved: true, evidence: [{ project: link, phaseId: 0, kind: "mutation-observed" }] };
  tests.projects = { [link]: { tiersAchieved: [2, 6] }, [projectKey(dir)]: { tiersAchieved: [2] } };
  writeFile(home, ".ai-learn/tracks/tests.json", JSON.stringify(tests));
  return link;
}

test("repair folds two spellings of one project before recomputing tier 6", { skip: process.platform === "win32" }, () => {
  const home = tmpHome();
  const dir = tmpProject(sampleProgress());
  aliasedTestsLedger(home, dir);

  const out = capture(() => ledgersCommand({ home, repair: true }));

  const repaired = JSON.parse(readText(testsPath({ home })));
  assert.deepStrictEqual(Object.keys(repaired.projects), [projectKey(dir)]);
  assert.strictEqual(repaired.tiers["6"].achieved, false, "one project is not two");
  assert.strictEqual(repaired.tiers["2"].evidence.length, 1, "the duplicated evidence is folded too");
  assert.match(out, /1 orthographe\(s\) d'un même projet fusionnée\(s\)/);
});

test("a sync folds an old spelling instead of counting the project twice", { skip: process.platform === "win32" }, () => {
  const home = tmpHome();
  const dir = provenProject(1);
  const tests = defaultTestsTracks();
  const link = path.join(tmpHome(), "link");
  fs.symlinkSync(dir, link);
  tests.projects = { [link]: { tiersAchieved: [2] }, [projectKey(dir)]: { tiersAchieved: [2] } };
  writeFile(home, ".ai-learn/tracks/tests.json", JSON.stringify(tests));

  syncProjectLedgers({ dir, home });

  const synced = JSON.parse(readText(testsPath({ home })));
  assert.deepStrictEqual(Object.keys(synced.projects), [projectKey(dir)]);
  assert.strictEqual(synced.tiers["6"].achieved, false, "tier 6 is never granted by one project under two spellings");
});

// Review 09.01 — check warns only when `--sync` has something to replay, so
// the command it suggests always clears the warning.
test("check does not warn about a phase that sync would not replay", () => {
  const dir = provenProject(1);
  const progressFile = path.join(dir, "progress.json");
  const progress = JSON.parse(readText(progressFile));
  progress.phases[0].checkpoint = 'node -e "process.exit(1)"';
  fs.writeFileSync(progressFile, JSON.stringify(progress));
  const home = tmpHome();

  assert.strictEqual(syncProjectLedgers({ dir, home }).replayed, 0);
  const warnings = checkProject(dir, { home }).issues.warnings;
  assert.ok(!warnings.some((w) => /progression absente/.test(w.message)));
});
