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
  assert.match(result.stdout, /ai-learn predict/);
});

test("predict without a phase fails cleanly (UsageError, not a stack trace)", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ai-learn-cli-predict-"));
  fs.writeFileSync(
    path.join(dir, "progress.json"),
    JSON.stringify({ version: 1, project: "demo", phases: [{ id: 0, name: "Zero", status: "pending" }] }),
  );

  const result = spawnSync(process.execPath, [BIN, "predict", "--dir", dir, "--prediction", "x"], {
    encoding: "utf8",
    env: isolatedEnv(),
  });

  assert.strictEqual(result.status, 1);
  assert.match(result.stderr, /requires --phase/);
  assert.doesNotMatch(result.stderr, /at Object/); // no raw stack trace leaked
});

test("predict without a prediction text fails cleanly", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ai-learn-cli-predict-"));
  fs.writeFileSync(
    path.join(dir, "progress.json"),
    JSON.stringify({ version: 1, project: "demo", phases: [{ id: 0, name: "Zero", status: "pending" }] }),
  );

  const result = spawnSync(process.execPath, [BIN, "predict", "--dir", dir, "--phase", "0"], {
    encoding: "utf8",
    env: isolatedEnv(),
  });

  assert.strictEqual(result.status, 1);
  assert.match(result.stderr, /requires --prediction/);
});

test("predict records an entry and reports it, end to end through the CLI", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ai-learn-cli-predict-"));
  fs.writeFileSync(
    path.join(dir, "progress.json"),
    JSON.stringify({ version: 1, project: "demo", phases: [{ id: 0, name: "Zero", status: "pending" }] }),
  );

  const result = spawnSync(process.execPath, [BIN, "predict", "--dir", dir, "--phase", "0", "--prediction", "GET /x → 200"], {
    encoding: "utf8",
    env: isolatedEnv(),
  });

  assert.strictEqual(result.status, 0);
  assert.match(result.stdout, /Recorded prediction/);
  const data = JSON.parse(fs.readFileSync(path.join(dir, ".ai-learn", "predictions.json"), "utf8"));
  assert.strictEqual(data.entries.length, 1);
  assert.strictEqual(data.entries[0].prediction, "GET /x → 200");
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
  assert.ok(fs.existsSync(path.join(home, ".codex", "prompts", "ai-learn-learn-next.md")));
  assert.ok(fs.existsSync(path.join(home, ".codex", "prompts", "ai-learn-next.md")));
});

test("a command with CLAUDECODE=1 in its env self-heals Claude Code's commands, unprompted", () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "ai-learn-cli-"));
  const result = spawnSync(process.execPath, [BIN, "--help"], {
    encoding: "utf8",
    env: { ...process.env, ...homeEnvOverrides(home, { CLAUDECODE: "1" }) },
  });

  assert.strictEqual(result.status, 0);
  assert.ok(fs.existsSync(path.join(home, ".claude", "commands", "learn-next.md")));
});

test("self-heal is a one-time no-op: a second run doesn't rewrite already-installed commands", () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "ai-learn-cli-"));
  const env = { ...process.env, ...homeEnvOverrides(home, { CLAUDECODE: "" }) };

  spawnSync(process.execPath, [BIN, "--platform", "gemini", "--help"], { encoding: "utf8", env });
  const marker = path.join(home, ".gemini", "commands", "ai-learn", "learn-next.toml");
  const before = fs.statSync(marker).mtimeMs;

  spawnSync(process.execPath, [BIN, "--platform", "gemini", "--help"], { encoding: "utf8", env });
  assert.strictEqual(fs.statSync(marker).mtimeMs, before);
});

test("verify accepts --dir before the positional phase id (story 01.05)", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ai-learn-cli-verify-"));
  fs.writeFileSync(
    path.join(dir, "progress.json"),
    JSON.stringify({
      version: 1,
      project: "demo",
      phases: [{ id: 0, name: "Zero", status: "pending", checkpoint: 'node -e "process.exit(0)"', artifacts: [], predictionsRequired: 0 }],
    }),
  );

  const result = spawnSync(process.execPath, [BIN, "verify", "--dir", dir, "0"], { encoding: "utf8", env: isolatedEnv() });

  assert.strictEqual(result.status, 0);
  assert.match(result.stdout, /Phase 0 marked done/);
});

