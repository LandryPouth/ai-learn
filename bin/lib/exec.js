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

// `shell: true` runs a checkpoint through `cmd.exe` on Windows, where a bash
// command (`FOO=1 node …`, `[ -f x ]`, `source …`) fails as "not recognized"
// and reads like a broken checkpoint rather than a non-portable one. Story
// 08.04's edge case: point back to the portable form instead of leaving the
// shell's own error as the only clue. `platform` is injectable so the test does
// not need a Windows runner.
const CMD_NOT_FOUND =
  /is not recognized as an internal or external command|n['’]est pas reconnu|CommandNotFoundException|cannot be loaded because running scripts is disabled|The term '.*' is not recognized/i;

function portabilityHint(result, platform = process.platform) {
  if (!result || result.ok || platform !== "win32") {
    return null;
  }

  const output = `${result.stderrTail || ""}\n${result.stdoutTail || ""}`;

  // 9009 is cmd.exe's "command not found"; the message check catches the
  // localized (French) wording, where the exit code alone would be ambiguous.
  if (result.exitCode !== 9009 && !CMD_NOT_FOUND.test(output)) {
    return null;
  }

  return (
    "This checkpoint did not run: Windows executes it with cmd.exe, not bash. " +
    "Use a portable command (`npm test`, `node script.js`) — see README, Windows natif."
  );
}

module.exports = { runCommand, portabilityHint };
