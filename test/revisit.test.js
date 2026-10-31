"use strict";

const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");

const { revisitCommand, revisitStatus, revisitLockPath, revisitBackupDir } = require("../bin/lib/revisit");
const { verifyCommand } = require("../bin/lib/verify");
const { readProgress, allEvidenceForPhase } = require("../bin/lib/progress");
const { mutateLockPath } = require("../bin/lib/mutate");
const { buildNextReport } = require("../bin/lib/next");
const { capture, sampleProgress, tmpProject, writeFile, spawnGit } = require("./helpers");

function git(dir, ...args) {
  const res = spawnGit(["-C", dir, "-c", "user.name=t", "-c", "user.email=t@t", "-c", "commit.gpgsign=false", ...args], { encoding: "utf8" });
  assert.strictEqual(res.status, 0, `git ${args.join(" ")}: ${res.stderr}`);
  return res.stdout;
}

function commitAll(dir, message) {
  git(dir, "add", "-A");
  git(dir, "commit", "-q", "-m", message);
}

const BASE = ["// header", "function keep() { return 1; }", ""].join("\n");
const ADDED = Array.from({ length: 12 }, (_, i) => `function added${i}() { return ${i}; }`).join("\n");
const CHECKPOINT = `node -e "const s=require('fs').readFileSync('src/app.js','utf8'); process.exit(s.includes('added11')?0:1)"`;

// A git project whose phase 2 is `done`, proven, and committed as
// `feat(phase-2)` — the 12 lines it added to src/app.js are what a revisit
// must remove.
function revisitProject({ phases } = {}) {
  const progress = sampleProgress({
    phases: [
      { id: 2, name: "Deux", status: "pending", checkpoint: CHECKPOINT, artifacts: [], predictionsRequired: 0, reviewAfterDays: 7 },
      ...(phases || []),
    ],
  });
  const dir = tmpProject(progress);

  git(dir, "init", "-q");
  writeFile(dir, ".gitignore", ".ai-learn/runs/\n.ai-learn/revisit/\n.ai-learn/revisit.lock.json\n");
  writeFile(dir, "src/app.js", BASE);
  commitAll(dir, "chore: base");

  writeFile(dir, "src/app.js", `${BASE}${ADDED}\n`);
  writeFile(dir, "checkpoint/note.txt", "hors périmètre\n");
  commitAll(dir, "feat(phase-2): deux");

  capture(() => verifyCommand({ dir, phaseId: 2 }));
  assert.strictEqual(readProgress(dir).config.phases[0].status, "done");
  commitAll(dir, "chore: preuve");

  return dir;
}

test("revisit removes exactly the lines the phase commits added", () => {
  const dir = revisitProject();

  const out = capture(() => revisitCommand({ dir, phaseId: 2 }));

  assert.strictEqual(fs.readFileSync(path.join(dir, "src/app.js"), "utf8"), BASE);
  assert.match(out, /src\/app\.js : 12 lignes retirées/);
  assert.doesNotMatch(out, /added0/, "the removed content is never printed");
  assert.strictEqual(fs.readFileSync(path.join(dir, "checkpoint/note.txt"), "utf8"), "hors périmètre\n");
  assert.ok(fs.existsSync(revisitLockPath(dir)));
  assert.ok(fs.existsSync(path.join(revisitBackupDir(dir, 2), "files", "src/app.js")));
  assert.strictEqual(revisitStatus(dir).state, "active");
});

test("a red revisit keeps the lock and the phase done", () => {
  const dir = revisitProject();
  capture(() => revisitCommand({ dir, phaseId: 2 }));

  const out = capture(() => verifyCommand({ dir, phaseId: 2, revisit: true }));

  assert.match(out, /Revisite échouée/);
  assert.strictEqual(process.exitCode, 1);
  process.exitCode = 0;
  assert.strictEqual(readProgress(dir).config.phases[0].status, "done");
  assert.ok(fs.existsSync(revisitLockPath(dir)));
  assert.strictEqual(revisitStatus(dir).state, "active");
});

