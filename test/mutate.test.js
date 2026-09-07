"use strict";

const { test, beforeEach } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");

const {
  mutateCommand,
  findFirstSite,
  applyMutant,
  restoreOriginal,
  testMutant,
  formatSiteResult,
  invertBoolean,
} = require("../bin/lib/mutate");
const { capture, sampleProgress, tmpProject, writeFile } = require("./helpers");

beforeEach(() => {
  process.exitCode = 0;
});

// A checkpoint that never inspects the return value of the mutated function —
// it stays green whether the boolean literal is `true` or `false`, so the
// mutant always survives.
const WEAK_CHECKPOINT = 'node -e "require(\'./src/index.js\')"';

// A checkpoint that fails when the mutated literal flips — the mutant is
// killed.
const STRONG_CHECKPOINT = "node -e \"const { isReady } = require('./src/index.js'); if (isReady() !== true) process.exit(1)\"";

function projectWithBooleanLiteral(checkpoint) {
  const dir = tmpProject(
    sampleProgress({
      phases: [{ id: 0, name: "Phase zero", status: "pending", checkpoint, artifacts: [], predictionsRequired: 0 }],
    }),
  );
  writeFile(dir, "src/index.js", "function isReady() {\n  return true;\n}\n\nmodule.exports = { isReady };\n");
  return dir;
}

test("detection: finds a boolean literal outside string/comment, with its line", () => {
  const dir = projectWithBooleanLiteral(WEAK_CHECKPOINT);
  const site = findFirstSite(dir);

  assert.ok(site);
  assert.strictEqual(site.operator, "boolean-literal");
  assert.strictEqual(site.line, 2);
  assert.strictEqual(site.matchedText, "true");
});

test("detection: a literal inside a string is never chosen", () => {
  const dir = tmpProject(sampleProgress());
  writeFile(dir, "src/index.js", "const label = \"true\";\nmodule.exports = { label };\n");

  assert.strictEqual(findFirstSite(dir), null);
});

test("detection: a literal inside a comment is never chosen", () => {
  const dir = tmpProject(sampleProgress());
  writeFile(dir, "src/index.js", "// false by default\nmodule.exports = {};\n");

  assert.strictEqual(findFirstSite(dir), null);
});

test("detection: truely/falsey never match (word boundaries)", () => {
  const dir = tmpProject(sampleProgress());
  writeFile(dir, "src/index.js", "const truely = 1;\nconst falsey = 2;\nmodule.exports = { truely, falsey };\n");

  assert.strictEqual(findFirstSite(dir), null);
});

test("detection: no boolean literal at all reports no site", () => {
  const dir = tmpProject(sampleProgress());
  writeFile(dir, "src/index.js", "module.exports = { add: (a, b) => a + b };\n");

  assert.strictEqual(findFirstSite(dir), null);
});

test("detection: a boolean literal in a non-source file (prose, config) is never chosen", () => {
  const dir = tmpProject(sampleProgress());
  writeFile(dir, "src/notes.md", "# Notes\n\nThis function returns true when data is ready.\n");
  writeFile(dir, "src/config.json", JSON.stringify({ debug: true }));

  assert.strictEqual(findFirstSite(dir), null);
});

test("detection: respects a custom learnerFiles scope", () => {
  const dir = tmpProject(sampleProgress());
  writeFile(dir, ".ai-learn/guard.json", JSON.stringify({ version: 1, learnerFiles: ["lib/**"] }));
  writeFile(dir, "src/index.js", "module.exports = { ok: true };\n");
  writeFile(dir, "lib/index.js", "module.exports = { ok: false };\n");

  const site = findFirstSite(dir);
  assert.ok(site);
  assert.strictEqual(site.file.rel, "lib/index.js");
});

test("invertBoolean flips true/false in both directions", () => {
  assert.strictEqual(invertBoolean("true"), "false");
  assert.strictEqual(invertBoolean("false"), "true");
});

