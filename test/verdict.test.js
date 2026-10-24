"use strict";

// `phaseVerdict` (bin/lib/progress.js) and `computeSourceHash` (bin/lib/source-hash.js) —
// the pure calculation behind story 01.01's three states of the verdict.
// Table-driven: no temp project needed for phaseVerdict itself, since it takes
// every fact as an argument.

const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");

const { phaseVerdict, revisitState, validateProgress } = require("../bin/lib/progress");
const { computeSourceHash, checkpointFilePath } = require("../bin/lib/source-hash");
const { normalizePortable } = require("../bin/lib/util");
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
// revisitState (story 07.01) — the spaced-repetition due date
// -----------------------------------------------------------------------

const DAY_MS = 24 * 60 * 60 * 1000;
const PROVEN_AT = "2026-09-01T10:00:00.000Z";

test("revisitState: exactly reviewAfterDays old is not due yet", () => {
  const now = new Date(Date.parse(PROVEN_AT) + 30 * DAY_MS);
  const state = revisitState({
    phase: { status: "done", reviewAfterDays: 30 },
    evidence: { lastProvenAt: PROVEN_AT },
    now,
  });

  assert.strictEqual(state.due, false);
  assert.strictEqual(state.lastProvenAt, PROVEN_AT);
  assert.strictEqual(state.reviewAfterDays, 30);
});

test("revisitState: one millisecond past reviewAfterDays is due (day-boundary)", () => {
  const now = new Date(Date.parse(PROVEN_AT) + 30 * DAY_MS + 1);
  const state = revisitState({
    phase: { status: "done", reviewAfterDays: 30 },
    evidence: { lastProvenAt: PROVEN_AT },
    now,
  });

  assert.strictEqual(state.due, true);
});

test("revisitState: a phase without reviewAfterDays never becomes due (backward-compatible)", () => {
  const state = revisitState({
    phase: { status: "done" },
    evidence: { lastProvenAt: PROVEN_AT },
    now: new Date("2030-01-01T00:00:00.000Z"),
  });

  assert.strictEqual(state, null);
});

test("revisitState: a done phase with no evidence has nothing to age from", () => {
  const state = revisitState({
    phase: { status: "done", reviewAfterDays: 7 },
    evidence: null,
    now: new Date("2030-01-01T00:00:00.000Z"),
  });

  assert.strictEqual(state, null);
});

test("revisitState: evidence predating lastProvenAt falls back to generatedAt", () => {
  const now = new Date(Date.parse(PROVEN_AT) + 8 * DAY_MS);
  const state = revisitState({
    phase: { status: "done", reviewAfterDays: 7 },
    evidence: { generatedAt: PROVEN_AT },
    now,
  });

  assert.strictEqual(state.due, true);
  assert.strictEqual(state.lastProvenAt, PROVEN_AT);
});

test("revisitState: a failed run (lastProvenAt null) is never a proof date", () => {
  const state = revisitState({
    phase: { status: "done", reviewAfterDays: 7 },
    evidence: { generatedAt: PROVEN_AT, lastProvenAt: null },
    now: new Date(Date.parse(PROVEN_AT) + 8 * DAY_MS),
  });

  assert.strictEqual(state, null);
});

test("validateProgress: an invalid reviewAfterDays is an explicit error", () => {
  for (const invalid of [0, -1, 1.5, "30"]) {
    const issues = validateProgress({
      version: 1,
      phases: [{ id: 0, name: "Zero", status: "done", reviewAfterDays: invalid }],
    });

    assert.ok(
      issues.some((issue) => issue.level === "error" && /reviewAfterDays/.test(issue.message)),
      `expected an explicit reviewAfterDays error for ${JSON.stringify(invalid)}`,
    );
  }
});