test("a green revisit keeps retyped code and doubles the interval", () => {
  const dir = revisitProject();
  capture(() => revisitCommand({ dir, phaseId: 2 }));
  writeFile(dir, "src/app.js", `${BASE}function mine() {}\n// added11\n`);

  capture(() => verifyCommand({ dir, phaseId: 2, revisit: true }));

  assert.strictEqual(process.exitCode, 0);
  assert.strictEqual(revisitStatus(dir).state, "none");
  assert.strictEqual(fs.existsSync(revisitBackupDir(dir, 2)), false);
  assert.match(fs.readFileSync(path.join(dir, "src/app.js"), "utf8"), /function mine/);
  assert.strictEqual(readProgress(dir).config.phases[0].reviewAfterDays, 14);
  const last = allEvidenceForPhase(dir, 2).pop();
  assert.strictEqual(last.revisit, true);
  assert.ok(last.lastProvenAt);
});

test("the interval doubling is capped at 60 days and never lowers a larger one", () => {
  const dir = revisitProject();
  const config = readProgress(dir).config;
  config.phases[0].reviewAfterDays = 45;
  fs.writeFileSync(path.join(dir, "progress.json"), JSON.stringify(config));
  commitAll(dir, "chore: intervalle");
  capture(() => revisitCommand({ dir, phaseId: 2 }));
  writeFile(dir, "src/app.js", "// added11\n");

  capture(() => verifyCommand({ dir, phaseId: 2, revisit: true }));

  assert.strictEqual(readProgress(dir).config.phases[0].reviewAfterDays, 60);
});

test("giveup restores files byte for byte", () => {
  const dir = revisitProject();
  const before = fs.readFileSync(path.join(dir, "src/app.js"));
  capture(() => revisitCommand({ dir, phaseId: 2 }));
  writeFile(dir, "src/app.js", "retapé à moitié\r\n");

  const out = capture(() => revisitCommand({ dir, phaseId: 2, giveup: true }));

  assert.ok(before.equals(fs.readFileSync(path.join(dir, "src/app.js"))));
  assert.strictEqual(revisitStatus(dir).state, "none");
  assert.match(out, /abandonnée/);
  assert.strictEqual(readProgress(dir).config.phases[0].status, "done");
  const last = allEvidenceForPhase(dir, 2).pop();
  assert.strictEqual(last.revisit, "abandon");
  assert.strictEqual(last.lastProvenAt, null);
});

test("a file created by the phase is removed, and giveup brings it back", () => {
  const progress = sampleProgress({
    phases: [{ id: 1, name: "Un", status: "pending", checkpoint: 'node -e ""', artifacts: [], predictionsRequired: 0 }],
  });
  const dir = tmpProject(progress);
  git(dir, "init", "-q");
  writeFile(dir, ".gitignore", ".ai-learn/runs/\n.ai-learn/revisit/\n.ai-learn/revisit.lock.json\n");
  writeFile(dir, "README.md", "x\n");
  commitAll(dir, "chore: base");
  writeFile(dir, "src/new.js", "a\nb\nc\n");
  commitAll(dir, "feat(phase-1): un");
  capture(() => verifyCommand({ dir, phaseId: 1 }));
  commitAll(dir, "chore: preuve");

  const out = capture(() => revisitCommand({ dir, phaseId: 1 }));

  assert.strictEqual(fs.existsSync(path.join(dir, "src/new.js")), false);
  assert.match(out, /src\/new\.js : 3 lignes retirées/);

  capture(() => revisitCommand({ dir, phaseId: 1, giveup: true }));
  assert.strictEqual(fs.readFileSync(path.join(dir, "src/new.js"), "utf8"), "a\nb\nc\n");
});

test("revisit stacks several commits of the phase", () => {
  const dir = revisitProject();
  writeFile(dir, "src/app.js", `${BASE}${ADDED}\nfunction later() {}\n`);
  commitAll(dir, "feat(phase-2): suite");

  const out = capture(() => revisitCommand({ dir, phaseId: 2 }));

  assert.strictEqual(fs.readFileSync(path.join(dir, "src/app.js"), "utf8"), BASE);
  assert.match(out, /src\/app\.js : 13 lignes retirées/);
});

test("revisit refuses a dirty tree, naming the files, and changes nothing", () => {
  const dir = revisitProject();
  writeFile(dir, "src/app.js", `${BASE}${ADDED}\n// wip\n`);
  const before = fs.readFileSync(path.join(dir, "src/app.js"));

  assert.throws(() => revisitCommand({ dir, phaseId: 2 }), /pas propre.*src\/app\.js/s);

  assert.ok(before.equals(fs.readFileSync(path.join(dir, "src/app.js"))));
  assert.strictEqual(fs.existsSync(revisitLockPath(dir)), false);
});

