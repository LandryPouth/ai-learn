"use strict";

const { test, beforeEach } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");

const os = require("os");
const { verifyCommand, staleCommand, findStalePhases } = require("../bin/lib/verify");
const { readProgress, runsDir, progressPath, latestEvidenceForPhase } = require("../bin/lib/progress");
const { computeSourceHash } = require("../bin/lib/source-hash");
const { readGitTracks } = require("../bin/lib/tracks/git");
const { recordPrediction } = require("../bin/lib/predictions");
const { mutateConfigPath, mutateLockPath } = require("../bin/lib/mutate");
const { capture, sampleProgress, tmpProject, writeFile, spawnGit, withoutNodeTestContext } = require("./helpers");

// A checkpoint that never inspects the return value of the mutated function —
// it stays green whether the boolean literal is `true` or `false`, so the
// mutant always survives (same fixtures as test/mutate.test.js).
const WEAK_CHECKPOINT = 'node -e "require(\'./src/index.js\')"';

// A checkpoint that fails when the mutated literal flips — the mutant is killed.
const STRONG_CHECKPOINT = "node -e \"const { isReady } = require('./src/index.js'); if (isReady() !== true) process.exit(1)\"";

function mutationPhase(checkpoint, overrides = {}) {
  return sampleProgress({
    phases: [
      { id: 0, name: "Phase zero", status: "pending", checkpoint, artifacts: [], predictionsRequired: 0, mutation: true, ...overrides },
    ],
  });
}

function tmpHome() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "ai-learn-verify-home-"));
}

beforeEach(() => {
  process.exitCode = 0;
});

test("verify runs a passing checkpoint, records evidence, marks the phase done", () => {
  const dir = tmpProject(sampleProgress());
  const out = capture(() => verifyCommand({ dir, phaseId: 0 }));

  assert.match(out, /\[ok\]/);
  assert.match(out, /marked done/);

  const { config } = readProgress(dir);
  assert.strictEqual(config.phases[0].status, "done");

  const runs = fs.readdirSync(runsDir(dir)).filter((f) => f.endsWith("-verify.json"));
  assert.strictEqual(runs.length, 1);

  const evidence = JSON.parse(fs.readFileSync(path.join(runsDir(dir), runs[0]), "utf8"));
  assert.strictEqual(evidence.ok, true);
  assert.strictEqual(evidence.phaseId, 0);
  assert.strictEqual(evidence.lastProvenAt, evidence.generatedAt);
  assert.ok(!Number.isNaN(Date.parse(evidence.lastProvenAt)));
  assert.strictEqual(process.exitCode, 0);
});

test("verify fails on a failing checkpoint and does not mark the phase done", () => {
  const progress = sampleProgress();
  progress.phases[0].checkpoint = 'node -e "process.exit(3)"';
  const dir = tmpProject(progress);

  const out = capture(() => verifyCommand({ dir, phaseId: 0 }));

  assert.match(out, /\[exit 3\]/);
  const { config } = readProgress(dir);
  assert.strictEqual(config.phases[0].status, "pending");
  assert.strictEqual(process.exitCode, 1);

  const runs = fs.readdirSync(runsDir(dir)).filter((f) => f.endsWith("-verify.json"));
  const evidence = JSON.parse(fs.readFileSync(path.join(runsDir(dir), runs[0]), "utf8"));
  assert.strictEqual(evidence.lastProvenAt, null, "a failed run is not a proof and never refreshes the revisit date");
});

test("verify with a passing stressCheckpoint marks done once both checkpoints pass", () => {
  const progress = sampleProgress();
  progress.phases[0].stressCheckpoint = 'node -e "process.exit(0)"';
  const dir = tmpProject(progress);

  const out = capture(() => verifyCommand({ dir, phaseId: 0 }));

  assert.match(out, /Stress: node -e "process\.exit\(0\)"/);
  assert.match(out, /marked done/);

  const { config } = readProgress(dir);
  assert.strictEqual(config.phases[0].status, "done");

  const runs = fs.readdirSync(runsDir(dir)).filter((f) => f.endsWith("-verify.json"));
  const evidence = JSON.parse(fs.readFileSync(path.join(runsDir(dir), runs[0]), "utf8"));
  assert.strictEqual(evidence.ok, true);
  assert.strictEqual(evidence.results.length, 2);
  assert.strictEqual(process.exitCode, 0);
});

test("verify with a failing stressCheckpoint does NOT mark done, even though the base checkpoint passed", () => {
  const progress = sampleProgress();
  progress.phases[0].stressCheckpoint = 'node -e "process.exit(7)"';
  const dir = tmpProject(progress);

  const out = capture(() => verifyCommand({ dir, phaseId: 0 }));

  assert.match(out, /\[ok\].*node -e "process\.exit\(0\)"/s);
  assert.match(out, /\[exit 7\]/);
  assert.doesNotMatch(out, /marked done/);

  const { config } = readProgress(dir);
  assert.strictEqual(config.phases[0].status, "pending");
  assert.strictEqual(process.exitCode, 1);

  const runs = fs.readdirSync(runsDir(dir)).filter((f) => f.endsWith("-verify.json"));
  const evidence = JSON.parse(fs.readFileSync(path.join(runsDir(dir), runs[0]), "utf8"));
  assert.strictEqual(evidence.ok, false);
  assert.strictEqual(evidence.results.length, 2);
});

test("verify without a stressCheckpoint keeps the single-result evidence shape (backward compatible)", () => {
  const dir = tmpProject(sampleProgress());
  capture(() => verifyCommand({ dir, phaseId: 0 }));

  const runs = fs.readdirSync(runsDir(dir)).filter((f) => f.endsWith("-verify.json"));
  const evidence = JSON.parse(fs.readFileSync(path.join(runsDir(dir), runs[0]), "utf8"));
  assert.strictEqual(evidence.results.length, 1);
  assert.strictEqual(evidence.stressCheckpoint, null);
});

test("verify syncs the global git ledger when the passing phase declares a gitTier", () => {
  const progress = sampleProgress();
  progress.phases[0].gitTier = 1;
  const dir = tmpProject(progress);
  spawnGit(["init", "-b", "main"], { cwd: dir });
  spawnGit(["-C", dir, "config", "user.name", "t"]);
  spawnGit(["-C", dir, "config", "user.email", "t@t"]);
  fs.writeFileSync(path.join(dir, "a.txt"), "1");
  spawnGit(["-C", dir, "add", "."]);
  spawnGit(["-C", dir, "commit", "-m", "feat: a"]);

  const home = tmpHome();
  capture(() => verifyCommand({ dir, phaseId: 0, home }));

  const { config } = readGitTracks({ home });
  assert.strictEqual(config.tiers["1"].achieved, true);
});

test("verify syncs the global domain ledger from real code, keyed by the detected stack, not the progress.json label", () => {
  const progress = sampleProgress(); // technology: "Node" — the ledger key must NOT be "node"
  const dir = tmpProject(progress);
  fs.mkdirSync(path.join(dir, "src"), { recursive: true });
  fs.writeFileSync(
    path.join(dir, "src", "index.js"),
    'const app = require("express")();\napp.get("/x", async (req, res) => { await Promise.resolve(); res.json({}); });\napp.listen(3000);\n',
  );

  const home = tmpHome();
  capture(() => verifyCommand({ dir, phaseId: 0, home }));

  const { readDomainLedger } = require("../bin/lib/tracks/domain");
  const { config, exists } = readDomainLedger({ technology: "javascript", home });
  assert.strictEqual(exists, true);
  assert.strictEqual(config.concepts["js-routes"].achieved, true);
});

