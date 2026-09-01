"use strict";

// `phaseVerdict` (bin/lib/progress.js) and `computeSourceHash` (bin/lib/source-hash.js) —
// the pure calculation behind story 01.01's three states of the verdict.
// Table-driven: no temp project needed for phaseVerdict itself, since it takes
// every fact as an argument.

const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");

const { phaseVerdict } = require("../bin/lib/progress");
const { computeSourceHash, checkpointFilePath } = require("../bin/lib/source-hash");
const { tmpProject, writeFile, sampleProgress } = require("./helpers");

const HASH_A = { algo: "sha256", files: 1, digest: "a".repeat(64) };
const HASH_B = { algo: "sha256", files: 1, digest: "b".repeat(64) };

test("phaseVerdict: pending, no checkpoint file, no evidence -> pending", () => {
  const verdict = phaseVerdict({
    phase: { status: "pending" },
    evidence: null,
    currentHash: null,
    checkpointFileExists: false,
  });
  assert.strictEqual(verdict.state, "pending");
});

test("phaseVerdict: pending, checkpoint file exists, no evidence -> unproven", () => {
  const verdict = phaseVerdict({
    phase: { status: "pending" },
    evidence: null,
    currentHash: null,
    checkpointFileExists: true,
  });
  assert.strictEqual(verdict.state, "unproven");
});

test("phaseVerdict: in_progress, checkpoint file exists, no evidence -> in-progress", () => {
  const verdict = phaseVerdict({
    phase: { status: "in_progress" },
    evidence: null,
    currentHash: null,
    checkpointFileExists: true,
  });
  assert.strictEqual(verdict.state, "in-progress");
});

test("phaseVerdict: done, evidence without sourceHash -> proven-unhashed", () => {
  const verdict = phaseVerdict({
    phase: { status: "done" },
    evidence: { ok: true },
    currentHash: HASH_A,
    checkpointFileExists: true,
  });
  assert.strictEqual(verdict.state, "proven-unhashed");
});

test("phaseVerdict: done, evidence hash matches current hash -> proven", () => {
  const verdict = phaseVerdict({
    phase: { status: "done" },
    evidence: { ok: true, sourceHash: HASH_A },
    currentHash: HASH_A,
    checkpointFileExists: true,
  });
  assert.strictEqual(verdict.state, "proven");
});

test("phaseVerdict: done, evidence hash differs from current hash -> stale", () => {
  const verdict = phaseVerdict({
    phase: { status: "done" },
    evidence: { ok: true, sourceHash: HASH_A },
    currentHash: HASH_B,
    checkpointFileExists: true,
  });
  assert.strictEqual(verdict.state, "stale");
});

test("phaseVerdict: done, no evidence -> unproven", () => {
  const verdict = phaseVerdict({
    phase: { status: "done" },
    evidence: null,
    currentHash: HASH_A,
    checkpointFileExists: true,
  });
  assert.strictEqual(verdict.state, "unproven");
});

// -----------------------------------------------------------------------
// computeSourceHash
// -----------------------------------------------------------------------

test("computeSourceHash: two calls with no modification give the same digest", () => {
  const dir = tmpProject(sampleProgress());
  writeFile(dir, "src/a.js", "const a = 1;\n");
  writeFile(dir, "src/b.js", "const b = 2;\n");

  const first = computeSourceHash(dir);
  const second = computeSourceHash(dir);

  assert.strictEqual(first.digest, second.digest);
  assert.strictEqual(first.files, 2);
});

test("computeSourceHash: file creation order does not change the digest", () => {
  const dirA = tmpProject(sampleProgress());
  writeFile(dirA, "src/a.js", "const a = 1;\n");
  writeFile(dirA, "src/z.js", "const z = 26;\n");

  const dirB = tmpProject(sampleProgress());
  writeFile(dirB, "src/z.js", "const z = 26;\n");
  writeFile(dirB, "src/a.js", "const a = 1;\n");

  assert.strictEqual(computeSourceHash(dirA).digest, computeSourceHash(dirB).digest);
});

test("computeSourceHash: the checkpoint file is included in the scope even though it's outside learnerFiles", () => {
  const dir = tmpProject(sampleProgress());
  writeFile(dir, "src/index.js", "console.log('hi');\n");
  const checkpointFile = writeFile(dir, "checkpoint/phase-0.test.mjs", "// stub\n");

  const withoutCheckpoint = computeSourceHash(dir);
  const withCheckpoint = computeSourceHash(dir, { checkpointFile });

  assert.strictEqual(withoutCheckpoint.files, 1);
  assert.strictEqual(withCheckpoint.files, 2);
  assert.notStrictEqual(withoutCheckpoint.digest, withCheckpoint.digest);
});


test("computeSourceHash: empty scope gives a stable digest with files: 0", () => {
  const dir = tmpProject(sampleProgress());
  const hash = computeSourceHash(dir);

  assert.strictEqual(hash.files, 0);
  assert.match(hash.digest, /^[0-9a-f]{64}$/);
});

test("computeSourceHash: a binary file in scope does not fail the computation", () => {
  const dir = tmpProject(sampleProgress());
  fs.mkdirSync(path.join(dir, "src"), { recursive: true });
  fs.writeFileSync(path.join(dir, "src", "blob.bin"), Buffer.from([0, 1, 2, 3, 0, 255]));

  const hash = computeSourceHash(dir);
  assert.strictEqual(hash.files, 1);
  assert.match(hash.digest, /^[0-9a-f]{64}$/);
});

test("computeSourceHash: changing a file's content changes the digest", () => {
  const dir = tmpProject(sampleProgress());
  writeFile(dir, "src/index.js", "console.log('a');\n");
  const before = computeSourceHash(dir);

  writeFile(dir, "src/index.js", "console.log('b');\n");
  const after = computeSourceHash(dir);

  assert.notStrictEqual(before.digest, after.digest);
});

test("checkpointFilePath: returns null when the command names no existing file", () => {
  const dir = tmpProject(sampleProgress());
  assert.strictEqual(checkpointFilePath(dir, "true"), null);
});

test("checkpointFilePath: resolves the first existing file token in the command", () => {
  const dir = tmpProject(sampleProgress());
  writeFile(dir, "checkpoint/phase-0.test.mjs", "// stub\n");

  const found = checkpointFilePath(dir, "node --test checkpoint/phase-0.test.mjs");
  assert.strictEqual(found, path.join(dir, "checkpoint", "phase-0.test.mjs"));
});
