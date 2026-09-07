"use strict";

const { test } = require("node:test");
const assert = require("node:assert");
const { parseArgs } = require("../bin/lib/args");

test("a value flag before the positional does not swallow it", () => {
  const { flags, positionals } = parseArgs(["--dir", "/tmp/p", "0"], { valueFlags: ["--dir"] });
  assert.strictEqual(flags["--dir"], "/tmp/p");
  assert.deepStrictEqual(positionals, ["0"]);
});

test("the same flags in the opposite order produce the same result", () => {
  const { flags, positionals } = parseArgs(["0", "--dir", "/tmp/p"], { valueFlags: ["--dir"] });
  assert.strictEqual(flags["--dir"], "/tmp/p");
  assert.deepStrictEqual(positionals, ["0"]);
});

test("the glued form --dir=<value> is equivalent to --dir <value>", () => {
  const { flags, positionals } = parseArgs(["--dir=/tmp/p", "0"], { valueFlags: ["--dir"] });
  assert.strictEqual(flags["--dir"], "/tmp/p");
  assert.deepStrictEqual(positionals, ["0"]);
});

test("a boolean flag does not consume the positional that follows it", () => {
  const { flags, positionals } = parseArgs(["--no-mark", "0"], { valueFlags: ["--dir"] });
  assert.strictEqual(flags["--no-mark"], true);
  assert.deepStrictEqual(positionals, ["0"]);
});

test("an undeclared flag is ignored without throwing, and stays boolean", () => {
  const { flags, positionals } = parseArgs(["--mystery", "0"], { valueFlags: ["--dir"] });
  assert.strictEqual(flags["--mystery"], true);
  assert.deepStrictEqual(positionals, ["0"]);
});

test("a value starting with a dash is still taken as the flag's value", () => {
  const { flags, positionals } = parseArgs(["--dir", "-weird-path", "0"], { valueFlags: ["--dir"] });
  assert.strictEqual(flags["--dir"], "-weird-path");
  assert.deepStrictEqual(positionals, ["0"]);
});

test("a value containing spaces and braces travels as one token", () => {
  const json = '{"a": 1, "b": [2, 3]}';
  const { flags, positionals } = parseArgs(["--phases", json], { valueFlags: ["--phases"] });
  assert.strictEqual(flags["--phases"], json);
  assert.deepStrictEqual(positionals, []);
});

test("a value flag with nothing after it gets null instead of consuming past the end", () => {
  const { flags, positionals } = parseArgs(["--dir"], { valueFlags: ["--dir"] });
  assert.strictEqual(flags["--dir"], null);
  assert.deepStrictEqual(positionals, []);
});