test("verify never marks done or fails if the git ledger sync throws (isolated failure domain)", () => {
  const progress = sampleProgress();
  progress.phases[0].gitTier = 1;
  const dir = tmpProject(progress);

  // A `home` that is itself a file, not a directory: writeGitTracks's
  // internal mkdirSync(..., {recursive:true}) throws ENOTDIR — this must
  // never leak into verify's own done/exitCode contract.
  const brokenHome = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "ai-learn-verify-broken-")), "not-a-dir");
  fs.writeFileSync(brokenHome, "x");

  const out = capture(() => verifyCommand({ dir, phaseId: 0, home: brokenHome }));

  assert.match(out, /marked done/);
  const { config } = readProgress(dir);
  assert.strictEqual(config.phases[0].status, "done");
  assert.strictEqual(process.exitCode, 0);
});

// Story 09.01 — the same isolated failure is no longer silent: the learner
// sees which ledger was not written, the error code and what to run.
test("a failing ledger sync is reported, the phase stays done", { skip: process.platform === "win32" || process.getuid() === 0 }, () => {
  const dir = tmpProject(sampleProgress());
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "ai-learn-verify-eacces-"));
  fs.mkdirSync(path.join(home, ".ai-learn"));
  fs.chmodSync(path.join(home, ".ai-learn"), 0o555);

  try {
    const out = capture(() => verifyCommand({ dir, phaseId: 0, home }));

    assert.match(out, /ledger git non mis à jour : EACCES \(/);
    assert.match(out, /ledger tests non mis à jour : EACCES/);
    assert.match(out, /ai-learn ledgers --sync/);
    assert.match(out, /marked done/);
    assert.strictEqual(readProgress(dir).config.phases[0].status, "done");
    assert.strictEqual(process.exitCode, 0);
  } finally {
    fs.chmodSync(path.join(home, ".ai-learn"), 0o755);
  }
});

test("verify with --no-mark keeps the phase pending despite a green checkpoint", () => {
  const dir = tmpProject(sampleProgress());

  capture(() => verifyCommand({ dir, phaseId: 0, noMark: true }));

  const { config } = readProgress(dir);
  assert.strictEqual(config.phases[0].status, "pending");
});

test("verify does not mark done when a norm violation exists in the learner's files, even though the checkpoint passes", () => {
  const dir = tmpProject(sampleProgress());
  fs.mkdirSync(path.join(dir, ".ai-learn"), { recursive: true });
  fs.writeFileSync(path.join(dir, ".ai-learn", "norm.json"), JSON.stringify({ version: 1, maxFunctionLines: 3 }));
  fs.mkdirSync(path.join(dir, "src"), { recursive: true });
  fs.writeFileSync(
    path.join(dir, "src", "index.js"),
    "function tooLong() {\n  const a = 1;\n  const b = 2;\n  const c = 3;\n  return a + b + c;\n}\n",
  );

  const out = capture(() => verifyCommand({ dir, phaseId: 0 }));

  assert.match(out, /Norme \(clean code\)/);
  assert.match(out, /function `tooLong` is 6 lines \(max 3\)/);
  assert.doesNotMatch(out, /marked done/);

  const { config } = readProgress(dir);
  assert.strictEqual(config.phases[0].status, "pending");
  assert.strictEqual(process.exitCode, 1);

  const runs = fs.readdirSync(runsDir(dir)).filter((f) => f.endsWith("-verify.json"));
  const evidence = JSON.parse(fs.readFileSync(path.join(runsDir(dir), runs[0]), "utf8"));
  assert.strictEqual(evidence.ok, false);
  assert.strictEqual(evidence.norm.ok, false);
  assert.strictEqual(evidence.norm.violations.length, 1);
});

test("verify marks done once the norm violation is fixed, with checkpoint and stress otherwise unchanged", () => {
  const dir = tmpProject(sampleProgress());
  fs.mkdirSync(path.join(dir, ".ai-learn"), { recursive: true });
  fs.writeFileSync(path.join(dir, ".ai-learn", "norm.json"), JSON.stringify({ version: 1, maxFunctionLines: 3 }));
  fs.mkdirSync(path.join(dir, "src"), { recursive: true });
  fs.writeFileSync(path.join(dir, "src", "index.js"), "function fine() {\n  return 1;\n}\n");

  const out = capture(() => verifyCommand({ dir, phaseId: 0 }));

  assert.doesNotMatch(out, /Norme \(clean code\)/);
  assert.match(out, /marked done/);

  const { config } = readProgress(dir);
  assert.strictEqual(config.phases[0].status, "done");
  assert.strictEqual(process.exitCode, 0);
});

test("verify with --no-mark still computes and logs the norm identically, without marking done", () => {
  const dir = tmpProject(sampleProgress());
  fs.mkdirSync(path.join(dir, ".ai-learn"), { recursive: true });
  fs.writeFileSync(path.join(dir, ".ai-learn", "norm.json"), JSON.stringify({ version: 1, maxFunctionLines: 3 }));
  fs.mkdirSync(path.join(dir, "src"), { recursive: true });
  fs.writeFileSync(
    path.join(dir, "src", "index.js"),
    "function tooLong() {\n  const a = 1;\n  const b = 2;\n  const c = 3;\n  return a + b + c;\n}\n",
  );

  const out = capture(() => verifyCommand({ dir, phaseId: 0, noMark: true }));

  assert.match(out, /Norme \(clean code\)/);
  const { config } = readProgress(dir);
  assert.strictEqual(config.phases[0].status, "pending");
});

test("verify does not mark done when a declared artifact is missing, even though the checkpoint passes", () => {
  const progress = sampleProgress();
  progress.phases[0].artifacts = ["docs/phase-0-notes.md"];
  const dir = tmpProject(progress);

  const out = capture(() => verifyCommand({ dir, phaseId: 0 }));

  assert.match(out, /Artefacts manquants/);
  assert.match(out, /docs\/phase-0-notes\.md/);
  assert.doesNotMatch(out, /marked done/);

  const { config } = readProgress(dir);
  assert.strictEqual(config.phases[0].status, "pending");
  assert.strictEqual(process.exitCode, 1);

  const runs = fs.readdirSync(runsDir(dir)).filter((f) => f.endsWith("-verify.json"));
  const evidence = JSON.parse(fs.readFileSync(path.join(runsDir(dir), runs[0]), "utf8"));
  assert.strictEqual(evidence.ok, false);
  assert.deepStrictEqual(evidence.missingArtifacts, ["docs/phase-0-notes.md"]);
});

test("verify marks done once the declared artifact exists", () => {
  const progress = sampleProgress();
  progress.phases[0].artifacts = ["docs/phase-0-notes.md"];
  const dir = tmpProject(progress);
  fs.mkdirSync(path.join(dir, "docs"), { recursive: true });
  fs.writeFileSync(path.join(dir, "docs", "phase-0-notes.md"), "# notes");

  const out = capture(() => verifyCommand({ dir, phaseId: 0 }));

  assert.match(out, /marked done/);
  const { config } = readProgress(dir);
  assert.strictEqual(config.phases[0].status, "done");
});

test("verify suggests a per-phase commit once the phase is marked done", () => {
  const dir = tmpProject(sampleProgress());

  const out = capture(() => verifyCommand({ dir, phaseId: 0 }));

  assert.match(out, /git add -A && git commit -m "feat\(phase-0\): Phase zero"/);
  assert.match(out, /add -A\s+indexe tout/);
  assert.match(out, /commit -m\s+enregistre/);
  assert.match(out, /Conventional Commits/);
  assert.match(out, /hook commit-msg/);
});

