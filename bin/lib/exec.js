"use strict";

// Shared shell-exec primitive, extracted out of verify.js (story 02.03) so
// mutate.js can call it without creating a require cycle: mutate.js needs to
// run a phase's checkpoint the same way verify.js does (same timeout, same
// exit-code/timeout normalization, same tail-capture), and verify.js now
// needs mutate.js's mutationReport — two-way top-level requires between those
// two files would leave one side's import unresolved (Node hands back the
// other module's still-empty exports mid-load). Both now depend on this leaf
// module instead, never on each other for this piece.

const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

// Output goes to files, not pipes, and the shell leads its own process group
// (story 09.02). With pipes, `spawnSync` only returns once every holder of the
// write end has closed it — a checkpoint that starts `node server.js &` kept
// verify waiting for the whole timeout and left the server alive. With files
// the call returns when the shell exits; the group is then killed so nothing
// the checkpoint started outlives it. On Windows there is no group to signal
// (the shell is gone by then): `taskkill /T` on the dead pid is a no-op, so a
// backgrounded process can survive there — the known, consigned fallback.
function killGroup(pid) {
  if (!pid) {
    return;
  }

  try {
    if (process.platform === "win32") {
      spawnSync("taskkill", ["/T", "/F", "/PID", String(pid)], { stdio: "ignore" });
    } else {
      process.kill(-pid, "SIGKILL");
    }
  } catch {
    // Group already gone — the normal case.
  }
}

function readTail(file) {
  let fd;

  try {
    fd = fs.openSync(file, "r");
    const size = fs.fstatSync(fd).size;
    const length = Math.min(size, 4000 * 4);
    const buffer = Buffer.alloc(length);
    fs.readSync(fd, buffer, 0, length, size - length);

    return buffer.toString("utf8").slice(-4000);
  } catch {
    return "";
  } finally {
    if (fd !== undefined) {
      fs.closeSync(fd);
    }
  }
}

function runCommand(command, cwd, { timeoutMs = 120000 } = {}) {
  const started = Date.now();
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ai-learn-run-"));
  const outFile = path.join(tmp, "stdout");
  const errFile = path.join(tmp, "stderr");
  let result;
  let stdoutTail = "";
  let stderrTail = "";

  try {
    const outFd = fs.openSync(outFile, "w");
    const errFd = fs.openSync(errFile, "w");

    try {
      result = spawnSync(command, [], {
        cwd,
        shell: true,
        detached: process.platform !== "win32",
        stdio: ["ignore", outFd, errFd],
        timeout: timeoutMs,
      });
    } finally {
      fs.closeSync(outFd);
      fs.closeSync(errFd);
    }

    killGroup(result.pid);
    stdoutTail = readTail(outFile);
    stderrTail = readTail(errFile);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }

  const timedOut = Boolean(result.error && result.error.code === "ETIMEDOUT");
  const exitCode = result.status != null ? result.status : timedOut ? 124 : result.error ? 127 : 1;

  return {
    command,
    exitCode,
    ok: exitCode === 0,
    timedOut,
    durationMs: Date.now() - started,
    stdoutTail,
    stderrTail,
  };
}

// Zero-test detection (story 09.02): a checkpoint that exits 0 without having
// run a single test proves nothing. Patterns are the "nothing ran" messages of
// the runners the stack packs document; an unknown runner is never refused.
// Both tails are searched (stdout is truncated to 4000 chars) and only an
// explicit marker counts — in doubt, the proof stands.
const ZERO_TEST_PATTERNS = [
  /^# tests 0\s*$/m, // node:test
  /No tests found/i, // Jest
  /No test files found/i, // Vitest
  /no tests ran/i, // pytest
  /\[no test files\]/i, // Go
  /No tests were found/i, // CTest
];

// Any sign that something did run wins over a free-text marker: `go test ./...`
// prints `[no test files]` for every untested package next to `ok` lines, and a
// test may print "No tests found" as its own subject.
const PASS_MARKERS = [/^# pass [1-9]/m, /\b[1-9]\d* passed\b/, /^ok\s+\S/m, /running [1-9]\d* tests?/, /^\s*(✓|√)/m];

// stdoutTail is cut at 4000 chars: a full tail may have lost the evidence.
const TRUNCATED = 3900;

function zeroTestsRan(result) {
  if (!result) {
    return false;
  }

  const output = `${result.stdoutTail || ""}\n${result.stderrTail || ""}`;

  if (PASS_MARKERS.some((pattern) => pattern.test(output))) {
    return false;
  }

  if (ZERO_TEST_PATTERNS.some((pattern) => pattern.test(output))) {
    return true;
  }

  // Cargo: zero only when every "running N tests" block is 0, and only if
  // the tail was not truncated (an earlier non-empty block may be cut off).
  if ((result.stdoutTail || "").length >= TRUNCATED || (result.stderrTail || "").length >= TRUNCATED) {
    return false;
  }

  const blocks = [...output.matchAll(/running (\d+) tests?/g)].map((m) => Number(m[1]));

  return blocks.length > 0 && blocks.every((n) => n === 0);
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

module.exports = { runCommand, portabilityHint, zeroTestsRan };
