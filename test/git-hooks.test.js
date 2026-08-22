"use strict";

// `bin/lib/git-hooks.js` — the commit-msg hook. Real tmp git repos throughout:
// the test itself is allowed to run `git`/`git commit` directly (it's test
// code, not the AI's Bash tool that `ai-learn guard` intercepts) so the
// enforcement can be proven end to end, not just asserted on the template
// string.

const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const { ensureCommitMsgHook, commitMsgHookWired, CONVENTIONAL_COMMITS_RE } = require("../bin/lib/git-hooks");

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "ai-learn-githooks-"));
}

function initRepo(dir) {
  spawnSync("git", ["init", "-b", "main"], { cwd: dir });
  spawnSync("git", ["-C", dir, "config", "user.name", "t"]);
  spawnSync("git", ["-C", dir, "config", "user.email", "t@t"]);
}

function commit(dir, message) {
  fs.writeFileSync(path.join(dir, `f-${Date.now()}-${Math.random()}.txt`), "x");
  spawnSync("git", ["-C", dir, "add", "."]);
  return spawnSync("git", ["-C", dir, "commit", "-m", message], { encoding: "utf8" });
}

test("no .git repo: silent no-op, never throws", () => {
  const dir = tmpDir();
  const result = ensureCommitMsgHook(dir);
  assert.strictEqual(result.skipped, "no-git-repo");
  assert.ok(!fs.existsSync(path.join(dir, ".githooks")));
});

test("wires .githooks/commit-msg + core.hooksPath on a real repo", () => {
  const dir = tmpDir();
  initRepo(dir);

  const result = ensureCommitMsgHook(dir);
  assert.strictEqual(result.file, "created");
  assert.strictEqual(result.hooksPath, "set");
  assert.ok(fs.existsSync(path.join(dir, ".githooks", "commit-msg")));

  const configured = spawnSync("git", ["-C", dir, "config", "--get", "core.hooksPath"], { encoding: "utf8" });
  assert.strictEqual(configured.stdout.trim(), ".githooks");
});

test("idempotent: a second run changes nothing", () => {
  const dir = tmpDir();
  initRepo(dir);
  ensureCommitMsgHook(dir);

  const second = ensureCommitMsgHook(dir);
  assert.strictEqual(second.file, "kept");
  assert.strictEqual(second.hooksPath, "already-set");
});

test("a real git commit is rejected with a bad message, accepted with a conventional one", () => {
  const dir = tmpDir();
  initRepo(dir);
  ensureCommitMsgHook(dir);

  const bad = commit(dir, "bad message no type");
  assert.notStrictEqual(bad.status, 0);
  assert.match(bad.stderr, /Conventional Commits/);

  const good = commit(dir, "feat: message valide");
  assert.strictEqual(good.status, 0, good.stderr);
});

test("--no-verify bypasses the hook (visible escape hatch, not silent)", () => {
  const dir = tmpDir();
  initRepo(dir);
  ensureCommitMsgHook(dir);

  fs.writeFileSync(path.join(dir, "f.txt"), "x");
  spawnSync("git", ["-C", dir, "add", "."]);
  const bypassed = spawnSync("git", ["-C", dir, "commit", "--no-verify", "-m", "bad message"], { encoding: "utf8" });
  assert.strictEqual(bypassed.status, 0);
});

test("a pre-existing, differently-configured core.hooksPath is never clobbered", () => {
  const dir = tmpDir();
  initRepo(dir);
  fs.mkdirSync(path.join(dir, "custom-hooks"));
  spawnSync("git", ["-C", dir, "config", "core.hooksPath", "custom-hooks"]);

  const result = ensureCommitMsgHook(dir);
  assert.strictEqual(result.hooksPath, "customized");
  assert.strictEqual(result.existing, "custom-hooks");

  const configured = spawnSync("git", ["-C", dir, "config", "--get", "core.hooksPath"], { encoding: "utf8" });
  assert.strictEqual(configured.stdout.trim(), "custom-hooks");
});

test("a customized (non-marker) .githooks/commit-msg is never overwritten", () => {
  const dir = tmpDir();
  initRepo(dir);
  fs.mkdirSync(path.join(dir, ".githooks"), { recursive: true });
  const custom = "#!/usr/bin/env sh\n# my own hook, not ai-learn's\nexit 0\n";
  fs.writeFileSync(path.join(dir, ".githooks", "commit-msg"), custom);

  const result = ensureCommitMsgHook(dir);
  assert.strictEqual(result.file, "kept");
  assert.strictEqual(fs.readFileSync(path.join(dir, ".githooks", "commit-msg"), "utf8"), custom);
});

test("commitMsgHookWired: null with no .git, false when unwired, true once wired", () => {
  const dir = tmpDir();
  assert.strictEqual(commitMsgHookWired(dir), null);

  initRepo(dir);
  assert.strictEqual(commitMsgHookWired(dir), false);

  ensureCommitMsgHook(dir);
  assert.strictEqual(commitMsgHookWired(dir), true);
});

test("CONVENTIONAL_COMMITS_RE matches valid subjects and rejects invalid ones", () => {
  for (const subject of ["feat: add thing", "fix(scope): bug", "chore!: breaking", "refactor(a.b-c): x"]) {
    assert.match(subject, CONVENTIONAL_COMMITS_RE, subject);
  }
  for (const subject of ["bad message", "Feat: wrong case", "feat:no space"]) {
    assert.doesNotMatch(subject, CONVENTIONAL_COMMITS_RE, subject);
  }
});