test("apply + restore leaves the file byte-identical to its original", () => {
  const dir = projectWithBooleanLiteral(WEAK_CHECKPOINT);
  const site = findFirstSite(dir);
  const before = fs.readFileSync(site.file.abs);

  applyMutant(site);
  assert.notDeepStrictEqual(fs.readFileSync(site.file.abs), before);

  restoreOriginal(site);
  assert.deepStrictEqual(fs.readFileSync(site.file.abs), before);
});

test("testMutant restores the file even when the executor throws", () => {
  const dir = projectWithBooleanLiteral(WEAK_CHECKPOINT);
  const site = findFirstSite(dir);
  const before = fs.readFileSync(site.file.abs);
  const phase = { checkpoint: "node -e \"process.exit(0)\"" };

  assert.throws(() => {
    testMutant(site, phase, dir, {
      execute: () => {
        throw new Error("boom");
      },
    });
  }, /boom/);

  assert.deepStrictEqual(fs.readFileSync(site.file.abs), before);
});

test("formatSiteResult matches the file:line — operator — verdict format", () => {
  const site = { file: { rel: "src/index.js" }, line: 2, operator: "boolean-literal" };
  assert.strictEqual(formatSiteResult(site, "SURVÉCU"), "src/index.js:2 — boolean-literal — SURVÉCU");
});

test("mutate reports SURVÉCU and exits 1 when the checkpoint does not detect the mutant", () => {
  const dir = projectWithBooleanLiteral(WEAK_CHECKPOINT);
  const out = capture(() => mutateCommand({ dir, phaseId: 0 }));

  assert.match(out, /SURVÉCU/);
  assert.strictEqual(process.exitCode, 1);
  // The file must be restored after the command completes.
  const content = fs.readFileSync(path.join(dir, "src/index.js"), "utf8");
  assert.match(content, /return true;/);
});

test("mutate reports TUÉ and exits 0 when the checkpoint detects the mutant", () => {
  const dir = projectWithBooleanLiteral(STRONG_CHECKPOINT);
  const out = capture(() => mutateCommand({ dir, phaseId: 0 }));

  assert.match(out, /TUÉ/);
  assert.strictEqual(process.exitCode, 0);
  const content = fs.readFileSync(path.join(dir, "src/index.js"), "utf8");
  assert.match(content, /return true;/);
});

test("mutate reports no mutable site as a success, not an error", () => {
  const dir = tmpProject(
    sampleProgress({
      phases: [
        {
          id: 0,
          name: "Phase zero",
          status: "pending",
          checkpoint: 'node -e "process.exit(0)"',
          artifacts: [],
          predictionsRequired: 0,
        },
      ],
    }),
  );
  writeFile(dir, "src/index.js", "module.exports = { add: (a, b) => a + b };\n");

  const out = capture(() => mutateCommand({ dir, phaseId: 0 }));

  assert.match(out, /Aucun mutant à tester/);
  assert.strictEqual(process.exitCode, 0);
});

test("mutate fails clearly when the checkpoint is already red before any mutation", () => {
  const dir = projectWithBooleanLiteral('node -e "process.exit(1)"');
  const out = capture(() => mutateCommand({ dir, phaseId: 0 }));

  assert.match(out, /déjà rouge/);
  assert.strictEqual(process.exitCode, 1);
  // No mutation should have been attempted: the file is untouched.
  const content = fs.readFileSync(path.join(dir, "src/index.js"), "utf8");
  assert.match(content, /return true;/);
});

test("mutate fails with verify's own message when the phase has no checkpoint", () => {
  const dir = tmpProject(
    sampleProgress({
      phases: [{ id: 0, name: "Phase zero", status: "pending", checkpoint: null, artifacts: [], predictionsRequired: 0 }],
    }),
  );

  assert.throws(() => mutateCommand({ dir, phaseId: 0 }), /has no checkpoint command/);
});

test("mutate fails when the phase id does not exist", () => {
  const dir = tmpProject(sampleProgress());
  assert.throws(() => mutateCommand({ dir, phaseId: 99 }), /No phase 99 in progress\.json/);
});
