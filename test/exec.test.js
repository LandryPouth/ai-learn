"use strict";

const { test } = require("node:test");
const assert = require("node:assert");

const { portabilityHint } = require("../bin/lib/exec");

function failed(overrides = {}) {
  return {
    command: "FOO=1 node checkpoint/phase-0.js",
    exitCode: 1,
    ok: false,
    timedOut: false,
    durationMs: 1,
    stdoutTail: "",
    stderrTail: "",
    ...overrides,
  };
}

test("portabilityHint points a Windows cmd.exe failure at the portable form", () => {
  const hint = portabilityHint(
    failed({
      exitCode: 1,
      stderrTail: "'FOO' is not recognized as an internal or external command,\r\noperable program or batch file.",
    }),
    "win32",
  );

  assert.match(hint, /cmd\.exe, not bash/);
  assert.match(hint, /npm test/);
  assert.match(hint, /node script\.js/);
});

test("portabilityHint covers PowerShell's command-not-found wording", () => {
  const hint = portabilityHint(
    failed({ stderrTail: "The term 'npx' is not recognized as a name of a cmdlet" }),
    "win32",
  );

  assert.match(hint, /cmd\.exe, not bash/);
});

test("portabilityHint covers the French cmd.exe wording and its 9009 exit", () => {
  const french = portabilityHint(
    failed({ stderrTail: "'FOO' n'est pas reconnu en tant que commande interne\r\nou externe." }),
    "win32",
  );
  assert.match(french, /cmd\.exe, not bash/);

  assert.match(portabilityHint(failed({ exitCode: 9009 }), "win32"), /cmd\.exe, not bash/);
});

test("portabilityHint stays silent for a normal failing checkpoint on Windows", () => {
  assert.strictEqual(portabilityHint(failed({ exitCode: 1, stderrTail: "AssertionError: 2 !== 3" }), "win32"), null);
  // Exit 127 alone (a POSIX convention, also used for some launch failures) is
  // not enough evidence that the shell failed to find the command.
  assert.strictEqual(portabilityHint(failed({ exitCode: 127 }), "win32"), null);
});

test("portabilityHint is a no-op outside Windows and on a green run", () => {
  assert.strictEqual(portabilityHint(failed({ exitCode: 127 }), "linux"), null);
  assert.strictEqual(portabilityHint(failed({ ok: true, exitCode: 0 }), "win32"), null);
});