test("verify refuses an unknown phase id", () => {
  const dir = tmpProject(sampleProgress());
  assert.throws(() => verifyCommand({ dir, phaseId: 42 }));
});

test("verify refuses a phase without a checkpoint command", () => {
  const progress = sampleProgress();
  delete progress.phases[0].checkpoint;
  const dir = tmpProject(progress);

  assert.throws(() => verifyCommand({ dir, phaseId: 0 }));
});

test("verify writes a sourceHash covering the learner's files and the checkpoint file", () => {
  const dir = tmpProject(sampleProgress());
  require("fs").mkdirSync(path.join(dir, "src"), { recursive: true });
  fs.writeFileSync(path.join(dir, "src", "index.js"), "console.log('hi');\n");

  capture(() => verifyCommand({ dir, phaseId: 0 }));

  const runs = fs.readdirSync(runsDir(dir)).filter((f) => f.endsWith("-verify.json"));
  const evidence = JSON.parse(fs.readFileSync(path.join(runsDir(dir), runs[0]), "utf8"));

  assert.strictEqual(evidence.sourceHash.algo, "sha256");
  assert.match(evidence.sourceHash.digest, /^[0-9a-f]{64}$/);
  assert.ok(evidence.sourceHash.files >= 1);
});

test("verify's sourceHash digest is stable across two runs with no change", () => {
  const dir = tmpProject(sampleProgress());
  fs.mkdirSync(path.join(dir, "src"), { recursive: true });
  fs.writeFileSync(path.join(dir, "src", "a.js"), "const a = 1;\n");
  fs.writeFileSync(path.join(dir, "src", "b.js"), "const b = 2;\n");

  capture(() => verifyCommand({ dir, phaseId: 0, noMark: true }));
  capture(() => verifyCommand({ dir, phaseId: 0, noMark: true }));

  const runs = fs.readdirSync(runsDir(dir)).filter((f) => f.endsWith("-verify.json")).sort();
  const first = JSON.parse(fs.readFileSync(path.join(runsDir(dir), runs[0]), "utf8"));
  const second = JSON.parse(fs.readFileSync(path.join(runsDir(dir), runs[1]), "utf8"));

  assert.strictEqual(first.sourceHash.digest, second.sourceHash.digest);
});

// -----------------------------------------------------------------------
// Demotion (story 01.02) — verify is the only writer of a phase's status,
// symmetric in both directions: it promotes to done on a pass, and demotes
// a done phase back to in_progress on a failure.
// -----------------------------------------------------------------------

test("a failing re-verify demotes a done phase to in_progress, with an explicit message", () => {
  const dir = tmpProject(sampleProgress());
  capture(() => verifyCommand({ dir, phaseId: 0 }));

  let { config } = readProgress(dir);
  assert.strictEqual(config.phases[0].status, "done");

  config.phases[0].checkpoint = 'node -e "process.exit(1)"';
  fs.writeFileSync(progressPath(dir), JSON.stringify(config, null, 2));

  const out = capture(() => verifyCommand({ dir, phaseId: 0 }));

  assert.match(out, /demoted: done → in_progress/);
  ({ config } = readProgress(dir));
  assert.strictEqual(config.phases[0].status, "in_progress");
  assert.strictEqual(process.exitCode, 1);
});

test("verify --no-mark on a done phase does not demote it, even though the checkpoint now fails", () => {
  const dir = tmpProject(sampleProgress());
  capture(() => verifyCommand({ dir, phaseId: 0 }));

  let { config } = readProgress(dir);
  config.phases[0].checkpoint = 'node -e "process.exit(1)"';
  fs.writeFileSync(progressPath(dir), JSON.stringify(config, null, 2));

  capture(() => verifyCommand({ dir, phaseId: 0, noMark: true }));

  ({ config } = readProgress(dir));
  assert.strictEqual(config.phases[0].status, "done");
});

test("a done phase reproven successfully after going stale stays/returns done with fresh evidence", () => {
  const dir = tmpProject(sampleProgress());
  fs.mkdirSync(path.join(dir, "src"), { recursive: true });
  fs.writeFileSync(path.join(dir, "src", "index.js"), "console.log('hi');\n");

  capture(() => verifyCommand({ dir, phaseId: 0 }));
  fs.writeFileSync(path.join(dir, "src", "index.js"), "console.log('changed');\n");

  const out = capture(() => verifyCommand({ dir, phaseId: 0 }));

  assert.match(out, /marked done/);
  const { config } = readProgress(dir);
  assert.strictEqual(config.phases[0].status, "done");

  const runs = fs.readdirSync(runsDir(dir)).filter((f) => f.endsWith("-verify.json")).sort();
  const latest = JSON.parse(fs.readFileSync(path.join(runsDir(dir), runs[runs.length - 1]), "utf8"));
  assert.strictEqual(latest.ok, true);
});

test("demoting a done phase does not touch the git or domain ledgers", () => {
  const progress = sampleProgress();
  progress.phases[0].gitTier = 1;
  const dir = tmpProject(progress);
  spawnGit(["init", "-b", "main"], { cwd: dir });
  spawnGit(["-C", dir, "config", "user.name", "t"]);
  spawnGit(["-C", dir, "config", "user.email", "t@t"]);
  fs.writeFileSync(path.join(dir, "a.txt"), "1");
  spawnGit(["-C", dir, "add", "."]);
  spawnGit(["-C", dir, "commit", "-m", "feat: a"]);

  const home = tmpHome();
  capture(() => verifyCommand({ dir, phaseId: 0, home }));

  const { readDomainLedger } = require("../bin/lib/tracks/domain");
  const gitBefore = readGitTracks({ home }).config;
  const domainBefore = readDomainLedger({ technology: "javascript", home });

  let { config } = readProgress(dir);
  config.phases[0].checkpoint = 'node -e "process.exit(1)"';
  fs.writeFileSync(progressPath(dir), JSON.stringify(config, null, 2));

  capture(() => verifyCommand({ dir, phaseId: 0, home }));

  const gitAfter = readGitTracks({ home }).config;
  const domainAfter = readDomainLedger({ technology: "javascript", home });

  assert.deepStrictEqual(gitAfter, gitBefore);
  assert.deepStrictEqual(domainAfter, domainBefore);
});

// -----------------------------------------------------------------------
// Predictions (story 01.04) — verify hard-blocks `done` on a phase whose
// recorded prediction count is short of `predictionsRequired`, symmetric to
// the norm and artifacts checks above. Retro-compat (no predictions.json at
// all) never blocks — see plan.md Decisions.
// -----------------------------------------------------------------------

test("verify blocks on missing predictions: 1/2 recorded does not mark the phase done", () => {
  const progress = sampleProgress();
  progress.phases[0].predictionsRequired = 2;
  const dir = tmpProject(progress);
  recordPrediction(dir, progress, { phaseId: 0, prediction: "one" });

  const out = capture(() => verifyCommand({ dir, phaseId: 0 }));

  assert.match(out, /Prédictions/);
  assert.match(out, /phase 0: 1\/2 recorded predictions; 1 missing/);
  assert.doesNotMatch(out, /marked done/);

  const { config } = readProgress(dir);
  assert.strictEqual(config.phases[0].status, "pending");
  assert.strictEqual(process.exitCode, 1);
});