test("verify --dir before or after the id gives the same result", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ai-learn-cli-verify-"));
  fs.writeFileSync(
    path.join(dir, "progress.json"),
    JSON.stringify({
      version: 1,
      project: "demo",
      phases: [{ id: 0, name: "Zero", status: "pending", checkpoint: 'node -e "process.exit(0)"', artifacts: [], predictionsRequired: 0 }],
    }),
  );

  const before = spawnSync(process.execPath, [BIN, "verify", "--dir", dir, "0"], { encoding: "utf8", env: isolatedEnv() });

  fs.writeFileSync(
    path.join(dir, "progress.json"),
    JSON.stringify({
      version: 1,
      project: "demo",
      phases: [{ id: 0, name: "Zero", status: "pending", checkpoint: 'node -e "process.exit(0)"', artifacts: [], predictionsRequired: 0 }],
    }),
  );

  const after = spawnSync(process.execPath, [BIN, "verify", "0", "--dir", dir], { encoding: "utf8", env: isolatedEnv() });

  assert.strictEqual(before.status, after.status);
  assert.strictEqual(before.status, 0);
});

test("install --home <path> claude retains claude as the platform, not the path (story 01.05)", () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "ai-learn-cli-install-"));

  const result = spawnSync(process.execPath, [BIN, "install", "--home", home, "claude"], {
    encoding: "utf8",
    env: isolatedEnv(),
  });

  assert.strictEqual(result.status, 0);
  assert.ok(fs.existsSync(path.join(home, ".claude", "commands", "learn-next.md")));
  assert.ok(fs.existsSync(path.join(home, ".claude", "commands", "next.md")));
});

test("ai-learn check --root . --json prints a single valid JSON object, end to end through the CLI", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ai-learn-cli-check-"));
  fs.writeFileSync(
    path.join(root, "progress.json"),
    JSON.stringify({ version: 1, project: "demo", phases: [{ id: 0, name: "Zero", status: "pending" }] }),
  );

  const result = spawnSync(process.execPath, [BIN, "check", "--root", root, "--json"], { encoding: "utf8", env: isolatedEnv() });

  assert.strictEqual(result.status, 0);
  const parsed = JSON.parse(result.stdout);
  assert.strictEqual(parsed.version, 1);
  assert.strictEqual(parsed.ok, true);
});

test("no platform identifiable (no --platform, no CLAUDECODE): commands stay untouched", () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "ai-learn-cli-"));
  spawnSync(process.execPath, [BIN, "--help"], { encoding: "utf8", env: { ...process.env, ...homeEnvOverrides(home, { CLAUDECODE: "" }) } });

  assert.ok(!fs.existsSync(path.join(home, ".claude")));
  assert.ok(!fs.existsSync(path.join(home, ".codex")));
});

test("verify --stale re-proves a stale phase without a positional id (story 04.03)", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ai-learn-cli-verify-stale-"));
  fs.writeFileSync(
    path.join(dir, "progress.json"),
    JSON.stringify({
      version: 1,
      project: "demo",
      phases: [{ id: 0, name: "Zero", status: "pending", checkpoint: 'node -e "process.exit(0)"', artifacts: [], predictionsRequired: 0 }],
    }),
  );
  fs.mkdirSync(path.join(dir, "src"), { recursive: true });
  fs.writeFileSync(path.join(dir, "src", "index.js"), "console.log('hi');\n");

  const first = spawnSync(process.execPath, [BIN, "verify", "--dir", dir, "0"], { encoding: "utf8", env: isolatedEnv() });
  assert.strictEqual(first.status, 0);

  fs.writeFileSync(path.join(dir, "src", "index.js"), "console.log('changed');\n");

  const result = spawnSync(process.execPath, [BIN, "verify", "--stale", "--dir", dir], { encoding: "utf8", env: isolatedEnv() });

  assert.strictEqual(result.status, 0);
  assert.match(result.stdout, /toujours vert : 1 phase\(s\)/);
});

test("predict --type reality records the type end to end and renders it in the journal", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ai-learn-cli-predict-"));
  fs.writeFileSync(
    path.join(dir, "progress.json"),
    JSON.stringify({ version: 1, project: "demo", phases: [{ id: 0, name: "Zero", status: "pending" }] }),
  );

  const result = spawnSync(
    process.execPath,
    [BIN, "predict", "--dir", dir, "--phase", "0", "--type", "reality", "--prediction", "POST /x → 201"],
    { encoding: "utf8", env: isolatedEnv() },
  );

  assert.strictEqual(result.status, 0);
  const data = JSON.parse(fs.readFileSync(path.join(dir, ".ai-learn", "predictions.json"), "utf8"));
  assert.strictEqual(data.entries[0].type, "reality");
  const journal = fs.readFileSync(path.join(dir, "docs", "plans", "predictions.md"), "utf8");
  assert.match(journal, /- Type : reality/);
});
