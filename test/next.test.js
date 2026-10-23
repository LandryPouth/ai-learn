"use strict";

const { test, afterEach } = require("node:test");
const assert = require("node:assert");
const { tmpProject, capture, sampleProgress, writeFile } = require("./helpers");
const { nextCommand, buildNextReport } = require("../bin/lib/next");
const { verifyCommand } = require("../bin/lib/verify");

// nextCommand logs to stdout via `log`; reset the exit code between tests so a
// fail() in one test cannot leak into the next.
afterEach(() => {
  process.exitCode = 0;
});

test("next points to the first phase that is not done", () => {
  const dir = tmpProject(
    sampleProgress({
      phases: [
        { id: 0, name: "Zero", status: "done", checkpoint: "node -e \"\"", artifacts: ["docs/0.md"], predictionsRequired: 1 },
        { id: 1, name: "One", status: "pending", checkpoint: "node -e \"\"", artifacts: ["docs/1.md"], predictionsRequired: 3 },
        { id: 2, name: "Two", status: "pending", checkpoint: "node -e \"\"", artifacts: [], predictionsRequired: 0 },
      ],
    }),
  );

  const out = capture(() => nextCommand({ dir }));

  assert.match(out, /Next: Phase 1 — One/);
  assert.match(out, /Checkpoint: node -e/);
  assert.match(out, /Predictions required: 3/);
  assert.match(out, /docs\/plans\/predictions\.md/);
  assert.match(out, /ai-learn verify 1/);
});

test("next points at an in_progress phase first (finish what was started)", () => {
  const dir = tmpProject(
    sampleProgress({
      phases: [
        { id: 0, name: "Zero", status: "in_progress", checkpoint: "node -e \"\"", artifacts: [], predictionsRequired: 0 },
        { id: 1, name: "One", status: "pending", checkpoint: "node -e \"\"", artifacts: [], predictionsRequired: 0 },
      ],
    }),
  );

  const out = capture(() => nextCommand({ dir }));

  assert.match(out, /Next: Phase 0 — Zero/);
  assert.match(out, /Status: in_progress/);
});

test("next warns when a done phase has no passing evidence", () => {
  const dir = tmpProject(
    sampleProgress({
      phases: [
        { id: 0, name: "Zero", status: "done", checkpoint: "node -e \"\"", artifacts: [], predictionsRequired: 0 },
      ],
    }),
  );

  const out = capture(() => nextCommand({ dir }));

  assert.match(out, /unproven/);
});

test("next keeps unproven warnings before the next phase when no proof is stale (non-regression)", () => {
  const dir = tmpProject(
    sampleProgress({
      phases: [
        { id: 0, name: "Zero", status: "done", checkpoint: "node -e \"\"", artifacts: [], predictionsRequired: 0 },
        { id: 1, name: "One", status: "pending", checkpoint: "node -e \"\"", artifacts: [], predictionsRequired: 0 },
      ],
    }),
  );

  const out = capture(() => nextCommand({ dir }));

  assert.ok(out.indexOf("⚠ Phase 0") !== -1);
  assert.ok(out.indexOf("⚠ Phase 0") < out.indexOf("Next: Phase 1"));
});

test("with a stale and an unproven done phase, next names the real phase first and warns about both after", () => {
  const dir = tmpProject(
    sampleProgress({
      phases: [
        { id: 0, name: "Zero", status: "done", checkpoint: "node -e \"\"", artifacts: [], predictionsRequired: 0 },
        { id: 1, name: "One", status: "done", checkpoint: "node -e \"\"", artifacts: [], predictionsRequired: 0 },
        { id: 2, name: "Two", status: "pending", checkpoint: "node -e \"\"", artifacts: [], predictionsRequired: 0 },
      ],
    }),
  );
  writeFile(dir, "src/index.js", "console.log('hi');\n");

  capture(() => verifyCommand({ dir, phaseId: 0 }));
  writeFile(dir, "src/index.js", "console.log('changed');\n");

  const out = capture(() => nextCommand({ dir }));
  const nextAt = out.indexOf("Next: Phase 2");

  assert.ok(nextAt !== -1);
  assert.ok(out.indexOf("⚠ Phase 0") > nextAt);
  assert.ok(out.indexOf("⚠ Phase 1") > nextAt);
  assert.match(out, /Phase 1 — One is marked done but has no passing evidence/);
});

test("next reports completion when every phase is done", () => {
  const dir = tmpProject(
    sampleProgress({
      phases: [
        { id: 0, name: "Zero", status: "done", checkpoint: "node -e \"\"", artifacts: [], predictionsRequired: 0 },
      ],
    }),
  );

  const out = capture(() => nextCommand({ dir }));

  assert.match(out, /All 1\/1 phases done/);
  assert.match(out, /ai-learn check/);
});