test("verify marks done once the required prediction count is reached", () => {
  const progress = sampleProgress();
  progress.phases[0].predictionsRequired = 2;
  const dir = tmpProject(progress);
  recordPrediction(dir, progress, { phaseId: 0, prediction: "one" });
  recordPrediction(dir, progress, { phaseId: 0, prediction: "two" });

  const out = capture(() => verifyCommand({ dir, phaseId: 0 }));

  assert.doesNotMatch(out, /Prédictions/);
  assert.match(out, /marked done/);

  const { config } = readProgress(dir);
  assert.strictEqual(config.phases[0].status, "done");
});

test("verify never blocks on predictions when predictionsRequired is absent", () => {
  const progress = sampleProgress();
  delete progress.phases[0].predictionsRequired;
  const dir = tmpProject(progress);

  const out = capture(() => verifyCommand({ dir, phaseId: 0 }));
  assert.match(out, /marked done/);
});

test("verify never blocks on predictions when predictionsRequired is 0", () => {
  const dir = tmpProject(sampleProgress()); // predictionsRequired: 0 by default

  const out = capture(() => verifyCommand({ dir, phaseId: 0 }));
  assert.match(out, /marked done/);
});

test("verify never blocks a legacy project with no predictions.json at all, even with predictionsRequired set", () => {
  const progress = sampleProgress();
  progress.phases[0].predictionsRequired = 3;
  const dir = tmpProject(progress);

  const out = capture(() => verifyCommand({ dir, phaseId: 0 }));

  assert.match(out, /marked done/);
  const { config } = readProgress(dir);
  assert.strictEqual(config.phases[0].status, "done");
});

test("verify's evidence carries a predictions section symmetric to norm", () => {
  const progress = sampleProgress();
  progress.phases[0].predictionsRequired = 1;
  const dir = tmpProject(progress);
  recordPrediction(dir, progress, { phaseId: 0, prediction: "x" });

  capture(() => verifyCommand({ dir, phaseId: 0 }));

  const runs = fs.readdirSync(runsDir(dir)).filter((f) => f.endsWith("-verify.json"));
  const evidence = JSON.parse(fs.readFileSync(path.join(runsDir(dir), runs[0]), "utf8"));

  assert.strictEqual(evidence.predictions.ok, true);
  assert.strictEqual(evidence.predictions.required, 1);
  assert.strictEqual(evidence.predictions.count, 1);
  assert.strictEqual(evidence.predictions.missing, 0);
});

test("verify --no-mark still computes and logs the predictions gap, without marking done", () => {
  const progress = sampleProgress();
  progress.phases[0].predictionsRequired = 2;
  const dir = tmpProject(progress);
  recordPrediction(dir, progress, { phaseId: 0, prediction: "one" });

  const out = capture(() => verifyCommand({ dir, phaseId: 0, noMark: true }));

  assert.match(out, /phase 0: 1\/2 recorded predictions; 1 missing/);
  const { config } = readProgress(dir);
  assert.strictEqual(config.phases[0].status, "pending");
});

test("a failing stressCheckpoint and missing predictions are both reported, neither masking the other", () => {
  const progress = sampleProgress();
  progress.phases[0].stressCheckpoint = 'node -e "process.exit(7)"';
  progress.phases[0].predictionsRequired = 1;
  const dir = tmpProject(progress);
  // An empty but *valid* predictions.json — data exists, so retro-compat
  // does not suppress the block (unlike the "no file at all" case above).
  fs.mkdirSync(path.join(dir, ".ai-learn"), { recursive: true });
  fs.writeFileSync(path.join(dir, ".ai-learn", "predictions.json"), JSON.stringify({ version: 1, entries: [] }));

  const out = capture(() => verifyCommand({ dir, phaseId: 0 }));

  assert.match(out, /\[exit 7\]/);
  assert.match(out, /phase 0: 0\/1 recorded predictions; 1 missing/);
  assert.doesNotMatch(out, /marked done/);
  assert.strictEqual(process.exitCode, 1);
});

// `recordPrediction` always stamps `at`/`revealedAt` together (story 01.04
// plan.md: the two-step API doesn't exist yet), so an antériorité anomaly can
// only be produced today by a hand-written predictions.json — exactly what
// `predictionsReport`'s own unit tests do. This test proves the wiring
// `verifyCommand` puts on top of that report (the "Antériorité" log block and
// evidence.predictions.anomalies) actually fires end-to-end, not just at the
// predictionsReport() unit level (review finding, story 01.04).
test("verify signals — never blocks on — a prediction recorded after its own revelation", () => {
  const progress = sampleProgress();
  progress.phases[0].predictionsRequired = 1;
  const dir = tmpProject(progress);
  fs.mkdirSync(path.join(dir, ".ai-learn"), { recursive: true });
  fs.writeFileSync(
    path.join(dir, ".ai-learn", "predictions.json"),
    JSON.stringify({
      version: 1,
      entries: [
        { id: "a", phaseId: 0, at: "2026-01-02T00:00:00.000Z", prediction: "x", revealedAt: "2026-01-01T00:00:00.000Z" },
      ],
    }),
  );

  const out = capture(() => verifyCommand({ dir, phaseId: 0 }));

  assert.match(out, /Antériorité prédiction\/révélation/);
  assert.match(out, /prédiction a enregistrée après sa révélation/);
  assert.match(out, /marked done/);

  const runs = fs.readdirSync(runsDir(dir)).filter((f) => f.endsWith("-verify.json"));
  const evidence = JSON.parse(fs.readFileSync(path.join(runsDir(dir), runs[0]), "utf8"));

  assert.strictEqual(evidence.predictions.anomalies.length, 1);
  assert.strictEqual(evidence.predictions.anomalies[0].id, "a");
});

// -----------------------------------------------------------------------
// Mutation (story 02.03) — `verify` hard-blocks `done` on a phase with
// `mutation: true` that has at least one survived mutant, symmetric to norm,
// artifacts and predictions above. A phase without `phase.mutation` is never
// affected (retro-compat, like predictions' `predictionsRequired` absent).
// -----------------------------------------------------------------------

test("verify marks done a phase whose mutation is required and every mutant found is killed", () => {
  const dir = tmpProject(mutationPhase(STRONG_CHECKPOINT));
  writeFile(dir, "src/index.js", "function isReady() {\n  return true;\n}\n\nmodule.exports = { isReady };\n");

  const out = capture(() => verifyCommand({ dir, phaseId: 0 }));

  assert.doesNotMatch(out, /\nMutation :/);
  assert.match(out, /marked done/);

  const { config } = readProgress(dir);
  assert.strictEqual(config.phases[0].status, "done");
  assert.strictEqual(process.exitCode, 0);

  const runs = fs.readdirSync(runsDir(dir)).filter((f) => f.endsWith("-verify.json"));
  const evidence = JSON.parse(fs.readFileSync(path.join(runsDir(dir), runs[0]), "utf8"));
  assert.strictEqual(evidence.mutation.ok, true);
  assert.strictEqual(evidence.mutation.required, true);
  assert.strictEqual(evidence.mutation.score, 100);
});

test("verify blocks a phase with a survived mutant: not marked done, message lists the site", () => {
  const dir = tmpProject(mutationPhase(WEAK_CHECKPOINT));
  writeFile(dir, "src/index.js", "function isReady() {\n  return true;\n}\n\nmodule.exports = { isReady };\n");

  const out = capture(() => verifyCommand({ dir, phaseId: 0 }));

  assert.match(out, /\nMutation :/);
  assert.match(out, /src\/index\.js:2 — boolean-literal — SURVÉCU/);
  assert.match(out, /ai-learn mutate --phase 0/);
  assert.doesNotMatch(out, /marked done/);

  const { config } = readProgress(dir);
  assert.strictEqual(config.phases[0].status, "pending");
  assert.strictEqual(process.exitCode, 1);

  const runs = fs.readdirSync(runsDir(dir)).filter((f) => f.endsWith("-verify.json"));
  const evidence = JSON.parse(fs.readFileSync(path.join(runsDir(dir), runs[0]), "utf8"));
  assert.strictEqual(evidence.mutation.ok, false);
  assert.strictEqual(evidence.mutation.survived.length, 1);
  assert.strictEqual(evidence.mutation.survived[0].file, "src/index.js");
});

