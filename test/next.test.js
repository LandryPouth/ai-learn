"use strict";

const { test, afterEach } = require("node:test");
const assert = require("node:assert");
const { tmpProject, capture, sampleProgress } = require("./helpers");
const { nextCommand } = require("../bin/lib/next");

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

test("next fails cleanly without a progress.json", () => {
  const { mkdtempSync } = require("fs");
  const os = require("os");
  const empty = mkdtempSync(require("path").join(os.tmpdir(), "ai-learn-test-"));

  assert.throws(() => nextCommand({ dir: empty }), /No progress.json/);
});
