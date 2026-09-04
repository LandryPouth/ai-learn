"use strict";

const { test, beforeEach } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");

const os = require("os");
const { spawnSync } = require("child_process");
const { verifyCommand } = require("../bin/lib/verify");
const { readProgress, runsDir, progressPath } = require("../bin/lib/progress");
const { readGitTracks } = require("../bin/lib/tracks/git");
const { capture, sampleProgress, tmpProject } = require("./helpers");

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
  spawnSync("git", ["init", "-b", "main"], { cwd: dir });
  spawnSync("git", ["-C", dir, "config", "user.name", "t"]);
  spawnSync("git", ["-C", dir, "config", "user.email", "t@t"]);
  fs.writeFileSync(path.join(dir, "a.txt"), "1");
  spawnSync("git", ["-C", dir, "add", "."]);
  spawnSync("git", ["-C", dir, "commit", "-m", "feat: a"]);

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
  spawnSync("git", ["init", "-b", "main"], { cwd: dir });
  spawnSync("git", ["-C", dir, "config", "user.name", "t"]);
  spawnSync("git", ["-C", dir, "config", "user.email", "t@t"]);
  fs.writeFileSync(path.join(dir, "a.txt"), "1");
  spawnSync("git", ["-C", dir, "add", "."]);
  spawnSync("git", ["-C", dir, "commit", "-m", "feat: a"]);

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
