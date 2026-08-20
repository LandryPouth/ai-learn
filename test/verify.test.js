"use strict";

const { test, beforeEach } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");

const { verifyCommand } = require("../bin/lib/verify");
const { readProgress, runsDir } = require("../bin/lib/progress");
const { capture, sampleProgress, tmpProject } = require("./helpers");

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

test("verify with --no-mark keeps the phase pending despite a green checkpoint", () => {
  const dir = tmpProject(sampleProgress());

  capture(() => verifyCommand({ dir, phaseId: 0, noMark: true }));

  const { config } = readProgress(dir);
  assert.strictEqual(config.phases[0].status, "pending");
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
