"use strict";

const { test } = require("node:test");
const assert = require("node:assert");
const { tmpProject, capture, sampleProgress, writeFile } = require("./helpers");
const { nextCommand } = require("../bin/lib/next");
const { statusCommand } = require("../bin/lib/status");
const { verifyCommand } = require("../bin/lib/verify");

// Story 09.07 — one language for the learner. Known English strings that used
// to leak into the text outputs; `--json` keys are out of scope.
const FORBIDDEN = [
  /Verifying phase/, /marked done/, /demoted/, /When it passes/, /^Next:/m, /Predictions required/,
  /All \d+\/\d+ phases/, /No phase/, /No progress\.json/, /Evidence:/, /Command:/, /Project:/, /\bproof\(s\) do not hold/,
];

test("learner-facing output has no known English strings", () => {
  const dir = tmpProject(
    sampleProgress({
      phases: [
        { id: 0, name: "Zero", status: "in_progress", checkpoint: "node -e \"process.exit(0)\"", artifacts: [], predictionsRequired: 0 },
        { id: 1, name: "One", status: "pending", checkpoint: "node -e \"\"", artifacts: [], predictionsRequired: 1 },
      ],
    }),
  );
  writeFile(dir, "src/a.js", "module.exports = 1;\n");

  const outputs = [
    capture(() => verifyCommand({ dir, phaseId: 0 })),
    capture(() => nextCommand({ dir })),
    capture(() => statusCommand({ dir })),
  ].join("\n");

  for (const pattern of FORBIDDEN) {
    assert.doesNotMatch(outputs, pattern);
  }
});
