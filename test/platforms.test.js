"use strict";

const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");

const { parseCommandFile, listCommands } = require("../bin/lib/platforms/commands");
const { parseSkillFrontmatter } = require("../bin/lib/platforms/skills");
const { renderCommand: renderClaude } = require("../bin/lib/platforms/claude");
const { renderCommand: renderCodex } = require("../bin/lib/platforms/codex");
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
const { pluginSource } = require("../bin/lib/platforms/opencode-guard");
const { capture } = require("./helpers");

const COMMANDS_DIR = path.join(__dirname, "..", "commands");

function tmpDir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

test("claude renderCommand produces skills/<name>/SKILL.md with strict frontmatter", () => {
  const parsed = parseCommandFile(path.join(COMMANDS_DIR, "learn-next.md"));
  const { filename, content } = renderClaude(parsed);

  assert.strictEqual(filename, "learn-next/SKILL.md");
  const skill = parseSkillFrontmatter(content, { file: filename });
  assert.strictEqual(skill.name, "learn-next");
  assert.strictEqual(skill.description, "Prochaine phase à faire");
  assert.match(skill.body, /ai-learn next/);
});

test("opencode renderCommand produces skills/<name>/SKILL.md", () => {
  const parsed = parseCommandFile(path.join(COMMANDS_DIR, "learn-status.md"));
  const { filename, content } = renderOpencode(parsed);

  assert.strictEqual(filename, "learn-status/SKILL.md");
  const skill = parseSkillFrontmatter(content, { file: filename });
  assert.strictEqual(skill.name, "learn-status");
  assert.match(skill.body, /ai-learn status/);
});

test("codex and gemini renderCommand namespace their skills with ai-learn-", () => {
  const parsed = parseCommandFile(path.join(COMMANDS_DIR, "learn-next.md"));

  for (const [render, expected] of [
    [renderCodex, "ai-learn-learn-next/SKILL.md"],
    [renderGemini, "ai-learn-learn-next/SKILL.md"],
  ]) {
    const { filename, content } = render(parsed);
    assert.strictEqual(filename, expected);
    assert.strictEqual(parseSkillFrontmatter(content, { file: filename }).name, "ai-learn-learn-next");
  }
});

test("antigravity renderCommand produces a flat skills/<name>/SKILL.md layout", () => {
  const parsed = parseCommandFile(path.join(COMMANDS_DIR, "learn-next.md"));
  const { filename, content } = renderAntigravity(parsed);

  assert.strictEqual(filename, "ai-learn-learn-next/SKILL.md");
  assert.strictEqual(parseSkillFrontmatter(content, { file: filename }).name, "ai-learn-learn-next");
  assert.match(content, /ai-learn next/);
});

test("antigravity renderCommand quotes a description containing a bare colon (real bug found on real commands)", () => {
  // Caught empirically: docs.md's and scan.md's descriptions contain a
  // mid-sentence ":", which breaks YAML plain-scalar parsing when emitted
  // unquoted — validated with Python's PyYAML against the actual generated
  // file before this was fixed.
  const parsed = parseCommandFile(path.join(COMMANDS_DIR, "learn-docs.md"));
  assert.match(parsed.description, /:/); // sanity: the fixture still has the colon

  const { filename, content } = renderAntigravity(parsed);
  const descriptionLine = content.split("\n").find((line) => line.startsWith("description:"));
  assert.match(descriptionLine, /^description: ".*"$/);
  assert.strictEqual(parseSkillFrontmatter(content, { file: filename }).description, parsed.description);
});

test("renderSkill escapes embedded double quotes in the description", () => {
  for (const render of [renderClaude, renderCodex, renderGemini, renderOpencode, renderAntigravity]) {
    const { filename, content } = render({ name: "x", description: 'a "quoted" word', body: "body\n" });
    assert.match(content, /description: "a \\"quoted\\" word"/);
    assert.strictEqual(parseSkillFrontmatter(content, { file: filename }).description, 'a "quoted" word');
  }
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
    const file = path.join(skillsDir, entry.name, "SKILL.md");
    const skill = parseSkillFrontmatter(fs.readFileSync(file, "utf8"), { file });
    assert.match(skill.name, /^ai-learn-/);
  }
});

test("install gemini writes one namespaced SKILL.md per command", () => {
  const home = tmpDir("ai-learn-gemini-");
  capture(() => installCommand({ platform: "gemini", home }));

  const dir = path.join(home, ".gemini", "skills");
  const entries = fs.readdirSync(dir, { withFileTypes: true }).filter((e) => e.isDirectory());
  assert.strictEqual(entries.length, 13);
  assert.ok(fs.existsSync(path.join(dir, "ai-learn-learn-next", "SKILL.md")));
  assert.ok(fs.existsSync(path.join(dir, "ai-learn-next", "SKILL.md")), "the legacy /next alias still ships");
});

test("install opencode writes one SKILL.md per command", () => {
  const home = tmpDir("ai-learn-opencode-");
  capture(() => installCommand({ platform: "opencode", home }));

  const dir = path.join(home, ".config", "opencode", "skills");
  const entries = fs.readdirSync(dir, { withFileTypes: true }).filter((e) => e.isDirectory());
  assert.strictEqual(entries.length, 13);
  assert.ok(fs.existsSync(path.join(dir, "learn-next", "SKILL.md")));
  assert.ok(fs.existsSync(path.join(dir, "next", "SKILL.md")), "the legacy /next alias still ships");
});

test("install codex writes one namespaced SKILL.md per command", () => {
  const home = tmpDir("ai-learn-codex-");
  capture(() => installCommand({ platform: "codex", home }));

  const dir = path.join(home, ".codex", "skills");
  const entries = fs.readdirSync(dir, { withFileTypes: true }).filter((e) => e.isDirectory());
  assert.strictEqual(entries.length, 13);
  assert.ok(fs.existsSync(path.join(dir, "ai-learn-learn-next", "SKILL.md")));
  assert.ok(fs.existsSync(path.join(dir, "ai-learn-next", "SKILL.md")), "the legacy /next alias still ships");
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

test("plugin OpenCode : un binaire Windows avec espaces reste un littéral valide (chemins 08.01)", () => {
  // Windows paths carry backslashes and may contain spaces ("C:\Program Files").
  // The plugin embeds the binary via JSON.stringify, so the separators are
  // escaped by construction — this test freezes that, and parses the result as
  // ESM so a quoting mistake would be a syntax error, not a Windows surprise.
  const binary = "C:\\Program Files\\ai-learn\\bin\\ai-learn.js";
  const source = pluginSource({ binary });
  // `\r?` keeps the assertion valid on a CRLF Windows checkout, where splitting
  // on "\n" leaves a trailing carriage return on the literal.
  const match = source.match(/^const BINARY = (.*);\r?$/m);

  assert.ok(match, "the generated plugin embeds BINARY");
  assert.strictEqual(JSON.parse(match[1]), binary);

  // The path must never be interpolated into a shell string: the spawn takes an
  // argv array, which is what makes spaces/backslashes safe on Windows.
  assert.match(source, /spawnSync\("node", \[BINARY, "guard"\]/);

  const file = path.join(tmpDir("ai-learn-plugin-"), "plugin.mjs");
  fs.writeFileSync(file, source);
  execFileSync(process.execPath, ["--check", file], { encoding: "utf8" });
});
