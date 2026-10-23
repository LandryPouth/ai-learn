"use strict";

const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const { parseCommandFile, listCommands } = require("../bin/lib/platforms/commands");
const { renderCommand: renderGemini } = require("../bin/lib/platforms/gemini");
const { renderCommand: renderOpencode } = require("../bin/lib/platforms/opencode");
const { renderCommand: renderAntigravity } = require("../bin/lib/platforms/antigravity");
const {
  renderConfig: renderCodexGuard,
  findLiteralTestDirs,
  PROFILE_NAME,
  MARKER,
} = require("../bin/lib/platforms/codex-guard");
const { installCommand } = require("../bin/lib/install");
const { ensureCodexGuard } = require("../bin/lib/guard");
const { capture } = require("./helpers");

const COMMANDS_DIR = path.join(__dirname, "..", "commands");

function tmpDir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

test("gemini renderCommand produces valid TOML (prompt + description)", () => {
  const parsed = parseCommandFile(path.join(COMMANDS_DIR, "learn-next.md"));
  const { filename, content } = renderGemini(parsed);

  assert.strictEqual(filename, "learn-next.toml");
  assert.match(content, /^description = "/);
  assert.match(content, /prompt = """/);
  assert.match(content, /ai-learn next/);
  assert.match(content, /"""\s*$/);
});

test("gemini renderCommand escapes quotes in the description", () => {
  const { content } = renderGemini({ name: "x", description: 'a "quoted" word', body: "body\n" });
  assert.match(content, /description = "a \\"quoted\\" word"/);
});

test("opencode renderCommand produces frontmatter + body", () => {
  const parsed = parseCommandFile(path.join(COMMANDS_DIR, "learn-status.md"));
  const { filename, content } = renderOpencode(parsed);

  assert.strictEqual(filename, "learn-status.md");
  assert.match(content, /^---\ndescription: "/);
  assert.match(content, /ai-learn status/);
});

test("antigravity renderCommand produces a flat skills/<name>/SKILL.md layout", () => {
  const parsed = parseCommandFile(path.join(COMMANDS_DIR, "learn-next.md"));
  const { filename, content } = renderAntigravity(parsed);

  assert.strictEqual(filename, "ai-learn-learn-next/SKILL.md");
  assert.match(content, /^---\nname: ai-learn-learn-next\ndescription: "/);
  assert.match(content, /ai-learn next/);
});

test("antigravity renderCommand quotes a description containing a bare colon (real bug found on real commands)", () => {
  // Caught empirically: docs.md's and scan.md's descriptions contain a
  // mid-sentence ":", which breaks YAML plain-scalar parsing when emitted
  // unquoted — validated with Python's PyYAML against the actual generated
  // file before this was fixed.
  const parsed = parseCommandFile(path.join(COMMANDS_DIR, "learn-docs.md"));
  assert.match(parsed.description, /:/); // sanity: the fixture still has the colon

  const { content } = renderAntigravity(parsed);
  const descriptionLine = content.split("\n").find((line) => line.startsWith("description:"));
  assert.match(descriptionLine, /^description: ".*"$/);
});

test("antigravity renderCommand escapes embedded double quotes", () => {
  const { content } = renderAntigravity({ name: "x", description: 'a "quoted" word', body: "body\n" });
  assert.match(content, /description: "a \\"quoted\\" word"/);
});

test("install antigravity writes one flat skill directory per command and alias, all YAML-parseable", () => {
  const home = tmpDir("ai-learn-antigravity-");
  capture(() => installCommand({ platform: "antigravity", home }));

  const skillsDir = path.join(home, ".gemini", "antigravity", "skills");
  const entries = fs.readdirSync(skillsDir, { withFileTypes: true }).filter((e) => e.isDirectory());
  assert.strictEqual(entries.length, listCommands(COMMANDS_DIR).length);
  assert.ok(fs.existsSync(path.join(skillsDir, "ai-learn-learn-next", "SKILL.md")));
  assert.ok(fs.existsSync(path.join(skillsDir, "ai-learn-next", "SKILL.md")));

  for (const entry of entries) {
    const content = fs.readFileSync(path.join(skillsDir, entry.name, "SKILL.md"), "utf8");
    const frontmatter = content.split("---")[1];
    assert.match(frontmatter, /name: ai-learn-/);
    assert.match(frontmatter, /description: "/);
  }
});

test("install gemini writes one namespaced .toml per command", () => {
  const home = tmpDir("ai-learn-gemini-");
  capture(() => installCommand({ platform: "gemini", home }));

  const dir = path.join(home, ".gemini", "commands", "ai-learn");
  const files = fs.readdirSync(dir);
  assert.strictEqual(files.length, 13);
  assert.ok(files.includes("learn-next.toml"));
  assert.ok(files.includes("next.toml"), "the legacy /next alias still ships");
});

test("install opencode writes one namespaced .md per command", () => {
  const home = tmpDir("ai-learn-opencode-");
  capture(() => installCommand({ platform: "opencode", home }));

  const dir = path.join(home, ".config", "opencode", "command", "ai-learn");
  const files = fs.readdirSync(dir);
  assert.strictEqual(files.length, 13);
  assert.ok(files.includes("learn-next.md"));
  assert.ok(files.includes("next.md"), "the legacy /next alias still ships");
});

test("codex-guard renderConfig emits only literal paths (no aborting dir + dir/** pair)", () => {
  const content = renderCodexGuard(["src/**"]);

  assert.match(content, new RegExp(`default_permissions = "${PROFILE_NAME}"`));
  assert.match(content, /"\/" = "read"/);
  assert.match(content, /"\." = "write"/);
  assert.match(content, /"src" = "deny"/);
  // Emitting both `src/**` and `src` makes bwrap abort when src/ contains an
  // existing file, so the glob form must not be present at all.
  assert.doesNotMatch(content, /\/\*\*" = "deny"/);
  assert.ok(content.startsWith(MARKER));
});

test("codex-guard renderConfig handles a non-glob learner path as-is", () => {
  const content = renderCodexGuard(["answers.txt"]);
  assert.match(content, /"answers\.txt" = "deny"/);
  assert.doesNotMatch(content, /"answers" = "deny"/);
});

test("codex-guard renderConfig drops glob-only patterns and adds literal extras", () => {
  const content = renderCodexGuard(["**/test/**", "**/*.test.*"], ["src/test", "src/__tests__"]);
  const denyLines = content.split("\n").filter((line) => line.includes('= "deny"'));
  assert.ok(denyLines.every((line) => !line.includes("*")), denyLines.join("\n"));
  assert.match(content, /"src\/test" = "deny"/);
  assert.match(content, /"src\/__tests__" = "deny"/);
});

test("codex-guard denyEntries protects the guard wiring, including the Claude hook settings", () => {
  const content = renderCodexGuard(["src/**"]);

  for (const entry of [
    ".ai-learn",
    ".ai-learn/guard.json",
    ".codex",
    ".codex/config.toml",
    ".claude",
    ".claude/settings.json",
    ".claude/settings.local.json",
  ]) {
    assert.ok(content.includes(`${JSON.stringify(entry)} = "deny"`), entry);
  }
});

test("findLiteralTestDirs finds existing nested test directories only", () => {
  const dir = tmpDir("ai-learn-codex-dirs-");
  fs.mkdirSync(path.join(dir, "src", "test"), { recursive: true });
  fs.mkdirSync(path.join(dir, "src", "__tests__"), { recursive: true });
  fs.mkdirSync(path.join(dir, "node_modules", "test"), { recursive: true });
  fs.writeFileSync(path.join(dir, "src", "index.test.ts"), "x\n");

  assert.deepStrictEqual(findLiteralTestDirs(dir), ["src/__tests__", "src/test"]);
});

test("findLiteralTestDirs is case-insensitive and skips build output", () => {
  const dir = tmpDir("ai-learn-codex-dirs-");
  fs.mkdirSync(path.join(dir, "Test"), { recursive: true });
  fs.mkdirSync(path.join(dir, "src", "test"), { recursive: true });
  fs.mkdirSync(path.join(dir, "build", "test"), { recursive: true });
  fs.mkdirSync(path.join(dir, "node_modules", "test"), { recursive: true });

  assert.deepStrictEqual(findLiteralTestDirs(dir), ["Test", "src/test"]);
});

test("ensureCodexGuard creates .codex/config.toml and never overwrites a customized one", () => {
  const dir = tmpDir("ai-learn-codexguard-");
  const result = ensureCodexGuard(dir, ["src/**"]);

  assert.deepStrictEqual(result.created, [".codex/config.toml"]);
  const first = fs.readFileSync(path.join(dir, ".codex", "config.toml"), "utf8");
  assert.ok(first.startsWith(MARKER));

  // A learner's own custom config (no marker) must never be touched.
  fs.writeFileSync(path.join(dir, ".codex", "config.toml"), "# my own config\n");
  const second = ensureCodexGuard(dir, ["src/**"]);
  assert.strictEqual(second.skipped, true);
  assert.strictEqual(fs.readFileSync(path.join(dir, ".codex", "config.toml"), "utf8"), "# my own config\n");
});

test("ensureCodexGuard refreshes a generated config when learnerFiles changes", () => {
  const dir = tmpDir("ai-learn-codexguard-refresh-");
  ensureCodexGuard(dir, ["src/**"]);

  const result = ensureCodexGuard(dir, ["src/**", "answers/**"]);
  assert.deepStrictEqual(result.refreshed, [".codex/config.toml"]);
  const content = fs.readFileSync(path.join(dir, ".codex", "config.toml"), "utf8");
  assert.match(content, /"answers" = "deny"/);
  assert.doesNotMatch(content, /"answers\/\*\*" = "deny"/);
});
