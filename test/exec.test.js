"use strict";

const { test } = require("node:test");
const assert = require("node:assert");

const { portabilityHint, runCommand, zeroTestsRan } = require("../bin/lib/exec");

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


test("zeroTestsRan recognises each runner and nothing else", () => {
  const zero = [
    "# tests 0\n# pass 0",
    "No tests found, exiting with code 1",
    "No test files found",
    "===== no tests ran in 0.01s =====",
    "?   \tmod\t[no test files]",
    "running 0 tests\n\ntest result: ok. 0 passed",
    "No tests were found!!!",
  ];

  for (const out of zero) {
    assert.strictEqual(zeroTestsRan({ stdoutTail: out, stderrTail: "" }), true, out);
  }

  assert.strictEqual(zeroTestsRan({ stdoutTail: "", stderrTail: "No tests found" }), true);

  const real = ["# tests 3\n# pass 3", "running 0 tests\nrunning 4 tests\n", "3 passed in 0.1s", ""];

  for (const out of real) {
    assert.strictEqual(zeroTestsRan({ stdoutTail: out, stderrTail: "" }), false, out);
  }
});

test("a backgrounded server does not hold verify until the timeout", () => {
  const started = Date.now();
  const result = runCommand('node -e "setTimeout(() => {}, 6000)" & echo started', process.cwd(), { timeoutMs: 20000 });

  assert.strictEqual(result.ok, true);
  assert.match(result.stdoutTail, /started/);
  assert.ok(Date.now() - started < 4000, `took ${Date.now() - started}ms`);
});

test("zeroTestsRan never refuses a run that shows tests passing", () => {
  const passing = [
    "?   \tx/cmd\t[no test files]\nok  \tx/pkg\t0.01s",
    "✓ shows 'No tests found' message\n1 passed",
    "running 0 tests\n" + "x".repeat(4000),
  ];

  for (const out of passing) {
    assert.strictEqual(zeroTestsRan({ stdoutTail: out, stderrTail: "" }), false, out.slice(0, 40));
  }
});
