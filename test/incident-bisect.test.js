"use strict";

// Story 11.04 — `ai-learn break --bisect`: a throwaway history of neutral
// commits, one of which also carries a detectable fault.

const { test, beforeEach } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const { breakCommand, resolveCommand, giveupCommand, readIncident, incidentRecordPath } = require("../bin/lib/incident");
const { bisectCommand } = require("../bin/lib/incidents/bisect");
const { readGitTracks, defaultGitTracks, validateGitTracks } = require("../bin/lib/tracks/git");
const { recordPrediction } = require("../bin/lib/predictions");
const { readProgress } = require("../bin/lib/progress");
const { capture, sampleProgress, tmpProject, writeFile, spawnGit } = require("./helpers");

beforeEach(() => {
  process.exitCode = 0;
});

const FIRST = () => 0;

function tmpHome() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "ai-learn-bisect-home-"));
}

function git(dir, ...args) {
  const res = spawnGit(["-C", dir, ...args], { encoding: "utf8" });
  assert.strictEqual(res.status, 0, res.stderr);
  return res.stdout.trim();
}

// Ten neutral sites (`===` and `.length > 0`) the checkpoint exercises, so a
// flipped comparison is caught.
function sources() {
  const parts = [];
  const names = [];

  for (let i = 0; i < 5; i += 1) {
    parts.push(`function eq${i}(a, b) {\n  return a === b;\n}\n`);
    parts.push(`function has${i}(list) {\n  return list.length > 0;\n}\n`);
    names.push(`eq${i}`, `has${i}`);
  }

  return `${parts.join("\n")}\nmodule.exports = { ${names.join(", ")} };\n`;
}

const CHECKPOINT =
  "node -e \"const m = require('./src/a.js'); for (let i = 0; i < 5; i += 1) { " +
  "if (m['eq' + i](1, 1) !== true || m['eq' + i](1, 2) !== false) process.exit(1); " +
  "if (m['has' + i]([1]) !== true || m['has' + i]([]) !== false) process.exit(1) }\"";

function project({ hook = false, journalTracked = false } = {}) {
  const dir = tmpProject(
    sampleProgress({
      phases: [{ id: 0, name: "Phase zero", status: "done", checkpoint: CHECKPOINT, artifacts: [], predictionsRequired: 0 }],
    }),
  );
  writeFile(dir, "src/a.js", sources());
  // `journalTracked` mirrors a real project: `ensureGitignore` leaves the journal tracked.
  const ignored = journalTracked ? "" : ".ai-learn/predictions.json\n.ai-learn/predictions.md\n";
  writeFile(dir, ".gitignore", `.ai-learn/incident.json\n.ai-learn/bisect.lock.json\n${ignored}`);
  git(dir, "init", "-q");

  if (hook) {
    writeFile(dir, ".githooks/commit-msg", "#!/bin/sh\necho 'commit refusé' >&2\nexit 1\n");
    fs.chmodSync(path.join(dir, ".githooks/commit-msg"), 0o755);
    git(dir, "config", "core.hooksPath", ".githooks");
  }

  git(dir, "add", "-A");
  git(dir, "-c", "user.name=t", "-c", "user.email=t@t", "commit", "-q", "--no-verify", "-m", "init");
  return dir;
}

function checkpointOk(dir) {
  const res = require("child_process").spawnSync(CHECKPOINT, { shell: true, cwd: dir });
  return res.status === 0;
}

function shas(dir, branch) {
  return git(dir, "rev-list", "--reverse", `${branch}`).split("\n").slice(1);
}

function build(dir, home, commits = 8) {
  capture(() => bisectCommand({ dir, commits, home, random: FIRST }));
  return JSON.parse(fs.readFileSync(incidentRecordPath(dir, { home }), "utf8"));
}

test("bisect refuses a dirty tree and creates no branch", () => {
  const dir = project();
  writeFile(dir, "notes.txt", "untracked\n");

  assert.throws(() => bisectCommand({ dir, commits: 8, home: tmpHome(), random: FIRST }), /arbre git non propre/);
  assert.strictEqual(git(dir, "branch", "--list", "ai-learn/*"), "");
});

