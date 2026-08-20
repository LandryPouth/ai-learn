"use strict";

const { test } = require("node:test");
const assert = require("node:assert");
const { spawnSync } = require("child_process");
const path = require("path");

const BIN = path.join(__dirname, "..", "bin", "ai-learn.js");

test("--help prints the command catalog and exits 0", () => {
  const result = spawnSync(process.execPath, [BIN, "--help"], { encoding: "utf8" });
  assert.strictEqual(result.status, 0);
  assert.match(result.stdout, /ai-learn — evidence-based learning tracks/);
  assert.match(result.stdout, /ai-learn scan/);
  assert.match(result.stdout, /ai-learn propose/);
  assert.match(result.stdout, /ai-learn check/);
  assert.match(result.stdout, /ai-learn docs/);
  assert.match(result.stdout, /ai-learn traps/);
  assert.match(result.stdout, /ai-learn guard/);
  assert.match(result.stdout, /ai-learn update/);
});

test("init requires --technology", () => {
  const result = spawnSync(process.execPath, [BIN, "init"], { encoding: "utf8" });
  assert.strictEqual(result.status, 1);
  assert.match(result.stderr, /requires --technology/);
});