test("verify does not block a phase with mutation required but no mutable site in scope", () => {
  const dir = tmpProject(mutationPhase('node -e "process.exit(0)"'));
  writeFile(dir, "src/index.js", "module.exports = { add: (a, b) => a + b };\n");

  const out = capture(() => verifyCommand({ dir, phaseId: 0 }));

  assert.doesNotMatch(out, /\nMutation :/);
  assert.match(out, /marked done/);
  assert.strictEqual(process.exitCode, 0);

  const runs = fs.readdirSync(runsDir(dir)).filter((f) => f.endsWith("-verify.json"));
  const evidence = JSON.parse(fs.readFileSync(path.join(runsDir(dir), runs[0]), "utf8"));
  assert.strictEqual(evidence.mutation.ok, true);
  assert.strictEqual(evidence.mutation.score, null);
});

test("verify reports mutation.required=false without blocking when phase.mutation is absent", () => {
  const dir = tmpProject(sampleProgress());
  writeFile(dir, "src/index.js", "function isReady() {\n  return true;\n}\nmodule.exports = { isReady };\n");

  const out = capture(() => verifyCommand({ dir, phaseId: 0 }));

  assert.doesNotMatch(out, /\nMutation :/);
  assert.match(out, /marked done/);

  const runs = fs.readdirSync(runsDir(dir)).filter((f) => f.endsWith("-verify.json"));
  const evidence = JSON.parse(fs.readFileSync(path.join(runsDir(dir), runs[0]), "utf8"));
  assert.strictEqual(evidence.mutation.required, false);
  assert.strictEqual(evidence.mutation.ok, true);
});

test("verify never computes mutation when the base checkpoint is already red — the file is never touched", () => {
  const dir = tmpProject(mutationPhase('node -e "process.exit(1)"'));
  const original = "function isReady() {\n  return true;\n}\nmodule.exports = { isReady };\n";
  writeFile(dir, "src/index.js", original);

  const out = capture(() => verifyCommand({ dir, phaseId: 0 }));

  assert.doesNotMatch(out, /\nMutation :/);
  assert.strictEqual(process.exitCode, 1);
  assert.strictEqual(fs.readFileSync(path.join(dir, "src/index.js"), "utf8"), original);

  const runs = fs.readdirSync(runsDir(dir)).filter((f) => f.endsWith("-verify.json"));
  const evidence = JSON.parse(fs.readFileSync(path.join(runsDir(dir), runs[0]), "utf8"));
  assert.strictEqual(evidence.mutation.required, true);
  assert.strictEqual(evidence.mutation.mutants, 0);
  assert.strictEqual(evidence.mutation.ok, true);
});

test("a done phase whose mutation regresses (a mutant starts surviving) is demoted to in_progress", () => {
  const dir = tmpProject(mutationPhase(STRONG_CHECKPOINT));
  writeFile(dir, "src/index.js", "function isReady() {\n  return true;\n}\nmodule.exports = { isReady };\n");
  capture(() => verifyCommand({ dir, phaseId: 0 }));

  let { config } = readProgress(dir);
  assert.strictEqual(config.phases[0].status, "done");

  // The checkpoint stops inspecting the return value: the same boolean mutant
  // now survives — code/test coverage regressed, not the checkpoint itself.
  config.phases[0].checkpoint = WEAK_CHECKPOINT;
  fs.writeFileSync(progressPath(dir), JSON.stringify(config, null, 2));

  const out = capture(() => verifyCommand({ dir, phaseId: 0 }));

  assert.match(out, /demoted: done → in_progress/);
  ({ config } = readProgress(dir));
  assert.strictEqual(config.phases[0].status, "in_progress");
  assert.strictEqual(process.exitCode, 1);
});

test("verify --no-mark on a mutation-required phase still computes mutation.ok=false without changing status", () => {
  const dir = tmpProject(mutationPhase(WEAK_CHECKPOINT));
  writeFile(dir, "src/index.js", "function isReady() {\n  return true;\n}\nmodule.exports = { isReady };\n");

  const out = capture(() => verifyCommand({ dir, phaseId: 0, noMark: true }));

  assert.match(out, /\nMutation :/);
  const { config } = readProgress(dir);
  assert.strictEqual(config.phases[0].status, "pending");

  const runs = fs.readdirSync(runsDir(dir)).filter((f) => f.endsWith("-verify.json"));
  const evidence = JSON.parse(fs.readFileSync(path.join(runsDir(dir), runs[0]), "utf8"));
  assert.strictEqual(evidence.mutation.ok, false);
});

test("verify signals a truncated mutation run for transparency, without blocking on the truncation alone", () => {
  const checkpoint =
    "node -e \"" +
    "const { isReady, inRange } = require('./src/index.js');" +
    "if (isReady() !== true) process.exit(1);" +
    "if (inRange(10) !== false) process.exit(1);" +
    "\"";
  const dir = tmpProject(mutationPhase(checkpoint));
  writeFile(
    dir,
    "src/index.js",
    "function isReady() {\n  return true;\n}\nfunction inRange(x) {\n  return x < 10;\n}\nmodule.exports = { isReady, inRange };\n",
  );
  fs.mkdirSync(path.join(dir, ".ai-learn"), { recursive: true });
  fs.writeFileSync(
    mutateConfigPath(dir),
    JSON.stringify({ version: 1, mutators: ["boolean-literal", "comparison-operator"], maxMutantsPerRun: 1, ignore: [] }),
  );

  const out = capture(() => verifyCommand({ dir, phaseId: 0 }));

  assert.match(out, /plafond de mutants atteint/);
  assert.match(out, /marked done/);

  const runs = fs.readdirSync(runsDir(dir)).filter((f) => f.endsWith("-verify.json"));
  const evidence = JSON.parse(fs.readFileSync(path.join(runsDir(dir), runs[0]), "utf8"));
  assert.strictEqual(evidence.mutation.truncated, true);
  assert.strictEqual(evidence.mutation.ok, true);
});

test("verify: a maxMutantsPerRun of 0 in .ai-learn/mutate.json never bypasses mutation testing (review finding, story 02.03)", () => {
  const dir = tmpProject(mutationPhase(WEAK_CHECKPOINT));
  writeFile(dir, "src/index.js", "function isReady() {\n  return true;\n}\nmodule.exports = { isReady };\n");
  fs.mkdirSync(path.join(dir, ".ai-learn"), { recursive: true });
  fs.writeFileSync(mutateConfigPath(dir), JSON.stringify({ version: 1, mutators: ["boolean-literal"], maxMutantsPerRun: 0, ignore: [] }));

  const out = capture(() => verifyCommand({ dir, phaseId: 0 }));

  // The weak checkpoint never inspects the mutated return value: if the
  // config's non-positive maxMutantsPerRun had been honored literally
  // (slicing the site list down to zero), no mutant would ever have been
  // tested and this run would have wrongly reported ok: true.
  assert.match(out, /\nMutation :/);
  assert.doesNotMatch(out, /marked done/);

  const runs = fs.readdirSync(runsDir(dir)).filter((f) => f.endsWith("-verify.json"));
  const evidence = JSON.parse(fs.readFileSync(path.join(runsDir(dir), runs[0]), "utf8"));
  assert.strictEqual(evidence.mutation.ok, false);
  assert.strictEqual(evidence.mutation.mutants, 1);
  assert.strictEqual(evidence.mutation.survived.length, 1);
});