test("validateProgress: a positive integer reviewAfterDays is accepted", () => {
  const issues = validateProgress({
    version: 1,
    phases: [{ id: 0, name: "Zero", status: "done", checkpoint: "node -e \"\"", reviewAfterDays: 30 }],
  });

  assert.deepStrictEqual(issues, []);
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

test("computeSourceHash: a path with a simulated Windows backslash normalizes to the same digest input as its slash equivalent", () => {
  // Linux's path.relative never emits a backslash, so this exercises
  // normalizePortable directly — the piece sourceHashScope() relies on to
  // make the digest independent of OS path separator (see plan.md).
  assert.strictEqual(normalizePortable("checkpoint\\phase-0.test.mjs"), "checkpoint/phase-0.test.mjs");
  assert.strictEqual(normalizePortable("checkpoint\\phase-0.test.mjs"), normalizePortable("checkpoint/phase-0.test.mjs"));
});

test("computeSourceHash: the checkpoint file is included in the scope even though it's outside implementationFiles", () => {
  const dir = tmpProject(sampleProgress());
  writeFile(dir, "src/index.js", "console.log('hi');\n");
  const checkpointFile = writeFile(dir, "checkpoint/phase-0.test.mjs", "// stub\n");

  const withoutCheckpoint = computeSourceHash(dir);
  const withCheckpoint = computeSourceHash(dir, { checkpointFile });

  assert.strictEqual(withoutCheckpoint.files, 1);
  assert.strictEqual(withCheckpoint.files, 2);
  assert.notStrictEqual(withoutCheckpoint.digest, withCheckpoint.digest);
});


test("computeSourceHash: in dirigeant the scope is the implementation, not the learner's specification", () => {
  const dir = tmpProject(sampleProgress());
  writeFile(dir, ".ai-learn/guard.json", JSON.stringify({ version: 1, mode: "dirigeant" }));
  writeFile(dir, "src/index.js", "console.log('a');\n");
  writeFile(dir, "test/index.test.js", "test('a', () => {});\n");

  const before = computeSourceHash(dir);
  assert.strictEqual(before.files, 1, "only src/** is in scope");

  // Editing the specification must NOT stale the evidence...
  writeFile(dir, "test/index.test.js", "test('b', () => {});\n");
  assert.strictEqual(computeSourceHash(dir).digest, before.digest);

  // ...but editing the implementation the AI wrote must.
  writeFile(dir, "src/index.js", "console.log('b');\n");
  assert.notStrictEqual(computeSourceHash(dir).digest, before.digest);
});

test("computeSourceHash: a colocated test is specification, never part of the implementation hash", () => {
  const dir = tmpProject(sampleProgress());
  writeFile(dir, ".ai-learn/guard.json", JSON.stringify({ version: 1, mode: "dirigeant" }));
  writeFile(dir, "src/index.js", "console.log('a');\n");
  writeFile(dir, "src/index.test.js", "test('a', () => {});\n");

  const before = computeSourceHash(dir);
  assert.deepStrictEqual(before.entries.map((e) => e.path), ["src/index.js"]);

  writeFile(dir, "src/index.test.js", "test('b', () => {});\n");
  assert.strictEqual(computeSourceHash(dir).digest, before.digest);
});

test("computeSourceHash: in apprenti a colocated test stays part of the learner's proof", () => {
  const dir = tmpProject(sampleProgress());
  writeFile(dir, ".ai-learn/guard.json", JSON.stringify({ version: 1 }));
  writeFile(dir, "src/index.js", "console.log('a');\n");
  writeFile(dir, "src/index.test.js", "test('a', () => {});\n");

  const before = computeSourceHash(dir);
  assert.deepStrictEqual(
    before.entries.map((e) => e.path).sort(),
    ["src/index.js", "src/index.test.js"],
    "apprenti hashes the learner's own scope exactly as before the mode existed",
  );

  writeFile(dir, "src/index.test.js", "test('b', () => {});\n");
  assert.notStrictEqual(
    computeSourceHash(dir).digest,
    before.digest,
    "editing the learner's own spec must stale the proof in the default mode",
  );
});

test("computeSourceHash: in dirigeant a custom learner scope becomes the implementation scope", () => {
  const dir = tmpProject(sampleProgress());
  writeFile(dir, ".ai-learn/guard.json", JSON.stringify({ version: 1, mode: "dirigeant", implementationFiles: ["lib/**"] }));
  writeFile(dir, "lib/index.js", "console.log('a');\n");
  writeFile(dir, "src/index.js", "console.log('a');\n");
  writeFile(dir, "test/index.test.js", "test('a', () => {});\n");

  const before = computeSourceHash(dir);
  assert.strictEqual(before.files, 1, "the custom implementation scope is used, not a hardcoded src/**");

  writeFile(dir, "test/index.test.js", "test('b', () => {});\n");
  assert.strictEqual(computeSourceHash(dir).digest, before.digest, "the specification is outside the proof scope");

  writeFile(dir, "src/index.js", "console.log('b');\n");
  assert.strictEqual(computeSourceHash(dir).digest, before.digest, "src/** is not the implementation in this project");

  writeFile(dir, "lib/index.js", "console.log('b');\n");
  assert.notStrictEqual(computeSourceHash(dir).digest, before.digest, "editing the implementation must stale the proof");
});

test("computeSourceHash: apprenti keeps hashing the learner's own scope, even when it is not src/**", () => {
  const dir = tmpProject(sampleProgress());
  writeFile(dir, ".ai-learn/guard.json", JSON.stringify({ version: 1, learnerFiles: ["lib/**"] }));
  writeFile(dir, "lib/index.js", "console.log('a');\n");
  writeFile(dir, "src/index.js", "console.log('a');\n");

  const before = computeSourceHash(dir);
  assert.strictEqual(before.files, 1, "only the learner's lib/** is in scope");

  writeFile(dir, "src/index.js", "console.log('b');\n");
  assert.strictEqual(computeSourceHash(dir).digest, before.digest);

  writeFile(dir, "lib/index.js", "console.log('b');\n");
  assert.notStrictEqual(computeSourceHash(dir).digest, before.digest);
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