test("revisit refuses when the reverse diff no longer applies", () => {
  const dir = revisitProject();
  writeFile(dir, "src/app.js", "tout autre chose\n");
  commitAll(dir, "feat(phase-3): réécriture");
  const before = fs.readFileSync(path.join(dir, "src/app.js"));

  assert.throws(() => revisitCommand({ dir, phaseId: 2 }), /retravaillée depuis/);

  assert.ok(before.equals(fs.readFileSync(path.join(dir, "src/app.js"))));
  assert.strictEqual(fs.existsSync(revisitLockPath(dir)), false);
  assert.strictEqual(fs.existsSync(revisitBackupDir(dir, 2)), false);
});

test("revisit refuses outside git, without a phase commit, on a phase not done, or during a mutation", () => {
  const plain = tmpProject(sampleProgress());
  const config = readProgress(plain).config;
  config.phases[0].status = "done";
  fs.writeFileSync(path.join(plain, "progress.json"), JSON.stringify(config));
  assert.throws(() => revisitCommand({ dir: plain, phaseId: 0 }), /pas un dépôt git/);

  const dir = revisitProject();
  assert.throws(() => revisitCommand({ dir, phaseId: 7 }), /Phase 7 introuvable/);

  const noCommit = revisitProject();
  const cfg = readProgress(noCommit).config;
  cfg.phases[0].id = 5;
  fs.writeFileSync(path.join(noCommit, "progress.json"), JSON.stringify(cfg));
  commitAll(noCommit, "chore: renumérote");
  assert.throws(() => revisitCommand({ dir: noCommit, phaseId: 5 }), /aucun commit « \(phase-5\) »/);

  const pending = tmpProject(sampleProgress());
  assert.throws(() => revisitCommand({ dir: pending, phaseId: 0 }), /on ne revisite qu'une phase prouvée/);

  fs.mkdirSync(path.join(dir, ".ai-learn"), { recursive: true });
  fs.writeFileSync(mutateLockPath(dir), "{}");
  assert.throws(() => revisitCommand({ dir, phaseId: 2 }), /mutation est en cours/);
});

test("a second revisit refuses while one is active", () => {
  const dir = revisitProject();
  capture(() => revisitCommand({ dir, phaseId: 2 }));

  assert.throws(() => revisitCommand({ dir, phaseId: 2 }), /déjà en cours/);
});

test("an interrupted removal is an orphan: next flags it and giveup resolves it", () => {
  const dir = revisitProject();
  const original = fs.readFileSync(path.join(dir, "src/app.js"));
  capture(() => revisitCommand({ dir, phaseId: 2 }));
  const lock = JSON.parse(fs.readFileSync(revisitLockPath(dir), "utf8"));
  fs.writeFileSync(revisitLockPath(dir), JSON.stringify({ ...lock, state: "applying" }));
  writeFile(dir, "src/app.js", "à moitié écrit");

  assert.strictEqual(revisitStatus(dir).state, "orphan");
  assert.deepStrictEqual(buildNextReport(dir).revisitPending, { state: "orphan", phaseId: 2 });
  assert.throws(() => verifyCommand({ dir, phaseId: 2, revisit: true }), /interrompue.*revisit 2 --giveup/s);

  capture(() => revisitCommand({ dir, phaseId: 2, giveup: true }));

  assert.ok(original.equals(fs.readFileSync(path.join(dir, "src/app.js"))));
  assert.strictEqual(revisitStatus(dir).state, "none");
});

test("the lock and backup never show up as uncommitted, even without a .gitignore entry", () => {
  const dir = revisitProject();
  fs.writeFileSync(path.join(dir, ".gitignore"), ".ai-learn/runs/\n");
  commitAll(dir, "chore: gitignore ancien");

  capture(() => revisitCommand({ dir, phaseId: 2 }));

  const status = git(dir, "status", "--porcelain");
  assert.doesNotMatch(status, /revisit/);
});

test("a plain verify or --stale is refused while a revisit is active, and the phase stays done", () => {
  const { staleCommand } = require("../bin/lib/verify");
  const dir = revisitProject();
  capture(() => revisitCommand({ dir, phaseId: 2 }));

  assert.throws(() => verifyCommand({ dir, phaseId: 2 }), /revisite est en cours/);
  assert.throws(() => staleCommand({ dir }), /revisite est en cours/);
  assert.strictEqual(readProgress(dir).config.phases[0].status, "done");
});

test("giveup refuses manifest paths that leave the project", () => {
  const dir = revisitProject();
  capture(() => revisitCommand({ dir, phaseId: 2 }));
  fs.writeFileSync(path.join(revisitBackupDir(dir, 2), "manifest.json"), JSON.stringify([{ path: "../escape.txt", existed: false }]));

  assert.throws(() => revisitCommand({ dir, phaseId: 2, giveup: true }), /Chemin refusé/);
});

test("revisit never writes through a symlink", { skip: process.platform === "win32" }, () => {
  const dir = revisitProject();
  const outside = path.join(path.dirname(dir), `outside-${path.basename(dir)}.txt`);
  fs.writeFileSync(outside, "à ne pas toucher\n");
  fs.rmSync(path.join(dir, "src/app.js"));
  fs.symlinkSync(outside, path.join(dir, "src/app.js"));
  commitAll(dir, "chore: lien");

  assert.throws(() => revisitCommand({ dir, phaseId: 2 }), /Lien symbolique refusé|retravaillée/);
  assert.strictEqual(fs.readFileSync(outside, "utf8"), "à ne pas toucher\n");
});

test("only commits whose subject is feat(phase-N) count, not ones that merely mention it", () => {
  const dir = revisitProject();
  writeFile(dir, "src/other.js", "x\ny\n");
  commitAll(dir, "fix: retouche après (phase-2)");

  const out = capture(() => revisitCommand({ dir, phaseId: 2 }));

  assert.strictEqual(fs.existsSync(path.join(dir, "src/other.js")), true, "the mention is not a phase commit");
  assert.match(out, /src\/app\.js : 12 lignes/);
});

test("a phase that removed or replaced existing code is refused, not reinjected", () => {
  const dir = revisitProject();
  writeFile(dir, "src/app.js", `${BASE.replace("return 1", "return 2")}${ADDED}\n`);
  commitAll(dir, "feat(phase-2): remplace une ligne");

  assert.throws(() => revisitCommand({ dir, phaseId: 2 }), /supprimé ou remplacé/);
  assert.strictEqual(fs.existsSync(revisitLockPath(dir)), false);
});

test("a file name with glob characters is handled literally", () => {
  const progress = sampleProgress({ phases: [{ id: 1, name: "Un", status: "pending", checkpoint: 'node -e ""', artifacts: [], predictionsRequired: 0 }] });
  const dir = tmpProject(progress);
  git(dir, "init", "-q");
  writeFile(dir, "README.md", "x\n");
  commitAll(dir, "chore: base");
  writeFile(dir, "src/[id].js", "a\nb\n");
  writeFile(dir, "src/i.js", "neighbour\n");
  commitAll(dir, "feat(phase-1): glob");
  capture(() => verifyCommand({ dir, phaseId: 1 }));
  commitAll(dir, "chore: preuve");

  const out = capture(() => revisitCommand({ dir, phaseId: 1 }));

  assert.match(out, /src\/\[id\]\.js : 2 lignes/);
  assert.match(out, /src\/i\.js : 1 lignes/);
});

test("check does not read the proof as broken after a giveup", () => {
  const { latestEvidenceForPhase } = require("../bin/lib/progress");
  const dir = revisitProject();
  const before = latestEvidenceForPhase(dir, 2);
  capture(() => revisitCommand({ dir, phaseId: 2 }));
  capture(() => revisitCommand({ dir, phaseId: 2, giveup: true }));

  assert.deepStrictEqual(latestEvidenceForPhase(dir, 2), before, "the abandon evidence is not a passing proof");
  assert.strictEqual(buildNextReport(dir).broken.length, 0);
});

test("giveup lifts an orphan lock whose backup is gone", () => {
  const dir = revisitProject();
  capture(() => revisitCommand({ dir, phaseId: 2 }));
  fs.rmSync(revisitBackupDir(dir, 2), { recursive: true, force: true });

  assert.strictEqual(revisitStatus(dir).state, "orphan");
  const out = capture(() => revisitCommand({ dir, phaseId: 2, giveup: true }));

  assert.match(out, /introuvable/);
  assert.strictEqual(revisitStatus(dir).state, "none");
});

test("verify --revisit --no-mark keeps the lock and the interval", () => {
  const dir = revisitProject();
  capture(() => revisitCommand({ dir, phaseId: 2 }));
  writeFile(dir, "src/app.js", `${BASE}${ADDED}\n`);
  capture(() => verifyCommand({ dir, phaseId: 2, revisit: true, noMark: true }));

  assert.strictEqual(revisitStatus(dir).state, "active");
  assert.strictEqual(readProgress(dir).config.phases[0].reviewAfterDays, 7);
});