test("verify recovers an orphan mutation lock left by a prior interrupted run before running the checkpoint (review finding, story 02.03)", () => {
  const dir = tmpProject(mutationPhase(STRONG_CHECKPOINT));
  const originalContent = "function isReady() {\n  return true;\n}\n\nmodule.exports = { isReady };\n";
  writeFile(dir, "src/index.js", originalContent);

  // Simulate a crash mid-mutation (Ctrl+C, kill) during a prior `verify`:
  // the file is left mutated on disk, the lock still points at the pristine
  // content — same trail `ai-learn mutate` already self-heals from.
  fs.writeFileSync(path.join(dir, "src/index.js"), originalContent.replace("true", "false"));
  fs.mkdirSync(path.join(dir, ".ai-learn"), { recursive: true });
  fs.writeFileSync(mutateLockPath(dir), JSON.stringify({ file: "src/index.js", original: originalContent }));

  const out = capture(() => verifyCommand({ dir, phaseId: 0 }));

  assert.match(out, /run précédent a été interrompu/);
  assert.strictEqual(fs.existsSync(mutateLockPath(dir)), false);
  // Recovered before the base checkpoint ran, so verify proceeds normally
  // against the real (restored) source instead of the leftover mutant.
  assert.match(out, /marked done/);
  assert.strictEqual(fs.readFileSync(path.join(dir, "src/index.js"), "utf8"), originalContent);

  const { config } = readProgress(dir);
  assert.strictEqual(config.phases[0].status, "done");
});

test("evidence records marking: applied for a normal run, skipped for --no-mark", () => {
  const dir = tmpProject(sampleProgress());
  capture(() => verifyCommand({ dir, phaseId: 0 }));

  let runs = fs.readdirSync(runsDir(dir)).filter((f) => f.endsWith("-verify.json"));
  let evidence = JSON.parse(fs.readFileSync(path.join(runsDir(dir), runs[0]), "utf8"));
  assert.strictEqual(evidence.marking, "applied");

  const dir2 = tmpProject(sampleProgress());
  capture(() => verifyCommand({ dir: dir2, phaseId: 0, noMark: true }));

  runs = fs.readdirSync(runsDir(dir2)).filter((f) => f.endsWith("-verify.json"));
  evidence = JSON.parse(fs.readFileSync(path.join(runsDir(dir2), runs[0]), "utf8"));
  assert.strictEqual(evidence.marking, "skipped");
});

// Story 02.05 — the cross-project tests ledger is fed by a passing verify, and
// can never make verify itself fail.
// -----------------------------------------------------------------------

test("verify feeds ~/.ai-learn/tracks/tests.json from a passing mutation phase", () => {
  const dir = tmpProject(mutationPhase(STRONG_CHECKPOINT));
  writeFile(dir, "src/index.js", "function isReady() {\n  return true;\n}\n\nmodule.exports = { isReady };\n");
  const home = tmpHome();

  capture(() => verifyCommand({ dir, phaseId: 0, home }));

  const { readTestsTracks } = require("../bin/lib/tracks/tests");
  const { config } = readTestsTracks({ home });
  assert.strictEqual(config.tiers["1"].achieved, true);
  assert.strictEqual(config.tiers["2"].achieved, true);
  assert.ok(config.projects[dir]);
});

test("verify observes rouge d'abord across a failing then a passing run", () => {
  const dir = tmpProject(mutationPhase(WEAK_CHECKPOINT));
  writeFile(dir, "src/index.js", "function isReady() {\n  return true;\n}\n\nmodule.exports = { isReady };\n");
  const home = tmpHome();

  capture(() => verifyCommand({ dir, phaseId: 0, home }));
  assert.strictEqual(readProgress(dir).config.phases[0].status, "pending");
  assert.strictEqual(process.exitCode, 1);
  process.exitCode = 0;

  const progress = readProgress(dir).config;
  progress.phases[0].checkpoint = STRONG_CHECKPOINT;
  fs.writeFileSync(progressPath(dir), `${JSON.stringify(progress, null, 2)}\n`);
  capture(() => verifyCommand({ dir, phaseId: 0, home }));
  assert.strictEqual(readProgress(dir).config.phases[0].status, "done");

  const { readTestsTracks } = require("../bin/lib/tracks/tests");
  assert.strictEqual(readTestsTracks({ home }).config.tiers["3"].achieved, true);
});

test("verify réussit même si le sync tests.json échoue", () => {
  const dir = tmpProject(mutationPhase(STRONG_CHECKPOINT));
  writeFile(dir, "src/index.js", "function isReady() {\n  return true;\n}\n\nmodule.exports = { isReady };\n");
  const brokenHome = path.join(tmpHome(), "a-file");
  fs.writeFileSync(brokenHome, "not a directory");

  const out = capture(() => verifyCommand({ dir, phaseId: 0, home: brokenHome }));

  assert.match(out, /marked done/);
  assert.strictEqual(readProgress(dir).config.phases[0].status, "done");
});

// -----------------------------------------------------------------------
// verify --stale (story 04.03) — re-prove every stale done phase through the
// normal verify path, then separate "toujours vert" from a real regression.
// -----------------------------------------------------------------------

function twoPhaseProgress() {
  return sampleProgress({
    phases: [
      { id: 0, name: "Zero", status: "pending", checkpoint: 'node -e "process.exit(0)"', artifacts: [], predictionsRequired: 0 },
      { id: 1, name: "One", status: "pending", checkpoint: 'node -e "process.exit(0)"', artifacts: [], predictionsRequired: 0 },
    ],
  });
}

test("verify --stale re-proves every stale phase that still passes and lists them as toujours vert", () => {
  const dir = tmpProject(twoPhaseProgress());
  writeFile(dir, "src/index.js", "console.log('hi');\n");

  capture(() => verifyCommand({ dir, phaseId: 0 }));
  capture(() => verifyCommand({ dir, phaseId: 1 }));
  writeFile(dir, "src/index.js", "console.log('changed');\n");

  const out = capture(() => staleCommand({ dir }));

  assert.match(out, /toujours vert : 2 phase\(s\)/);
  assert.match(out, /✓ Phase 0 — Zero/);
  assert.match(out, /✓ Phase 1 — One/);
  assert.doesNotMatch(out, /régression :/);
  assert.strictEqual(process.exitCode, 0);

  const { config } = readProgress(dir);
  assert.strictEqual(config.phases[0].status, "done");
  assert.strictEqual(config.phases[1].status, "done");
  assert.strictEqual(fs.readdirSync(runsDir(dir)).filter((f) => f.endsWith("-verify.json")).length, 4);

  const currentHash = computeSourceHash(dir, {});
  for (const id of [0, 1]) {
    assert.strictEqual(latestEvidenceForPhase(dir, id).sourceHash.digest, currentHash.digest);
  }
});

test("verify --stale classifies a failing checkpoint as a regression, cites the failure and leaves it unproven", () => {
  const dir = tmpProject(sampleProgress());
  writeFile(dir, "src/index.js", "console.log('hi');\n");
  capture(() => verifyCommand({ dir, phaseId: 0 }));

  const { config } = readProgress(dir);
  config.phases[0].checkpoint = 'node -e "process.exit(3)"';
  fs.writeFileSync(progressPath(dir), JSON.stringify(config, null, 2));
  writeFile(dir, "src/index.js", "console.log('changed');\n");

  const out = capture(() => staleCommand({ dir }));

  assert.match(out, /régression : 1 phase\(s\)/);
  assert.match(out, /✗ Phase 0 — Phase zero — exit 3/);
  assert.match(out, /demoted: done → in_progress/);
  assert.doesNotMatch(out, /toujours vert :/);
  assert.strictEqual(process.exitCode, 1);
  assert.strictEqual(readProgress(dir).config.phases[0].status, "in_progress");
});