test("the history is green before the faulty commit and red from it", () => {
  const dir = project();
  const record = build(dir, tmpHome());

  assert.strictEqual(git(dir, "branch", "--show-current"), record.branch);
  const list = shas(dir, record.branch);
  assert.strictEqual(list.length, 8);

  for (const sha of list) {
    assert.strictEqual(git(dir, "log", "-1", "--format=%an", sha), "ai-learn");
  }

  const faulty = list.indexOf(record.sha);
  assert.ok(faulty >= 2 && faulty < 6, "the faulty commit is in the central third");

  for (let i = 0; i < list.length; i += 1) {
    git(dir, "checkout", "-q", list[i]);
    assert.strictEqual(checkpointOk(dir), i < faulty, `commit ${i}`);
  }
});

test("every commit carries a neutral rewrite and the tree ends on the faulty state", () => {
  const dir = project();
  const record = build(dir, tmpHome());

  assert.strictEqual(checkpointOk(dir), false);
  assert.strictEqual(git(dir, "status", "--porcelain", "--untracked-files=no"), "");
  assert.strictEqual(git(dir, "rev-parse", "HEAD"), shas(dir, record.branch).pop());
});

test("a transform that breaks a checkpoint is dropped", () => {
  const dir = project();
  // `has0` stays the same text only if the swap of `eq0` is refused: a checkpoint
  // that fails whenever the file mentions `0 !== a` rejects exactly those swaps.
  const strict = CHECKPOINT.replace("const m =", "if (require('fs').readFileSync('./src/a.js', 'utf8').includes('eq0(a, b) {\\n  return b === a')) process.exit(1); const m =");
  const progress = readProgress(dir).config;
  progress.phases[0].checkpoint = strict;
  writeFile(dir, "progress.json", JSON.stringify(progress));
  git(dir, "add", "-A");
  git(dir, "-c", "user.name=t", "-c", "user.email=t@t", "commit", "-q", "--no-verify", "-m", "strict");

  const record = build(dir, tmpHome(), 6);
  const swapped = shas(dir, record.branch).filter((sha) => /function eq0\(a, b\) \{\n  return b === a;/.test(git(dir, "show", `${sha}:src/a.js`)));

  assert.deepStrictEqual(swapped, [], "the swap in eq0 would have tripped the checkpoint");
  assert.ok(shas(dir, record.branch).some((sha) => /function eq1\(a, b\) \{\n  return b === a;/.test(git(dir, "show", `${sha}:src/a.js`))), "other swaps are kept");
  assert.ok(record.sha);
});

test("the public state carries no sha nor file", () => {
  const dir = project();
  const record = build(dir, tmpHome());
  const raw = fs.readFileSync(path.join(dir, ".ai-learn", "incident.json"), "utf8");

  assert.ok(!raw.includes(record.sha));
  assert.ok(!raw.includes(record.file));
  assert.strictEqual(readIncident(dir).level, "bisect");
});

test("an exact commit prediction reaches git tier 7 and restores the branch", () => {
  const dir = project();
  const home = tmpHome();
  const record = build(dir, home);
  const { config } = readProgress(dir);

  recordPrediction(dir, config, { phaseId: 0, type: "debug", commit: record.sha.slice(0, 8), prediction: "ce commit" });
  git(dir, "revert", "--no-edit", "-n", record.sha);
  git(dir, "-c", "user.name=t", "-c", "user.email=t@t", "commit", "-q", "--no-verify", "-m", "revert");
  const out = capture(() => resolveCommand({ dir, home }));

  assert.match(out, /Palier git 7/);
  assert.strictEqual(readGitTracks({ home }).config.tiers["7"].achieved, true);
  assert.strictEqual(git(dir, "branch", "--show-current"), record.origin);
  assert.strictEqual(readIncident(dir).active, false);
});

test("a wrong commit prediction resolves without a tier", () => {
  const dir = project();
  const home = tmpHome();
  const record = build(dir, home);
  const { config } = readProgress(dir);
  const other = shas(dir, record.branch).find((sha) => sha !== record.sha);

  recordPrediction(dir, config, { phaseId: 0, type: "debug", commit: other, prediction: "celui-là" });
  git(dir, "revert", "--no-edit", "-n", record.sha);
  git(dir, "-c", "user.name=t", "-c", "user.email=t@t", "commit", "-q", "--no-verify", "-m", "revert");
  capture(() => resolveCommand({ dir, home }));

  assert.ok(!readGitTracks({ home }).exists || !readGitTracks({ home }).config.tiers["7"].achieved);
});

test("resolve refuses while the throwaway branch is not checked out", () => {
  const dir = project();
  const home = tmpHome();
  const record = build(dir, home);

  git(dir, "checkout", "-q", record.origin);

  assert.throws(() => resolveCommand({ dir, home }), /branche jetable/);
});

test("giveup restores the original branch and reveals the commit", () => {
  const dir = project();
  const home = tmpHome();
  const record = build(dir, home);
  const out = capture(() => giveupCommand({ dir, home }));

  assert.strictEqual(git(dir, "branch", "--show-current"), record.origin);
  assert.ok(out.includes(record.sha.slice(0, 10)));
  assert.ok(!readGitTracks({ home }).exists || !readGitTracks({ home }).config.tiers["7"].achieved);
});

test("the tool commits through a strict commit-msg hook", () => {
  const dir = project({ hook: true });
  const hook = fs.readFileSync(path.join(dir, ".githooks/commit-msg"), "utf8");
  const record = build(dir, tmpHome());

  assert.strictEqual(shas(dir, record.branch).length, 8);
  assert.strictEqual(fs.readFileSync(path.join(dir, ".githooks/commit-msg"), "utf8"), hook);
});

test("a detached HEAD is refused", () => {
  const dir = project();
  git(dir, "checkout", "-q", "--detach");

  assert.throws(() => bisectCommand({ dir, commits: 8, home: tmpHome(), random: FIRST }), /détaché/);
});

test("too little code to build a history is refused and the branch is gone", () => {
  const dir = project();
  writeFile(dir, "src/a.js", "function eq0(a, b) {\n  return a === b;\n}\nfunction ok() {\n  return true;\n}\nmodule.exports = { eq0, ok };\n");
  git(dir, "add", "-A");
  git(dir, "-c", "user.name=t", "-c", "user.email=t@t", "commit", "-q", "--no-verify", "-m", "small");
  const progress = readProgress(dir).config;
  progress.phases[0].checkpoint = "node -e \"const m = require('./src/a.js'); process.exit(m.eq0(1, 1) && m.ok() === true ? 0 : 1)\"";
  writeFile(dir, "progress.json", JSON.stringify(progress));
  git(dir, "add", "-A");
  git(dir, "-c", "user.name=t", "-c", "user.email=t@t", "commit", "-q", "--no-verify", "-m", "cp");

  assert.throws(() => bisectCommand({ dir, commits: 8, home: tmpHome(), random: FIRST }), /pas assez de code/);
  assert.strictEqual(git(dir, "branch", "--list", "ai-learn/*"), "");
  assert.strictEqual(fs.existsSync(path.join(dir, ".ai-learn", "bisect.lock.json")), false);
  assert.strictEqual(git(dir, "status", "--porcelain", "--untracked-files=no"), "");
});

test("an interrupted build is undone at the next run", () => {
  const dir = project();
  const origin = git(dir, "branch", "--show-current");
  git(dir, "checkout", "-q", "-b", "ai-learn/bisect-dead");
  writeFile(dir, "src/a.js", `${sources()}// half-done\n`);
  writeFile(dir, ".ai-learn/bisect.lock.json", JSON.stringify({ origin, branch: "ai-learn/bisect-dead", pending: ["src/a.js"] }));

  capture(() => breakCommand({ dir, level: 1, home: tmpHome(), random: FIRST }));

  assert.strictEqual(git(dir, "branch", "--list", "ai-learn/*"), "");
  assert.strictEqual(fs.existsSync(path.join(dir, ".ai-learn", "bisect.lock.json")), false);
});

test("a git ledger without tier 7 stays valid", () => {
  const ledger = defaultGitTracks();
  delete ledger.tiers["7"];

  assert.deepStrictEqual(validateGitTracks(ledger), []);
});

test("neutral transforms leave out operands that bind tighter than the comparison", () => {
  const { NEUTRAL_TRANSFORMS } = require("../bin/lib/faults");
  const swap = NEUTRAL_TRANSFORMS["equality-operand-swap"];

  assert.strictEqual(swap.mutate(swap.pattern.exec("return a === b;")[0]), "b === a");
  assert.strictEqual(swap.pattern.exec("x = !a === b;"), null);
  assert.strictEqual(swap.pattern.exec("typeof a === b"), null);
  assert.strictEqual(swap.pattern.exec("a === b.c"), null);
});

// Neutral sites on their own lines, one extra `ok()` the checkpoint exercises.
function withSources(dir, text) {
  writeFile(dir, "src/a.js", text);
  git(dir, "add", "-A");
  git(dir, "-c", "user.name=t", "-c", "user.email=t@t", "commit", "-q", "--no-verify", "-m", "sources");
}

test("too few neutral sites are refused, whatever the dice", () => {
  const dir = project();
  const home = tmpHome();
  const text = sources().split("\n\n").slice(0, 4).join("\n\n") + "\nfunction ok() {\n  return true;\n}\n";
  // 4 functions = 4 neutral sites + the fault line: below the minimum, refused.
  withSources(dir, text.replace(/\nmodule.exports[^\n]*/, "") + "\nmodule.exports = { eq0, has0, eq1, has1, ok };\n");
  const progress = readProgress(dir).config;
  progress.phases[0].checkpoint = "node -e \"const m = require('./src/a.js'); process.exit(m.eq0(1, 1) && m.has0([1]) && m.eq1(1, 1) && m.has1([1]) && m.ok() ? 0 : 1)\"";
  writeFile(dir, "progress.json", JSON.stringify(progress));
  git(dir, "add", "-A");
  git(dir, "-c", "user.name=t", "-c", "user.email=t@t", "commit", "-q", "--no-verify", "-m", "cp");

  assert.throws(() => bisectCommand({ dir, commits: 12, home, random: () => 0.999 }), /pas assez de code/);
  assert.strictEqual(git(dir, "branch", "--list", "ai-learn/*"), "");
  assert.strictEqual(git(dir, "status", "--porcelain", "--untracked-files=no"), "");
});

test("more commits than neutral sites reduces the history, any dice", () => {
  const dir = project();
  const home = tmpHome();
  const record = (() => {
    // 5 eq + 5 has = 10 sites, minus the fault line = 9: reduced from 12 to 9.
    capture(() => bisectCommand({ dir, commits: 12, home, random: () => 0.999 }));
    return JSON.parse(fs.readFileSync(incidentRecordPath(dir, { home }), "utf8"));
  })();

  assert.strictEqual(shas(dir, record.branch).length, 9);
  assert.strictEqual(checkpointOk(dir), false);
});

test("an interrupted rewrite never follows the learner onto their branch", () => {
  const dir = project();
  const origin = git(dir, "branch", "--show-current");
  const before = fs.readFileSync(path.join(dir, "src/a.js"), "utf8");
  let runs = 0;
  const execute = (...args) => {
    runs += 1;

    if (runs === 4) {
      throw new Error("boom");
    }

    return require("../bin/lib/exec").runCommand(...args);
  };

  assert.throws(() => bisectCommand({ dir, commits: 8, home: tmpHome(), random: FIRST, execute }), /boom/);
  assert.strictEqual(git(dir, "branch", "--show-current"), origin);
  assert.strictEqual(git(dir, "status", "--porcelain", "--untracked-files=no"), "");
  assert.strictEqual(fs.readFileSync(path.join(dir, "src/a.js"), "utf8"), before);
  assert.strictEqual(git(dir, "branch", "--list", "ai-learn/*"), "");
});

test("a no-op rewrite such as n !== n is never drawn", () => {
  const dir = project();
  withSources(dir, `${sources().replace("\nmodule.exports", "function isNan(n) {\n  return n !== n;\n}\n\nmodule.exports")}`.replace("{ eq0,", "{ isNan, eq0,"));

  for (const random of [() => 0, () => 0.5, () => 0.999]) {
    const home = tmpHome();
    capture(() => bisectCommand({ dir, commits: 10, home, random }));
    capture(() => giveupCommand({ dir, home }));
    git(dir, "branch", "-D", ...git(dir, "branch", "--list", "ai-learn/*").split("\n").map((b) => b.trim()));
  }
});

test("giveup is refused while a git bisect is in progress", () => {
  const dir = project();
  const home = tmpHome();
  const record = build(dir, home);
  const list = shas(dir, record.branch);

  git(dir, "bisect", "start", list[list.length - 1], list[0]);

  assert.throws(() => giveupCommand({ dir, home }), /git bisect reset/);
  git(dir, "bisect", "reset");
  capture(() => giveupCommand({ dir, home }));
  assert.strictEqual(git(dir, "branch", "--show-current"), record.origin);
});

test("neutral regexes skip operands that bind tighter than the comparison", () => {
  const { NEUTRAL_TRANSFORMS } = require("../bin/lib/faults");
  const swap = NEUTRAL_TRANSFORMS["equality-operand-swap"].pattern;
  const length = NEUTRAL_TRANSFORMS["length-positive"].pattern;

  for (const text of ["ok = a === b < c", "x === y << 1", "n === m instanceof C", "k === key in obj", "a in b === c"]) {
    assert.strictEqual(swap.exec(text), null, text);
  }

  for (const text of ["!x.length > 0", "-x.length > 0"]) {
    assert.strictEqual(length.exec(text), null, text);
  }
});

test("a journal committed on the throwaway branch survives the return to the original branch", () => {
  const dir = project({ journalTracked: true });
  const home = tmpHome();
  const record = build(dir, home);
  const { config } = readProgress(dir);

  recordPrediction(dir, config, { phaseId: 0, type: "debug", commit: record.sha.slice(0, 8), prediction: "ce commit" });
  git(dir, "revert", "--no-edit", "-n", record.sha);
  git(dir, "add", "-A");
  git(dir, "-c", "user.name=t", "-c", "user.email=t@t", "commit", "-q", "--no-verify", "-m", "revert");
  const out = capture(() => resolveCommand({ dir, home }));

  assert.match(out, /Palier git 7/);
  assert.strictEqual(git(dir, "branch", "--show-current"), record.origin);
  const kept = JSON.parse(fs.readFileSync(path.join(dir, ".ai-learn", "predictions.json"), "utf8"));
  assert.ok(kept.entries.some((e) => e.commit === record.sha.slice(0, 8)));
  assert.match(fs.readFileSync(path.join(dir, "docs", "plans", "predictions.md"), "utf8"), /ce commit/);
});

test("an uncommitted journal does not block the resolve", () => {
  const dir = project({ journalTracked: true });
  const home = tmpHome();
  const record = build(dir, home);
  const { config } = readProgress(dir);

  recordPrediction(dir, config, { phaseId: 0, type: "debug", commit: record.sha.slice(0, 8), prediction: "ce commit" });
  git(dir, "revert", "--no-edit", "-n", "--", record.sha);
  git(dir, "add", "src");
  git(dir, "-c", "user.name=t", "-c", "user.email=t@t", "commit", "-q", "--no-verify", "-m", "revert");

  assert.match(capture(() => resolveCommand({ dir, home })), /Incident résolu/);
});

test("a crash right after the branch is created is undone at the next run", () => {
  const dir = project();
  const origin = git(dir, "branch", "--show-current");
  git(dir, "checkout", "-q", "-b", "ai-learn/bisect-early");
  writeFile(dir, ".ai-learn/bisect.lock.json", JSON.stringify({ origin, branch: "ai-learn/bisect-early" }));

  capture(() => breakCommand({ dir, level: 1, home: tmpHome(), random: FIRST }));

  assert.strictEqual(git(dir, "branch", "--show-current"), origin);
  assert.strictEqual(git(dir, "branch", "--list", "ai-learn/*"), "");
});
