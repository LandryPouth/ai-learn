"use strict";

const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const { parseCommandFile, listCommandFiles } = require("../bin/lib/platforms/commands");
const { renderCommand: renderGemini } = require("../bin/lib/platforms/gemini");
const { renderCommand: renderOpencode } = require("../bin/lib/platforms/opencode");
const { renderCommand: renderAntigravity } = require("../bin/lib/platforms/antigravity");
const { renderConfig: renderCodexGuard, PROFILE_NAME, MARKER } = require("../bin/lib/platforms/codex-guard");
const { installCommand } = require("../bin/lib/install");
const { ensureCodexGuard } = require("../bin/lib/guard");
const { capture } = require("./helpers");

const COMMANDS_DIR = path.join(__dirname, "..", "commands");

function tmpDir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

test("gemini renderCommand produces valid TOML (prompt + description)", () => {
  const parsed = parseCommandFile(path.join(COMMANDS_DIR, "next.md"));
  const { filename, content } = renderGemini(parsed);

  assert.strictEqual(filename, "next.toml");
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
  const parsed = parseCommandFile(path.join(COMMANDS_DIR, "status.md"));
  const { filename, content } = renderOpencode(parsed);

  assert.strictEqual(filename, "status.md");
  assert.match(content, /^---\ndescription: "/);
  assert.match(content, /ai-learn status/);
});

test("antigravity renderCommand produces a flat skills/<name>/SKILL.md layout", () => {
  const parsed = parseCommandFile(path.join(COMMANDS_DIR, "next.md"));
  const { filename, content } = renderAntigravity(parsed);

  assert.strictEqual(filename, "ai-learn-next/SKILL.md");
  assert.match(content, /^---\nname: ai-learn-next\ndescription: "/);
  assert.match(content, /ai-learn next/);
});

test("antigravity renderCommand quotes a description containing a bare colon (real bug found on real commands)", () => {
  // Caught empirically: docs.md's and scan.md's descriptions contain a
  // mid-sentence ":", which breaks YAML plain-scalar parsing when emitted
  // unquoted — validated with Python's PyYAML against the actual generated
  // file before this was fixed.
  const parsed = parseCommandFile(path.join(COMMANDS_DIR, "docs.md"));
  assert.match(parsed.description, /:/); // sanity: the fixture still has the colon

  const { content } = renderAntigravity(parsed);
  const descriptionLine = content.split("\n").find((line) => line.startsWith("description:"));
  assert.match(descriptionLine, /^description: ".*"$/);
});

test("antigravity renderCommand escapes embedded double quotes", () => {
  const { content } = renderAntigravity({ name: "x", description: 'a "quoted" word', body: "body\n" });
  assert.match(content, /description: "a \\"quoted\\" word"/);
});

test("install antigravity writes 7 flat skill directories, all YAML-parseable", () => {
  const home = tmpDir("ai-learn-antigravity-");
  capture(() => installCommand({ platform: "antigravity", home }));

  const skillsDir = path.join(home, ".gemini", "antigravity", "skills");
  const entries = fs.readdirSync(skillsDir, { withFileTypes: true }).filter((e) => e.isDirectory());
  assert.strictEqual(entries.length, listCommandFiles(COMMANDS_DIR).length);
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
  assert.strictEqual(files.length, 7);
  assert.ok(files.includes("next.toml"));
});

test("install opencode writes one namespaced .md per command", () => {
  const home = tmpDir("ai-learn-opencode-");
  capture(() => installCommand({ platform: "opencode", home }));

  const dir = path.join(home, ".config", "opencode", "command", "ai-learn");
  const files = fs.readdirSync(dir);
  assert.strictEqual(files.length, 7);
  assert.ok(files.includes("next.md"));
});

test("codex-guard renderConfig denies both the dir and its recursive glob", () => {
  const content = renderCodexGuard(["src/**"]);

  assert.match(content, new RegExp(`default_permissions = "${PROFILE_NAME}"`));
  assert.match(content, /"\/" = "read"/);
  assert.match(content, /"\." = "write"/);
  assert.match(content, /"src\/\*\*" = "deny"/);
  assert.match(content, /"src" = "deny"/);
  assert.ok(content.startsWith(MARKER));
});

test("codex-guard renderConfig handles a non-glob learner path as-is", () => {
  const content = renderCodexGuard(["answers.txt"]);
  assert.match(content, /"answers\.txt" = "deny"/);
  assert.doesNotMatch(content, /"answers" = "deny"/);
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
  assert.match(content, /"answers\/\*\*" = "deny"/);
});
