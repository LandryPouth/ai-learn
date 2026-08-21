"use strict";

const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const { parseCommandFile, listCommandFiles } = require("../bin/lib/platforms/commands");
const { renderCommand } = require("../bin/lib/platforms/codex");
const { installCommand, linkOrCopy } = require("../bin/lib/install");
const { capture } = require("./helpers");

const COMMANDS_DIR = path.join(__dirname, "..", "commands");

function tmpHome() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "ai-learn-install-"));
}

test("parseCommandFile reads frontmatter and body from a real command file", () => {
  const parsed = parseCommandFile(path.join(COMMANDS_DIR, "next.md"));

  assert.strictEqual(parsed.name, "next");
  assert.strictEqual(parsed.description, "Prochaine phase à faire");
  assert.strictEqual(parsed.argumentHint, "");
  assert.deepStrictEqual(parsed.allowedTools, ["Bash"]);
  assert.match(parsed.body, /ai-learn next/);
  assert.doesNotMatch(parsed.body, /^---/);
});

test("listCommandFiles finds all 7 source commands", () => {
  const files = listCommandFiles(COMMANDS_DIR);
  assert.strictEqual(files.length, 7);
  assert.ok(files.every((f) => f.endsWith(".md")));
});

test("codex renderCommand produces a namespaced prompt with valid frontmatter", () => {
  const parsed = parseCommandFile(path.join(COMMANDS_DIR, "docs.md"));
  const { filename, content } = renderCommand(parsed);

  assert.strictEqual(filename, "ai-learn-docs.md");
  assert.match(content, /^---\ndescription: "/);
  assert.match(content, /argument-hint: "/);
  assert.match(content, /ai-learn docs/);
});

test("codex renderCommand omits an empty argument-hint line", () => {
  const { content } = renderCommand({ name: "status", description: "d", argumentHint: "", body: "body\n" });
  assert.doesNotMatch(content, /argument-hint/);
});

test("install codex writes one prompt file per command, no guard/hook wiring", () => {
  const home = tmpHome();
  capture(() => installCommand({ platform: "codex", home }));

  const promptsDir = path.join(home, ".codex", "prompts");
  const files = fs.readdirSync(promptsDir);

  assert.strictEqual(files.length, 7);
  assert.ok(files.includes("ai-learn-next.md"));
  assert.ok(!fs.existsSync(path.join(home, ".claude")));
});

test("install claude symlinks commands and the binary, idempotently", () => {
  const home = tmpHome();
  capture(() => installCommand({ platform: "claude", home }));

  const binLink = path.join(home, ".local", "bin", "ai-learn");
  const commandsDir = path.join(home, ".claude", "commands");
  assert.ok(fs.lstatSync(binLink).isSymbolicLink());
  assert.strictEqual(fs.readdirSync(commandsDir).length, 7);

  // Second run: nothing new, no error on existing symlinks.
  const output = capture(() => installCommand({ platform: "claude", home }));
  assert.match(output, /already installed/);
});

test("install with no platform lists available platforms without writing anything", () => {
  const home = tmpHome();
  const output = capture(() => installCommand({ home }));

  assert.match(output, /claude/);
  assert.match(output, /codex/);
  assert.ok(!fs.existsSync(path.join(home, ".claude")));
  assert.ok(!fs.existsSync(path.join(home, ".codex")));
});

test("install refuses an unknown platform", () => {
  const home = tmpHome();
  assert.throws(() => installCommand({ platform: "nope", home }), /unknown platform "nope"/);
});

test("linkOrCopy falls back to a real copy when symlinks are refused (Windows without Developer Mode)", () => {
  const home = tmpHome();
  const src = path.join(home, "source.txt");
  const dest = path.join(home, "dest.txt");
  fs.writeFileSync(src, "content");

  const original = fs.symlinkSync;
  fs.symlinkSync = () => {
    const error = new Error("operation not permitted");
    error.code = "EPERM";
    throw error;
  };

  try {
    linkOrCopy(src, dest);
  } finally {
    fs.symlinkSync = original;
  }

  assert.ok(!fs.lstatSync(dest).isSymbolicLink());
  assert.strictEqual(fs.readFileSync(dest, "utf8"), "content");
});

test("linkOrCopy re-throws errors unrelated to symlink permissions", () => {
  const home = tmpHome();
  const original = fs.symlinkSync;
  fs.symlinkSync = () => {
    throw new Error("disk full");
  };

  try {
    assert.throws(() => linkOrCopy(path.join(home, "a"), path.join(home, "b")), /disk full/);
  } finally {
    fs.symlinkSync = original;
  }
});
