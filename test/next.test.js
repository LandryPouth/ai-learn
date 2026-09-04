"use strict";

const { test, afterEach } = require("node:test");
const assert = require("node:assert");
const { tmpProject, capture, sampleProgress, writeFile } = require("./helpers");
const { nextCommand } = require("../bin/lib/next");
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

// Before story 01.02, a stale phase was only a warning — `next` still fell
// through to "All 1/1 phases done" because every phase's `status` was
// literally "done". That was the exact lie this story closes: a stale
// phase is no longer presented as finished, it becomes the headline "Next".
test("next presents a stale done phase as the thing to re-prove, not as finished", () => {
  const dir = tmpProject(sampleProgress());
  writeFile(dir, "src/index.js", "console.log('hi');\n");

  capture(() => verifyCommand({ dir, phaseId: 0 }));
  writeFile(dir, "src/index.js", "console.log('changed');\n");

  const out = capture(() => nextCommand({ dir }));
  assert.match(out, /stale/);
  assert.match(out, /Next: Phase 0 — Phase zero — re-prove it/);
  assert.match(out, /Re-prove it:/);
  assert.match(out, /ai-learn verify 0/);
  assert.doesNotMatch(out, /All 1\/1 phases done/);
});

test("next presents a stale done phase before a later pending phase", () => {
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
  assert.match(out, /Next: Phase 0 — Zero — re-prove it/);
  assert.doesNotMatch(out, /Next: Phase 1/);
});

test("with several stale phases, next presents the first one in ledger order", () => {
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
  assert.match(out, /Next: Phase 0 — Zero — re-prove it/);
  assert.doesNotMatch(out, /Next: Phase 1/);
});

test("next fails cleanly without a progress.json", () => {
  const { mkdtempSync } = require("fs");
  const os = require("os");
  const empty = mkdtempSync(require("path").join(os.tmpdir(), "ai-learn-test-"));

  assert.throws(() => nextCommand({ dir: empty }), /No progress.json/);
});