// Story 04.02: a stale phase is no longer the headline "Next" — the real
// following phase is. A fully-done track with stale proofs still never claims
// to be finished, and lists each re-prove command as a warning.
test("next never presents a stale-only track as finished, and names the re-prove command", () => {
  const dir = tmpProject(sampleProgress());
  writeFile(dir, "src/index.js", "console.log('hi');\n");

  capture(() => verifyCommand({ dir, phaseId: 0 }));
  writeFile(dir, "src/index.js", "console.log('changed');\n");

  const out = capture(() => nextCommand({ dir }));
  assert.match(out, /stale/);
  assert.match(out, /All 1\/1 phases are marked done, but 1 proof\(s\) do not hold/);
  assert.match(out, /ai-learn verify --stale/);
  assert.doesNotMatch(out, /ai-learn verify \d/);
  assert.doesNotMatch(out, /All 1\/1 phases done\./);
  assert.doesNotMatch(out, /Next: Phase 0/);
});

test("next names the real following phase even when an earlier proof is stale", () => {
  const dir = tmpProject(
    sampleProgress({
      phases: [
        { id: 0, name: "Zero", status: "done", checkpoint: "node -e \"\"", artifacts: [], predictionsRequired: 0 },
        { id: 1, name: "One", status: "pending", checkpoint: "node -e \"\"", artifacts: [], predictionsRequired: 0 },
      ],
    }),
  );
  writeFile(dir, "src/index.js", "console.log('hi');\n");

  capture(() => verifyCommand({ dir, phaseId: 0 }));
  writeFile(dir, "src/index.js", "console.log('changed');\n");

  const out = capture(() => nextCommand({ dir }));
  assert.match(out, /Next: Phase 1 — One/);
  assert.match(out, /⚠ Phase 0 — Zero .*stale/);
  assert.match(out, /ai-learn verify --stale/);
  assert.doesNotMatch(out, /Next: Phase 0/);
});

test("with several stale phases, next names the never-started phase and warns for each stale one", () => {
  const dir = tmpProject(
    sampleProgress({
      phases: [
        { id: 0, name: "Zero", status: "done", checkpoint: "node -e \"\"", artifacts: [], predictionsRequired: 0 },
        { id: 1, name: "One", status: "done", checkpoint: "node -e \"\"", artifacts: [], predictionsRequired: 0 },
        { id: 2, name: "Two", status: "pending", checkpoint: "node -e \"\"", artifacts: [], predictionsRequired: 0 },
      ],
    }),
  );
  writeFile(dir, "src/index.js", "console.log('hi');\n");

  capture(() => verifyCommand({ dir, phaseId: 0 }));
  capture(() => verifyCommand({ dir, phaseId: 1 }));
  writeFile(dir, "src/index.js", "console.log('changed');\n");

  const out = capture(() => nextCommand({ dir }));
  assert.match(out, /Next: Phase 2 — Two/);
  assert.match(out, /⚠ Phase 0 — Zero .*stale/);
  assert.match(out, /⚠ Phase 1 — One .*stale/);
  assert.match(out, /ai-learn verify --stale/);
  assert.doesNotMatch(out, /re-prove it: `ai-learn verify \d`/);
  assert.doesNotMatch(out, /Next: Phase 0/);
});

test("with several stale phases and no phase left, next warns about all of them", () => {
  const dir = tmpProject(
    sampleProgress({
      phases: [
        { id: 0, name: "Zero", status: "done", checkpoint: "node -e \"\"", artifacts: [], predictionsRequired: 0 },
        { id: 1, name: "One", status: "done", checkpoint: "node -e \"\"", artifacts: [], predictionsRequired: 0 },
      ],
    }),
  );
  writeFile(dir, "src/index.js", "console.log('hi');\n");

  capture(() => verifyCommand({ dir, phaseId: 0 }));
  capture(() => verifyCommand({ dir, phaseId: 1 }));
  writeFile(dir, "src/index.js", "console.log('changed');\n");

  const out = capture(() => nextCommand({ dir }));
  assert.match(out, /All 2\/2 phases are marked done, but 2 proof\(s\) do not hold/);
  assert.match(out, /ai-learn verify --stale/);
  assert.doesNotMatch(out, /ai-learn verify \d/);
  assert.doesNotMatch(out, /Next: Phase/);
});

test("next fails cleanly without a progress.json", () => {
  const { mkdtempSync } = require("fs");
  const os = require("os");
  const empty = mkdtempSync(require("path").join(os.tmpdir(), "ai-learn-test-"));

  assert.throws(() => nextCommand({ dir: empty }), /No progress.json/);
});