test("verify --stale without a stale phase says so, exits 0 and writes nothing", () => {
  const dir = tmpProject(sampleProgress());
  writeFile(dir, "src/index.js", "console.log('hi');\n");
  capture(() => verifyCommand({ dir, phaseId: 0 }));
  const before = fs.readdirSync(runsDir(dir)).sort();

  const out = capture(() => staleCommand({ dir }));

  assert.match(out, /Aucune phase périmée/);
  assert.strictEqual(process.exitCode, 0);
  assert.deepStrictEqual(fs.readdirSync(runsDir(dir)).sort(), before);
  assert.strictEqual(readProgress(dir).config.phases[0].status, "done");
});

test("verify --stale leaves status writes to verify: a re-proof is marked applied by the normal path", () => {
  const dir = tmpProject(sampleProgress());
  writeFile(dir, "src/index.js", "console.log('hi');\n");
  capture(() => verifyCommand({ dir, phaseId: 0 }));
  writeFile(dir, "src/index.js", "console.log('changed');\n");

  const out = capture(() => staleCommand({ dir }));

  assert.match(out, /Phase 0 marked done/);
  assert.strictEqual(latestEvidenceForPhase(dir, 0).marking, "applied");
});

test("findStalePhases only returns done phases whose passing proof no longer matches the source", () => {
  const dir = tmpProject(twoPhaseProgress());
  writeFile(dir, "src/index.js", "console.log('hi');\n");
  capture(() => verifyCommand({ dir, phaseId: 0 }));

  let { config } = readProgress(dir);
  config.phases[1].status = "in_progress";
  fs.writeFileSync(progressPath(dir), JSON.stringify(config, null, 2));
  writeFile(dir, "src/index.js", "console.log('changed');\n");

  ({ config } = readProgress(dir));
  assert.deepStrictEqual(findStalePhases(dir, config).map((phase) => phase.id), [0]);
});

test("verify --stale keeps going when one stale phase has lost its checkpoint, and reports it as a regression", () => {
  const dir = tmpProject(twoPhaseProgress());
  writeFile(dir, "src/index.js", "console.log('hi');\n");
  capture(() => verifyCommand({ dir, phaseId: 0 }));
  capture(() => verifyCommand({ dir, phaseId: 1 }));

  const { config } = readProgress(dir);
  delete config.phases[0].checkpoint;
  fs.writeFileSync(progressPath(dir), JSON.stringify(config, null, 2));
  writeFile(dir, "src/index.js", "console.log('changed');\n");

  const out = capture(() => staleCommand({ dir }));

  assert.match(out, /toujours vert : 1 phase\(s\)/);
  assert.match(out, /régression : 1 phase\(s\)/);
  assert.match(out, /✗ Phase 0 — Zero — .*no checkpoint/);
  assert.strictEqual(process.exitCode, 1);
  process.exitCode = 0;
});

// -----------------------------------------------------------------------
// Story 05.01 — `predictionsRequired` ventilé par type. A phase that demands
// a reality check cannot go `done` on code predictions alone.
// -----------------------------------------------------------------------

test("verify blocks when a required reality prediction is missing, naming the type and its real/expected count", () => {
  const progress = sampleProgress();
  progress.phases[0].predictionsRequired = { code: 2, reality: 1 };
  const dir = tmpProject(progress);
  recordPrediction(dir, progress, { phaseId: 0, type: "code", prediction: "one" });
  recordPrediction(dir, progress, { phaseId: 0, type: "code", prediction: "two" });

  const out = capture(() => verifyCommand({ dir, phaseId: 0 }));

  assert.match(out, /phase 0: 2\/3 recorded predictions; 1 missing \(reality 0\/1\)/);
  assert.doesNotMatch(out, /marked done/);
  assert.strictEqual(process.exitCode, 1);
  process.exitCode = 0;

  const { config } = readProgress(dir);
  assert.strictEqual(config.phases[0].status, "pending");
});

test("verify marks done once every required prediction type is covered", () => {
  const progress = sampleProgress();
  progress.phases[0].predictionsRequired = { code: 1, reality: 1 };
  const dir = tmpProject(progress);
  recordPrediction(dir, progress, { phaseId: 0, type: "code", prediction: "one" });
  recordPrediction(dir, progress, { phaseId: 0, type: "reality", prediction: "two" });

  const out = capture(() => verifyCommand({ dir, phaseId: 0 }));

  assert.doesNotMatch(out, /Prédictions/);
  assert.match(out, /marked done/);

  const { config } = readProgress(dir);
  assert.strictEqual(config.phases[0].status, "done");
});

test("an integer predictionsRequired still counts every type together (legacy format unchanged)", () => {
  const progress = sampleProgress();
  progress.phases[0].predictionsRequired = 2;
  const dir = tmpProject(progress);
  recordPrediction(dir, progress, { phaseId: 0, type: "code", prediction: "one" });
  recordPrediction(dir, progress, { phaseId: 0, type: "reality", prediction: "two" });

  const out = capture(() => verifyCommand({ dir, phaseId: 0 }));

  assert.doesNotMatch(out, /Prédictions/);
  assert.match(out, /marked done/);
});

test("verify's evidence records the per-type gap of a ventilated requirement", () => {
  const progress = sampleProgress();
  progress.phases[0].predictionsRequired = { code: 1, reality: 1 };
  const dir = tmpProject(progress);
  recordPrediction(dir, progress, { phaseId: 0, type: "code", prediction: "one" });

  capture(() => verifyCommand({ dir, phaseId: 0 }));

  const runs = fs.readdirSync(runsDir(dir)).filter((f) => f.endsWith("-verify.json"));
  const evidence = JSON.parse(fs.readFileSync(path.join(runsDir(dir), runs[0]), "utf8"));

  assert.strictEqual(evidence.predictions.ok, false);
  assert.deepStrictEqual(evidence.predictions.requiredByType, { code: 1, reality: 1 });
  assert.deepStrictEqual(evidence.predictions.countByType, { code: 1 });
  assert.deepStrictEqual(evidence.predictions.missingByType, { reality: { expected: 1, actual: 0, missing: 1 } });
  process.exitCode = 0;
});

// -----------------------------------------------------------------------
// Story 05.05 — the tutor profile's proof gate: `proof: "transfert"` blocks
// without a real transfert prediction, `tests` keeps the current behaviour,
// and the evidence keeps `proof.tests` and `proof.mastery` distinct.
// -----------------------------------------------------------------------

function tutorProject(proof) {
  const dir = tmpProject(sampleProgress());
  writeFile(dir, ".ai-learn/tutor.json", `${JSON.stringify({ version: 1, assistance: "indices", proof }, null, 2)}\n`);
  return dir;
}

function latestVerifyEvidence(dir) {
  const runs = fs.readdirSync(runsDir(dir)).filter((f) => f.endsWith("-verify.json"));
  return JSON.parse(fs.readFileSync(path.join(runsDir(dir), runs[runs.length - 1]), "utf8"));
}

