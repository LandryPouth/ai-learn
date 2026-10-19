"use strict";

// Shared shell-exec primitive, extracted out of verify.js (story 02.03) so
// mutate.js can call it without creating a require cycle: mutate.js needs to
// run a phase's checkpoint the same way verify.js does (same timeout, same
// exit-code/timeout normalization, same tail-capture), and verify.js now
// needs mutate.js's mutationReport — two-way top-level requires between those
// two files would leave one side's import unresolved (Node hands back the
// other module's still-empty exports mid-load). Both now depend on this leaf
// module instead, never on each other for this piece.

const { spawnSync } = require("child_process");

function runCommand(command, cwd, { timeoutMs = 120000 } = {}) {
  const started = Date.now();
  const result = spawnSync(command, [], {
    cwd,
    shell: true,
    encoding: "utf8",
    timeout: timeoutMs,
    maxBuffer: 256 * 1024 * 1024,
  });

  const timedOut = Boolean(result.error && result.error.code === "ETIMEDOUT");
  const exitCode = result.status != null ? result.status : timedOut ? 124 : result.error ? 127 : 1;

  return {
    command,
    exitCode,
    ok: exitCode === 0,
    timedOut,
    durationMs: Date.now() - started,
    stdoutTail: (result.stdout || "").slice(-4000),
    stderrTail: (result.stderr || "").slice(-4000),
  };
}

module.exports = { runCommand };