// Non-regression: the text renderer must be byte-identical to before --json
// existed (story 01.05, plan.md's "sortie texte inchangée").
test("the text output is unchanged when --json is not passed", () => {
  const dir = tmpProject(
    sampleProgress({
      phases: [{ id: 0, name: "Zero", status: "pending", checkpoint: "node -e \"\"", artifacts: [], predictionsRequired: 0 }],
    }),
  );

  const out = capture(() => nextCommand({ dir }));

  assert.match(out, /^Next: Phase 0 — Zero\n/);
  assert.doesNotMatch(out, /[{}[\]]/); // no stray JSON leaking into the text path
});

test("next --json parcours terminé reports a dedicated field, not a sentence to parse", () => {
  const dir = tmpProject(
    sampleProgress({
      phases: [{ id: 0, name: "Zero", status: "done", checkpoint: "node -e \"\"", artifacts: [], predictionsRequired: 0 }],
    }),
  );
  capture(() => verifyCommand({ dir, phaseId: 0 }));

  const out = capture(() => nextCommand({ dir, json: true }));
  const parsed = JSON.parse(out);

  assert.strictEqual(parsed.version, 1);
  assert.strictEqual(parsed.done, true);
  assert.strictEqual(process.exitCode, 0);
});

test("next --json names the next phase when the track isn't finished", () => {
  const dir = tmpProject(
    sampleProgress({
      phases: [{ id: 0, name: "Zero", status: "pending", checkpoint: "node -e \"\"", artifacts: [], predictionsRequired: 0 }],
    }),
  );

  const out = capture(() => nextCommand({ dir, json: true }));
  const parsed = JSON.parse(out);

  assert.strictEqual(parsed.done, false);
  assert.strictEqual(parsed.next.id, 0);
  assert.strictEqual(parsed.next.mustReprove, false);
  assert.deepStrictEqual(parsed.stale, []);
});

// Guards findBrokenDone against silently diverging from the text path's own
// stale detection (both now call the same function — review, story 01.05).
test("next --json keeps the real next phase and stale ids separate (mustReprove no longer masks)", () => {
  const dir = tmpProject(
    sampleProgress({
      phases: [
        { id: 0, name: "Zero", status: "done", checkpoint: "node -e \"\"", artifacts: [], predictionsRequired: 0 },
        { id: 1, name: "One", status: "pending", checkpoint: "node -e \"\"", artifacts: [], predictionsRequired: 0 },
      ],
    }),
  );
  writeFile(dir, "src/index.js", "console.log('hi');\n");

  capture(() => verifyCommand({ dir, phaseId: 0 }));
  writeFile(dir, "src/index.js", "console.log('changed');\n");

  const out = capture(() => nextCommand({ dir, json: true }));
  const parsed = JSON.parse(out);

  assert.strictEqual(parsed.broken.length, 1);
  assert.strictEqual(parsed.broken[0].id, 0);
  assert.strictEqual(parsed.broken[0].verdict, "stale");
  assert.deepStrictEqual(parsed.stale, [0]);
  assert.strictEqual(parsed.next.id, 1);
  assert.strictEqual(parsed.next.mustReprove, false);
});

test("next --json reports done with stale ids when every phase is marked done", () => {
  const dir = tmpProject(sampleProgress());
  writeFile(dir, "src/index.js", "console.log('hi');\n");

  capture(() => verifyCommand({ dir, phaseId: 0 }));
  writeFile(dir, "src/index.js", "console.log('changed');\n");

  const out = capture(() => nextCommand({ dir, json: true }));
  const parsed = JSON.parse(out);

  assert.strictEqual(parsed.done, true);
  assert.deepStrictEqual(parsed.stale, [0]);
  assert.strictEqual(parsed.broken[0].verdict, "stale");
  assert.strictEqual(parsed.next, undefined);
});

test("next --json on a missing progress.json is a JSON error object, not a crash, and exits 1 like text mode", () => {
  const { mkdtempSync } = require("fs");
  const os = require("os");
  const empty = mkdtempSync(require("path").join(os.tmpdir(), "ai-learn-test-"));

  const out = capture(() => nextCommand({ dir: empty, json: true }));
  const parsed = JSON.parse(out);

  assert.strictEqual(parsed.version, 1);
  assert.match(parsed.error, /No progress\.json/);
  assert.strictEqual(process.exitCode, 1);
});

test("buildNextReport normalizes the dir path", () => {
  const dir = tmpProject(sampleProgress());
  const report = buildNextReport(dir);
  assert.doesNotMatch(report.dir, /\\/);
});