test("verify blocks when proof is transfert and the phase has no transfert prediction", () => {
  const dir = tutorProject("transfert");

  const out = capture(() => verifyCommand({ dir, phaseId: 0 }));

  assert.match(out, /Preuve de transfert/);
  assert.match(out, /aucune prédiction de type transfert pour la phase 0/);
  assert.doesNotMatch(out, /marked done/);
  assert.strictEqual(readProgress(dir).config.phases[0].status, "pending");
  assert.strictEqual(process.exitCode, 1);

  const evidence = latestVerifyEvidence(dir);
  assert.strictEqual(evidence.ok, false);
  assert.strictEqual(evidence.proof.tests, true);
  assert.strictEqual(evidence.proof.mastery, null);
});

test("verify marks done and records mastery transfert once the prediction exists", () => {
  const dir = tutorProject("transfert");
  const { config } = readProgress(dir);
  recordPrediction(dir, config, { phaseId: 0, type: "transfert", prediction: "exercice inédit" });

  const out = capture(() => verifyCommand({ dir, phaseId: 0 }));

  assert.match(out, /marked done/);
  assert.strictEqual(readProgress(dir).config.phases[0].status, "done");

  const evidence = latestVerifyEvidence(dir);
  assert.strictEqual(evidence.proof.tests, true);
  assert.strictEqual(evidence.proof.mastery, "transfert");
});

test("proof tests keeps the current behaviour and records tests mastery", () => {
  const dir = tutorProject("tests");

  const out = capture(() => verifyCommand({ dir, phaseId: 0 }));

  assert.match(out, /marked done/);
  assert.doesNotMatch(out, /Preuve de transfert/);
  assert.deepStrictEqual(latestVerifyEvidence(dir).proof, { tests: true, mastery: "tests", configInvalid: false });
});

test("a project without tutor.json keeps the current behaviour and records the default mastery", () => {
  const dir = tmpProject(sampleProgress());

  const out = capture(() => verifyCommand({ dir, phaseId: 0 }));

  assert.match(out, /marked done/);
  assert.deepStrictEqual(latestVerifyEvidence(dir).proof, { tests: true, mastery: "explication", configInvalid: false });
});

test("verify blocks on an invalid tutor.json and names the configuration error", () => {
  const dir = tmpProject(sampleProgress());
  writeFile(dir, ".ai-learn/tutor.json", `${JSON.stringify({ version: 1, assistance: "bogus", proof: "tests" })}\n`);

  const out = capture(() => verifyCommand({ dir, phaseId: 0 }));

  assert.match(out, /Profil de tuteur/);
  assert.match(out, /unknown assistance "bogus"/);
  assert.doesNotMatch(out, /marked done/);
  assert.strictEqual(readProgress(dir).config.phases[0].status, "pending");
  assert.strictEqual(process.exitCode, 1);
  assert.strictEqual(latestVerifyEvidence(dir).proof.configInvalid, true);
  process.exitCode = 0;
});

// -----------------------------------------------------------------------
// Story 07.02 — `verify --revisit`: replay without notes
// -----------------------------------------------------------------------

function provenPhaseProject() {
  const progress = sampleProgress({
    phases: [
      { id: 0, name: "Phase zero", status: "pending", checkpoint: "node -e \"\"", artifacts: [], predictionsRequired: 0, reviewAfterDays: 7 },
    ],
  });
  const dir = tmpProject(progress);
  capture(() => verifyCommand({ dir, phaseId: 0 }));
  return dir;
}

test("verify --revisit refreshes lastProvenAt, records revisit: true, and keeps the phase done", () => {
  const dir = provenPhaseProject();
  const before = latestVerifyEvidence(dir);

  const out = capture(() => verifyCommand({ dir, phaseId: 0, revisit: true }));

  assert.match(out, /Revisite prouvée/);
  assert.strictEqual(readProgress(dir).config.phases[0].status, "done");
  assert.strictEqual(process.exitCode, 0);

  const evidence = latestVerifyEvidence(dir);
  assert.strictEqual(evidence.revisit, true);
  assert.strictEqual(evidence.ok, true);
  assert.strictEqual(evidence.lastProvenAt, evidence.generatedAt);
  assert.ok(Date.parse(evidence.lastProvenAt) >= Date.parse(before.lastProvenAt));
  assert.strictEqual(evidence.marking, "skipped");
});

test("verify --revisit on a phase that is not done is a clear usage error and writes nothing", () => {
  const dir = tmpProject(sampleProgress());

  assert.throws(
    () => verifyCommand({ dir, phaseId: 0, revisit: true }),
    /Revisit is only for a proven phase.*pending/s,
  );

  assert.strictEqual(readProgress(dir).config.phases[0].status, "pending");
  assert.strictEqual(fs.existsSync(runsDir(dir)), false);
});

test("a failed revisit keeps the phase done but traces the failure in the evidence", () => {
  const dir = provenPhaseProject();
  const progress = readProgress(dir).config;
  progress.phases[0].checkpoint = 'node -e "process.exit(3)"';
  fs.writeFileSync(progressPath(dir), `${JSON.stringify(progress, null, 2)}\n`);

  const out = capture(() => verifyCommand({ dir, phaseId: 0, revisit: true }));

  assert.match(out, /Revisite échouée/);
  assert.strictEqual(readProgress(dir).config.phases[0].status, "done");
  assert.strictEqual(process.exitCode, 1);

  const evidence = latestVerifyEvidence(dir);
  assert.strictEqual(evidence.revisit, true);
  assert.strictEqual(evidence.ok, false);
  assert.strictEqual(evidence.lastProvenAt, null);
  process.exitCode = 0;
});

test("verify --revisit with --no-mark still leaves the phase done and the ledger untouched", () => {
  const dir = provenPhaseProject();

  capture(() => verifyCommand({ dir, phaseId: 0, revisit: true, noMark: true }));

  assert.strictEqual(readProgress(dir).config.phases[0].status, "done");
  const evidence = latestVerifyEvidence(dir);
  assert.strictEqual(evidence.revisit, true);
  assert.strictEqual(evidence.marking, "skipped");
});

test("a green revisit on a stale phase refreshes the proof against the current code (documented tradeoff)", () => {
  const dir = provenPhaseProject();
  writeFile(dir, "src/index.js", "console.log('changed');\n");

  capture(() => verifyCommand({ dir, phaseId: 0, revisit: true }));

  const evidence = latestVerifyEvidence(dir);
  assert.strictEqual(evidence.ok, true);
  assert.strictEqual(evidence.sourceHash.digest, computeSourceHash(dir, {}).digest);
  assert.strictEqual(readProgress(dir).config.phases[0].status, "done");
});


test("a checkpoint that ran zero tests never proves a phase", () => {
  const progress = sampleProgress();
  progress.phases[0].checkpoint = "node --test";
  const dir = tmpProject(progress);

  const out = withoutNodeTestContext(() => capture(() => verifyCommand({ dir, phaseId: 0 })));

  assert.match(out, /Aucun test exécuté/);
  assert.strictEqual(process.exitCode, 1);
  assert.notStrictEqual(readProgress(dir).config.phases[0].status, "done");
  assert.strictEqual(latestEvidenceForPhase(dir, 0), null);
});

test("verify writes learnerHash and checkpointHash next to the unchanged sourceHash", () => {
  const dir = tmpProject(sampleProgress());
  capture(() => verifyCommand({ dir, phaseId: 0 }));

  const evidence = latestEvidenceForPhase(dir, 0);
  assert.ok(evidence.sourceHash.digest);
  assert.match(evidence.learnerHash.digest, /^[0-9a-f]{64}$/);
  assert.match(evidence.checkpointHash.digest, /^[0-9a-f]{64}$/);
});
