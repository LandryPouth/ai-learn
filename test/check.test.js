"use strict";

const { test, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");

const { checkProject, checkCommand } = require("../bin/lib/check");
const { verifyCommand } = require("../bin/lib/verify");
const { capture, sampleProgress, tmpProject, writeFile } = require("./helpers");
const { findLearningProjects } = require("../bin/lib/util");

beforeEach(() => {
  process.exitCode = 0;
});

afterEach(() => {
  // A test that intentionally fails a check leaves exitCode at 1; the file must
  // still exit cleanly or node --test reports the whole file as broken.
  process.exitCode = 0;
});

test("a phase marked done without evidence is an error", () => {
  const progress = sampleProgress();
  progress.phases[0].status = "done";
  const dir = tmpProject(progress);

  const entry = checkProject(dir);
  assert.ok(entry.issues.errors.some((e) => /marked done but has no passing evidence/.test(e.message)));
  assert.strictEqual(entry.issues.warnings.length, 0);
});

test("a done phase with a green evidence passes", () => {
  const progress = sampleProgress();
  const dir = tmpProject(progress);

  capture(() => verifyCommand({ dir, phaseId: 0 }));

  const entry = checkProject(dir);
  assert.deepStrictEqual(entry.issues.errors, []);
  assert.deepStrictEqual(entry.issues.warnings, []);
});

test("a missing artifact blocks a done phase", () => {
  const progress = sampleProgress();
  progress.phases[0].status = "done";
  progress.phases[0].artifacts = ["docs/phase-0-notes.md"];
  const dir = tmpProject(progress);

  capture(() => verifyCommand({ dir, phaseId: 0 }));

  writeFile(dir, "docs/phase-0-notes.md", "# notes");

  const entry = checkProject(dir);
  assert.deepStrictEqual(entry.issues.errors, []);

  fs.rmSync(path.join(dir, "docs", "phase-0-notes.md"));

  const entry2 = checkProject(dir);
  assert.ok(entry2.issues.errors.some((e) => /requires artifact/.test(e.message)));
});

test("stale evidence on a pending phase is a warning", () => {
  const dir = tmpProject(sampleProgress());

  capture(() => verifyCommand({ dir, phaseId: 0, noMark: true }));

  const entry = checkProject(dir);
  assert.deepStrictEqual(entry.issues.errors, []);
  assert.ok(entry.issues.warnings.some((w) => /passing evidence but is not marked done/.test(w.message)));
});

test("a declared local doc source that vanished is a warning", () => {
  const progress = sampleProgress();
  progress.docSource = { type: "local", value: "/definitely/not/a/real/path" };
  const dir = tmpProject(progress);

  const entry = checkProject(dir);
  assert.ok(entry.issues.warnings.some((w) => /declared doc source does not exist/.test(w.message)));
});

test("missing predictions in the journal is a warning", () => {
  const progress = sampleProgress();
  progress.phases[0].predictionsRequired = 2;
  const dir = tmpProject(progress);

  writeFile(dir, "docs/plans/predictions.md", "# Journal\n");

  const entry = checkProject(dir);
  assert.ok(entry.issues.warnings.some((w) => /recorded predictions/.test(w.message)));
});

test("a checkpoint file written but never verified is an error", () => {
  const progress = sampleProgress();
  progress.phases[0].checkpoint = "node --test checkpoint/phase-0.test.mjs";
  const dir = tmpProject(progress);

  writeFile(dir, "checkpoint/phase-0.test.mjs", "import { test } from 'node:test'; test('ok', () => {});");

  const entry = checkProject(dir);
  assert.ok(entry.issues.errors.some((e) => /checkpoint exists but no passing evidence/.test(e.message)));
});

test("a verified checkpoint file passes cleanly", () => {
  const progress = sampleProgress();
  progress.phases[0].checkpoint = "node --test checkpoint/phase-0.test.mjs";
  const dir = tmpProject(progress);

  writeFile(dir, "checkpoint/phase-0.test.mjs", "import { test } from 'node:test'; test('ok', () => {});");

  capture(() => verifyCommand({ dir, phaseId: 0 }));

  const entry = checkProject(dir);
  assert.deepStrictEqual(entry.issues.errors, []);
  assert.deepStrictEqual(entry.issues.warnings, []);
});

test("a non-file checkpoint (inline command) is not flagged", () => {
  const dir = tmpProject(sampleProgress());

  const entry = checkProject(dir);
  assert.deepStrictEqual(entry.issues.errors, []);
});

test("checkCommand scans every learning project under a root", () => {
  const root = fs.mkdtempSync(path.join(require("os").tmpdir(), "ai-learn-root-"));

  const good = path.join(root, "proj-a");
  fs.mkdirSync(good, { recursive: true });
  writeFile(good, "progress.json", JSON.stringify(sampleProgress({ project: "proj-a" }), null, 2));

  const bad = path.join(root, "proj-b");
  fs.mkdirSync(bad, { recursive: true });
  const badProgress = sampleProgress({ project: "proj-b" });
  badProgress.phases[0].status = "done";
  writeFile(bad, "progress.json", JSON.stringify(badProgress, null, 2));

  capture(() => verifyCommand({ dir: good, phaseId: 0 }));

  const out = capture(() => checkCommand({ root }));

  assert.match(out, /proj-a/);
  assert.match(out, /proj-b/);
  assert.match(out, /1 error\(s\)/);
  assert.match(out, /check FAILED/);
  assert.strictEqual(process.exitCode, 1);

  assert.strictEqual(findLearningProjects(root).length, 2);
});
