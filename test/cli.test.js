"use strict";

const { test } = require("node:test");
const assert = require("node:assert");
const { spawnSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const { homeEnvOverrides } = require("./helpers");

const BIN = path.join(__dirname, "..", "bin", "ai-learn.js");

// Every `ai-learn <command>` now runs a mechanical platform self-heal before
// dispatch (see lib/platforms/ensure.js) — so any subprocess test that
// inherits the real environment could silently write into the machine's
// actual ~/.claude, ~/.codex, etc. Isolating HOME (and USERPROFILE, which is
// what os.homedir() actually reads on Windows) keeps these tests hermetic
// regardless of what's already installed on the machine running them.
function isolatedEnv(extra = {}) {
  return { ...process.env, ...homeEnvOverrides(fs.mkdtempSync(path.join(os.tmpdir(), "ai-learn-cli-")), { CLAUDECODE: "", ...extra }) };
}

test("--help prints the command catalog and exits 0", () => {
  const result = spawnSync(process.execPath, [BIN, "--help"], { encoding: "utf8", env: isolatedEnv() });
  assert.strictEqual(result.status, 0);
  assert.match(result.stdout, /ai-learn — evidence-based learning tracks/);
  assert.match(result.stdout, /ai-learn scan/);
  assert.match(result.stdout, /ai-learn propose/);
  assert.match(result.stdout, /ai-learn check/);
  assert.match(result.stdout, /ai-learn docs/);
  assert.match(result.stdout, /ai-learn traps/);
  assert.match(result.stdout, /ai-learn norm/);
  assert.match(result.stdout, /ai-learn guard/);
  assert.match(result.stdout, /ai-learn update/);
});

test("init requires --technology", () => {
  const result = spawnSync(process.execPath, [BIN, "init"], { encoding: "utf8", env: isolatedEnv() });
  assert.strictEqual(result.status, 1);
  assert.match(result.stderr, /requires --technology/);
});

test("any command with --platform mechanically installs that platform's commands first", () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "ai-learn-cli-"));
  const result = spawnSync(process.execPath, [BIN, "--platform", "codex", "--help"], {
    encoding: "utf8",
    env: { ...process.env, ...homeEnvOverrides(home, { CLAUDECODE: "" }) },
  });

  assert.strictEqual(result.status, 0);
  assert.ok(fs.existsSync(path.join(home, ".codex", "prompts", "ai-learn-next.md")));
});

test("a command with CLAUDECODE=1 in its env self-heals Claude Code's commands, unprompted", () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "ai-learn-cli-"));
  const result = spawnSync(process.execPath, [BIN, "--help"], {
    encoding: "utf8",
    env: { ...process.env, ...homeEnvOverrides(home, { CLAUDECODE: "1" }) },
  });

  assert.strictEqual(result.status, 0);
  assert.ok(fs.existsSync(path.join(home, ".claude", "commands", "next.md")));
});

test("self-heal is a one-time no-op: a second run doesn't rewrite already-installed commands", () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "ai-learn-cli-"));
  const env = { ...process.env, ...homeEnvOverrides(home, { CLAUDECODE: "" }) };

  spawnSync(process.execPath, [BIN, "--platform", "gemini", "--help"], { encoding: "utf8", env });
  const marker = path.join(home, ".gemini", "commands", "ai-learn", "next.toml");
  const before = fs.statSync(marker).mtimeMs;

  spawnSync(process.execPath, [BIN, "--platform", "gemini", "--help"], { encoding: "utf8", env });
  assert.strictEqual(fs.statSync(marker).mtimeMs, before);
});

test("no platform identifiable (no --platform, no CLAUDECODE): commands stay untouched", () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "ai-learn-cli-"));
  spawnSync(process.execPath, [BIN, "--help"], { encoding: "utf8", env: { ...process.env, ...homeEnvOverrides(home, { CLAUDECODE: "" }) } });

  assert.ok(!fs.existsSync(path.join(home, ".claude")));
  assert.ok(!fs.existsSync(path.join(home, ".codex")));
});
