"use strict";

const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { pathToFileURL } = require("node:url");

const {
  ensureOpenCodeGuard,
  inspectOpenCodeGuard,
  pluginSource,
  usesOpenCode,
  PLUGIN_RELATIVE,
  MARKER,
} = require("../bin/lib/platforms/opencode-guard");
const { scaffold } = require("../bin/lib/init");
const { updateCommand } = require("../bin/lib/update");
const { checkProject } = require("../bin/lib/check");
const { tmpProject, sampleProgress, writeFile, capture, withHome } = require("./helpers");

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "ai-learn-opencode-"));
}

// A project OpenCode is actually in use in (opencode.json is one of the two
// signals `ensureOpenCodeGuard` reads), with the guard policy the plugin judges.
function openCodeProject({ mode = "apprenti" } = {}) {
  const dir = tmpDir();
  writeFile(dir, "opencode.json", "{}\n");
  writeFile(dir, ".ai-learn/guard.json", JSON.stringify({ version: 1, mode, learnerFiles: ["src/**"] }));
  return dir;
}

async function loadPlugin(dir, { binary } = {}) {
  const result = ensureOpenCodeGuard(dir, binary ? { binary } : {});

  assert.ok(result.path, "the plugin was written");
  const url = `${pathToFileURL(result.path).href}?t=${Date.now()}-${Math.random()}`;
  const mod = await import(url);
  const hooks = await mod.default.server({ directory: dir });

  return hooks["tool.execute.before"];
}

function call(before, tool, args) {
  return before({ tool }, { args });
}

// The generated plugin must not reach the network or a real guard for a read:
// pointing it at a missing binary makes any launched check observable in the
// "NOT checked" journal, which is exactly what a read must never produce.
async function brokenPlugin(dir) {
  return loadPlugin(dir, { binary: path.join(dir, "missing-ai-learn.js") });
}

test("write and edit into src/** are refused with decide's reason (apprenti)", async () => {
  const dir = openCodeProject();
  const before = await loadPlugin(dir);

  await assert.rejects(call(before, "write", { filePath: "src/a.js", content: "x" }), /fichier solution de l'apprenant/);
  await assert.rejects(
    call(before, "edit", { filePath: "src/a.js", oldString: "a", newString: "b" }),
    /fichier solution de l'apprenant/,
  );
});

test("a denial is written to the same guard.log `check` counts", async () => {
  const dir = openCodeProject();
  const before = await loadPlugin(dir);

  await assert.rejects(call(before, "write", { filePath: "src/a.js", content: "x" }), /fichier solution de l'apprenant/);

  const log = fs.readFileSync(path.join(dir, ".ai-learn", "guard.log"), "utf8");
  assert.match(log, /"tool":"Write"/);
  assert.match(log, /"path":"src\/a\.js"/);
});

test("a write outside the learner files is allowed", async () => {
  const dir = openCodeProject();
  const before = await loadPlugin(dir);

  await call(before, "write", { filePath: "docs/notes.md", content: "x" });
  await call(before, "write", { filePath: "test/a.test.js", content: "x" });
});

test("bash writing into src/ or switching the mode is refused like the Claude hook", async () => {
  const dir = openCodeProject();
  const before = await loadPlugin(dir);

  await assert.rejects(call(before, "bash", { command: "echo x > src/a.js" }), /fichier solution de l'apprenant/);
  await assert.rejects(call(before, "bash", { command: "ai-learn mode dirigeant" }), /acte de l'apprenant/);
  await call(before, "bash", { command: "npm test" });
});

test("bash workdir is resolved, so a relative write inside it is judged at its real target", async () => {
  const dir = openCodeProject();
  const before = await loadPlugin(dir);

  await assert.rejects(
    call(before, "bash", { command: "printf x > a.js", workdir: "src" }),
    /fichier solution de l'apprenant/,
  );
  await call(before, "bash", { command: "printf x > a.js", workdir: "docs" });
});

test("apply_patch deletions are judged: a learner file or the guard policy cannot be deleted", async () => {
  const dir = openCodeProject();
  const before = await loadPlugin(dir);

  const deleteLearner = "*** Begin Patch\n*** Delete File: src/a.js\n*** End Patch\n";
  await assert.rejects(call(before, "apply_patch", { patchText: deleteLearner }), /fichier solution de l'apprenant/);

  const deletePolicy = "*** Begin Patch\n*** Delete File: .ai-learn/guard.json\n*** End Patch\n";
  await assert.rejects(call(before, "apply_patch", { patchText: deletePolicy }), /configure le garde-fou/);
});

test("patch headers without a space after the colon are read, not skipped", async () => {
  const dir = openCodeProject();
  const before = await loadPlugin(dir);

  for (const patchText of [
    "*** Begin Patch\n*** Add File:src/a.js\n+x\n*** End Patch\n",
    "*** Begin Patch\n*** Delete File:src/a.js\n*** End Patch\n",
    "*** Begin Patch\n*** Update File:docs/a.md\n*** Move to:src/a.js\n*** End Patch\n",
  ]) {
    await assert.rejects(call(before, "apply_patch", { patchText }), /fichier solution de l'apprenant/);
  }
});

test("a malformed header next to a readable one is journaled, not silently dropped", async () => {
  const dir = openCodeProject();
  const before = await loadPlugin(dir);
  const patchText = "*** Begin Patch\n*** Add File:docs/ok.md\n+x\n*** Delete File:\n*** End Patch\n";

  await call(before, "apply_patch", { patchText });

  const journal = fs.readFileSync(path.join(dir, ".ai-learn", "guard-unchecked.jsonl"), "utf8");
  assert.match(journal, /malformed file header/);
});

test("a plugin dropped next to the generated one is refused too", async () => {
  const dir = openCodeProject();
  const before = await loadPlugin(dir);

  await assert.rejects(
    call(before, "write", { filePath: ".opencode/plugins/other.js", content: "export default {}\n" }),
    /configure le garde-fou/,
  );
});

test("bash from a nested session directory is judged at the directory it really runs in", async () => {
  const dir = openCodeProject();
  const nested = path.join(dir, "src", "nested");
  fs.mkdirSync(nested, { recursive: true });

  const created = ensureOpenCodeGuard(dir);
  const mod = await import(`${pathToFileURL(created.path).href}?t=${Date.now()}`);
  const hooks = await mod.default.server({ directory: nested });

  await assert.rejects(
    hooks["tool.execute.before"]({ tool: "bash" }, { args: { command: "printf x > a.js" } }),
    /fichier solution de l'apprenant/,
  );
});

test("a spaced session path keeps git blocked (the shell fix is skipped, not the check)", async () => {
  const dir = openCodeProject();
  const spaced = path.join(dir, "my project");
  fs.mkdirSync(spaced, { recursive: true });

  const created = ensureOpenCodeGuard(dir);
  const mod = await import(`${pathToFileURL(created.path).href}?t=${Date.now()}`);
  const hooks = await mod.default.server({ directory: spaced });

  await assert.rejects(
    hooks["tool.execute.before"]({ tool: "bash" }, { args: { command: "git status" } }),
    /git/,
  );
});

test("snake_case tool arguments are read too", async () => {
  const dir = openCodeProject();
  const before = await loadPlugin(dir);

  await assert.rejects(
    call(before, "write", { file_path: "src/a.js", content: "x" }),
    /fichier solution de l'apprenant/,
  );
  await assert.rejects(
    call(before, "edit", { file_path: "src/a.js", new_string: "x" }),
    /fichier solution de l'apprenant/,
  );
});

test("an unmapped path-bearing tool (MCP) is journaled instead of silently allowed", async () => {
  const dir = openCodeProject();
  const before = await loadPlugin(dir);

  await call(before, "mcp_filesystem_read_file", { path: "src/a.js" });

  const journal = fs.readFileSync(path.join(dir, ".ai-learn", "guard-unchecked.jsonl"), "utf8");
  assert.match(journal, /mcp_filesystem_read_file is not mapped/);
});

test("a spaced shell directory does not silently hide a relative write", async () => {
  const dir = openCodeProject();
  const before = await loadPlugin(dir);
  const stderr = [];
  const original = process.stderr.write;

  process.stderr.write = (chunk) => {
    stderr.push(String(chunk));
    return true;
  };

  try {
    await call(before, "bash", { command: "printf x > a.js", workdir: "my project" });
  } finally {
    process.stderr.write = original;
  }

  assert.match(stderr.join(""), /NOT checked/);
  const journal = fs.readFileSync(path.join(dir, ".ai-learn", "guard-unchecked.jsonl"), "utf8");
  assert.match(journal, /relative writes were NOT judged/);
});

test("the spawn fallback allows an explicit allow and forwards a NOT-checked stderr", async () => {
  const dir = openCodeProject();
  const allowBin = path.join(dir, "fake-allow.js");
  fs.writeFileSync(allowBin, "process.exit(0);\n");

  const beforeAllow = await loadPlugin(dir, { binary: allowBin });
  await call(beforeAllow, "write", { filePath: "src/a.js", content: "x" });

  const warnBin = path.join(dir, "fake-warn.js");
  fs.writeFileSync(
    warnBin,
    'process.stderr.write("ai-learn guard: degraded; this write was NOT checked\\n"); process.exit(0);\n',
  );

  const beforeWarn = await loadPlugin(dir, { binary: warnBin });
  const stderr = [];
  const original = process.stderr.write;

  process.stderr.write = (chunk) => {
    stderr.push(String(chunk));
    return true;
  };

  try {
    await call(beforeWarn, "write", { filePath: "src/a.js", content: "x" });
  } finally {
    process.stderr.write = original;
  }

  assert.match(stderr.join(""), /degraded; this write was NOT checked/);
});

test("a guard module whose decide throws fails open visibly", async () => {
  const dir = openCodeProject();
  const fakeBin = path.join(dir, "fake-bin.js");
  fs.writeFileSync(fakeBin, "");
  fs.mkdirSync(path.join(dir, "lib"), { recursive: true });
  fs.writeFileSync(path.join(dir, "lib", "guard.js"), "exports.decide = () => { throw new Error('boom'); };\n");

  const before = await loadPlugin(dir, { binary: fakeBin });
  const stderr = [];
  const original = process.stderr.write;

  process.stderr.write = (chunk) => {
    stderr.push(String(chunk));
    return true;
  };

  try {
    await call(before, "write", { filePath: "src/a.js", content: "x" });
  } finally {
    process.stderr.write = original;
  }

  assert.match(stderr.join(""), /NOT checked/);
  const journal = fs.readFileSync(path.join(dir, ".ai-learn", "guard-unchecked.jsonl"), "utf8");
  assert.match(journal, /the guard errored/);
});

test("bash and apply_patch cannot remove the generated plugin either", async () => {
  const dir = openCodeProject();
  const before = await loadPlugin(dir);

  await assert.rejects(
    call(before, "bash", { command: "rm .opencode/plugins/ai-learn-guard.js" }),
    /configure le garde-fou/,
  );
  await assert.rejects(
    call(before, "apply_patch", {
      patchText: "*** Begin Patch\n*** Delete File: .opencode/plugins/ai-learn-guard.js\n*** End Patch\n",
    }),
    /configure le garde-fou/,
  );
  await assert.rejects(
    call(before, "write", { filePath: ".opencode/plugin/other.js", content: "x" }),
    /configure le garde-fou/,
  );
});

test("the generated plugin cannot be overwritten by the AI", async () => {
  const dir = openCodeProject();
  const before = await loadPlugin(dir);

  await assert.rejects(
    call(before, "write", { filePath: ".opencode/plugins/ai-learn-guard.js", content: "x" }),
    /configure le garde-fou/,
  );
});

test("a patch with no readable file section is reported as unchecked, not allowed silently", async () => {
  const dir = openCodeProject();
  const before = await loadPlugin(dir);
  const stderr = [];
  const original = process.stderr.write;

  process.stderr.write = (chunk) => {
    stderr.push(String(chunk));
    return true;
  };

  try {
    await call(before, "apply_patch", { patchText: "not a patch at all" });
  } finally {
    process.stderr.write = original;
  }

  assert.match(stderr.join(""), /NOT checked/);
  const journal = fs.readFileSync(path.join(dir, ".ai-learn", "guard-unchecked.jsonl"), "utf8");
  assert.match(journal, /apply_patch had no readable file section/);
});

test("apply_patch is refused when it adds or moves a file into src/**", async () => {
  const dir = openCodeProject();
  const before = await loadPlugin(dir);

  const add = "*** Begin Patch\n*** Add File: src/a.js\n+const a = 1;\n*** End Patch\n";
  await assert.rejects(call(before, "apply_patch", { patchText: add }), /fichier solution de l'apprenant/);

  const move = "*** Begin Patch\n*** Update File: docs/a.js\n*** Move to: src/a.js\n*** End Patch\n";
  await assert.rejects(call(before, "apply_patch", { patchText: move }), /fichier solution de l'apprenant/);

  const testsOnly = "*** Begin Patch\n*** Update File: test/a.test.js\n+const t = 1;\n*** End Patch\n";
  await call(before, "apply_patch", { patchText: testsOnly });
});

test("apply_patch with CRLF line endings is still judged", async () => {
  const dir = openCodeProject();
  const before = await loadPlugin(dir);

  const crlf = "*** Begin Patch\r\n*** Add File: src/a.js\r\n+const a = 1;\r\n*** End Patch\r\n";
  await assert.rejects(call(before, "apply_patch", { patchText: crlf }), /fichier solution de l'apprenant/);
});

test("apply_patch with an indented header is still judged", async () => {
  const dir = openCodeProject();
  const before = await loadPlugin(dir);

  const indented = "*** Begin Patch\n  *** Add File: src/a.js\n+const a = 1;\n*** End Patch\n";
  await assert.rejects(call(before, "apply_patch", { patchText: indented }), /fichier solution de l'apprenant/);
});

test("read, glob and grep launch no check and are never refused", async () => {
  const dir = openCodeProject();
  const before = await brokenPlugin(dir);

  await call(before, "read", { filePath: "src/a.js" });
  await call(before, "glob", { pattern: "src/**" });
  await call(before, "grep", { pattern: "secret", path: "src" });

  assert.ok(!fs.existsSync(path.join(dir, ".ai-learn", "guard-unchecked.jsonl")));
});

test("an unavailable guard fails open, says NOT checked on stderr and journals it", async () => {
  const dir = openCodeProject();
  const before = await brokenPlugin(dir);
  const stderr = [];
  const original = process.stderr.write;

  process.stderr.write = (chunk) => {
    stderr.push(String(chunk));
    return true;
  };

  try {
    await call(before, "write", { filePath: "src/a.js", content: "x" });
  } finally {
    process.stderr.write = original;
  }

  assert.match(stderr.join(""), /NOT checked/);
  const journal = fs.readFileSync(path.join(dir, ".ai-learn", "guard-unchecked.jsonl"), "utf8");
  assert.match(journal, /"reason":"no guard module to run"/);
});

test("the start directory below the project root is resolved up to the root", async () => {
  const dir = openCodeProject();
  const nested = path.join(dir, "src", "nested");
  fs.mkdirSync(nested, { recursive: true });

  const result = ensureOpenCodeGuard(dir);
  const url = `${pathToFileURL(result.path).href}?t=${Date.now()}`;
  const mod = await import(url);
  const hooks = await mod.default.server({ directory: nested });

  // A relative path is what OpenCode resolves against the session directory, so
  // `a.js` from `<root>/src/nested` is `<root>/src/nested/a.js` — inside src/**.
  await assert.rejects(
    hooks["tool.execute.before"]({ tool: "write" }, { args: { filePath: "a.js", content: "x" } }),
    /fichier solution de l'apprenant/,
  );
});

test("a Windows-style relative path in the tool args is still refused", async () => {
  const dir = openCodeProject();
  const before = await loadPlugin(dir);

  await assert.rejects(call(before, "write", { filePath: "src\\a.js", content: "x" }), /fichier solution de l'apprenant/);
});

test("the spawn fallback honours an explicit deny and reports a guard that gave no decision", async () => {
  const dir = openCodeProject();
  const denyBin = path.join(dir, "fake-deny.js");
  fs.writeFileSync(denyBin, 'process.stderr.write("ai-learn guard: refusé par le faux binaire\\n"); process.exit(2);\n');

  const beforeDeny = await loadPlugin(dir, { binary: denyBin });
  await assert.rejects(call(beforeDeny, "write", { filePath: "src/a.js", content: "x" }), /refusé par le faux binaire/);

  const errorBin = path.join(dir, "fake-error.js");
  fs.writeFileSync(errorBin, 'process.stderr.write("boom\\n"); process.exit(1);\n');

  const beforeError = await loadPlugin(dir, { binary: errorBin });
  const stderr = [];
  const original = process.stderr.write;

  process.stderr.write = (chunk) => {
    stderr.push(String(chunk));
    return true;
  };

  try {
    await call(beforeError, "write", { filePath: "src/a.js", content: "x" });
  } finally {
    process.stderr.write = original;
  }

  assert.match(stderr.join(""), /NOT checked/);
  const journal = fs.readFileSync(path.join(dir, ".ai-learn", "guard-unchecked.jsonl"), "utf8");
  assert.match(journal, /the guard gave no decision \(exit 1\)/);
});

test("the 2.x setup path registers the same check", async () => {
  const dir = openCodeProject();
  const created = ensureOpenCodeGuard(dir);
  const mod = await import(`${pathToFileURL(created.path).href}?t=${Date.now()}`);
  const registered = [];

  await mod.default.setup({
    location: { directory: dir },
    tool: { hook: (name, callback) => registered.push({ name, callback }) },
  });

  assert.strictEqual(registered[0].name, "execute.before");
  await assert.rejects(
    registered[0].callback({ tool: "write", input: { filePath: "src/a.js", content: "x" } }),
    /fichier solution de l'apprenant/,
  );
});

test("the 2.x default export carries id/server/setup and setup returns early on 1.x", async () => {
  const dir = openCodeProject();
  const created = ensureOpenCodeGuard(dir);
  const mod = await import(`${pathToFileURL(created.path).href}?t=${Date.now()}`);

  assert.strictEqual(mod.default.id, "ai-learn.guard");
  assert.strictEqual(typeof mod.default.server, "function");
  assert.strictEqual(typeof mod.default.setup, "function");

  // 1.x calls `setup` with a partial context and no `ctx.tool`: returning is
  // the only thing that keeps the whole plugin from failing to load.
  await mod.default.setup({});
  await mod.default.setup({ tool: null });
});

test("ensure writes the plugin only when OpenCode is in use or explicitly asked", () => {
  const plain = tmpDir();
  assert.strictEqual(usesOpenCode(plain), false);
  assert.deepStrictEqual(ensureOpenCodeGuard(plain), { status: "skipped", path: null });
  assert.ok(!fs.existsSync(path.join(plain, PLUGIN_RELATIVE)));

  const withDir = tmpDir();
  fs.mkdirSync(path.join(withDir, ".opencode"));
  assert.strictEqual(usesOpenCode(withDir), true);
  const created = ensureOpenCodeGuard(withDir);
  assert.strictEqual(created.status, "created");
  assert.ok(fs.readFileSync(created.path, "utf8").startsWith(MARKER));

  assert.strictEqual(ensureOpenCodeGuard(withDir).status, "unchanged");
});

test("a marker prefix that is not our exact first line is foreign, not ours", () => {
  const dir = openCodeProject();
  writeFile(dir, PLUGIN_RELATIVE, "// ai-learn:guard-plugin-old\n// mine\n");

  assert.strictEqual(inspectOpenCodeGuard(dir).state, "foreign");
  assert.strictEqual(ensureOpenCodeGuard(dir).status, "skipped");
});

test("an unreadable plugin path is reported, not crashed on", () => {
  const dir = tmpProject(sampleProgress());
  writeFile(dir, "opencode.json", "{}\n");
  ensureOpenCodeGuard(dir);
  const target = path.join(dir, PLUGIN_RELATIVE);
  fs.rmSync(target, { force: true });
  fs.mkdirSync(target);

  assert.strictEqual(inspectOpenCodeGuard(dir).state, "unreadable");
  assert.strictEqual(ensureOpenCodeGuard(dir).status, "skipped");

  const entry = checkProject(dir, { home: tmpDir() });
  assert.ok(entry.issues.warnings.some((w) => /illisible/.test(w.message)));
});

test("check stays silent when the plugin is current", () => {
  const dir = tmpProject(sampleProgress());
  writeFile(dir, "opencode.json", "{}\n");
  ensureOpenCodeGuard(dir);
  const entry = checkProject(dir, { home: tmpDir() });

  assert.ok(!entry.issues.warnings.some((w) => /plugin OpenCode/.test(w.message)));
});

test("ensure never overwrites a plugin that is not ours", () => {
  const dir = openCodeProject();
  writeFile(dir, PLUGIN_RELATIVE, "// someone else's plugin\n");

  assert.strictEqual(ensureOpenCodeGuard(dir).status, "skipped");
  assert.strictEqual(fs.readFileSync(path.join(dir, PLUGIN_RELATIVE), "utf8"), "// someone else's plugin\n");
  assert.strictEqual(inspectOpenCodeGuard(dir).state, "foreign");
});

test("inspect reports absent, current and stale", () => {
  const dir = openCodeProject();
  assert.strictEqual(inspectOpenCodeGuard(dir).state, "absent");

  const created = ensureOpenCodeGuard(dir);
  assert.strictEqual(inspectOpenCodeGuard(dir).state, "current");

  fs.writeFileSync(created.path, `${MARKER}\n// old body\n`);
  assert.strictEqual(inspectOpenCodeGuard(dir).state, "stale");
});

test("init creates no OpenCode file for a project that does not use it", () => {
  const home = tmpDir();
  const dir = tmpDir();

  withHome(home, () => {
    capture(() => scaffold({ dir, project: "demo", technology: "Node", docSource: null, phases: [] }));
  });

  assert.ok(!fs.existsSync(path.join(dir, ".opencode")));
});

test("init wires the plugin when OpenCode is in use, or when --platform opencode is passed", () => {
  const home = tmpDir();
  const inUse = tmpDir();
  writeFile(inUse, "opencode.json", "{}\n");

  withHome(home, () => {
    capture(() => scaffold({ dir: inUse, project: "demo", technology: "Node", docSource: null, phases: [] }));
  });
  assert.ok(fs.existsSync(path.join(inUse, PLUGIN_RELATIVE)));

  const explicit = tmpDir();
  withHome(home, () => {
    capture(() =>
      scaffold({ dir: explicit, project: "demo", technology: "Node", docSource: null, phases: [], platform: "opencode" }),
    );
  });
  assert.ok(fs.existsSync(path.join(explicit, PLUGIN_RELATIVE)));
});

test("update leaves a foreign plugin intact and names it, regenerates ours, reports unchanged", () => {
  const home = tmpDir();
  const foreign = tmpProject(sampleProgress());
  writeFile(foreign, "opencode.json", "{}\n");
  writeFile(foreign, PLUGIN_RELATIVE, "// mine\n");

  let output;
  withHome(home, () => {
    output = capture(() => updateCommand({ root: foreign }));
  });
  assert.strictEqual(fs.readFileSync(path.join(foreign, PLUGIN_RELATIVE), "utf8"), "// mine\n");
  assert.match(output, /opencode guard: plugin personnalisé/);

  const ours = tmpProject(sampleProgress());
  writeFile(ours, "opencode.json", "{}\n");
  writeFile(ours, PLUGIN_RELATIVE, `${MARKER}\n// old body\n`);
  withHome(home, () => {
    capture(() => updateCommand({ root: ours }));
  });
  assert.doesNotMatch(fs.readFileSync(path.join(ours, PLUGIN_RELATIVE), "utf8"), /old body/);

  const upToDate = tmpProject(sampleProgress());
  writeFile(upToDate, "opencode.json", "{}\n");
  ensureOpenCodeGuard(upToDate);
  withHome(home, () => {
    output = capture(() => updateCommand({ root: upToDate }));
  });
  assert.match(output, /opencode guard: .*inchangé/);
});

test("check flags an absent, stale or foreign plugin with the update correction", () => {
  for (const setup of [
    () => {},
    (dir) => writeFile(dir, PLUGIN_RELATIVE, `${MARKER}\n// old\n`),
    (dir) => writeFile(dir, PLUGIN_RELATIVE, "// mine\n"),
  ]) {
    const dir = tmpProject(sampleProgress());
    writeFile(dir, "opencode.json", "{}\n");
    setup(dir);

    const entry = checkProject(dir, { home: tmpDir() });
    assert.deepStrictEqual(entry.issues.errors, []);
    assert.ok(
      entry.issues.warnings.some((w) => /plugin OpenCode/.test(w.message) && /ai-learn update/.test(w.message)),
      "the warning names the correction",
    );
  }
});

test("check stays silent about OpenCode when the project does not use it", () => {
  const dir = tmpProject(sampleProgress());
  writeFile(dir, ".ai-learn/guard.json", JSON.stringify({ version: 1, learnerFiles: ["src/**"] }));

  const entry = checkProject(dir, { home: tmpDir() });
  assert.ok(!entry.issues.warnings.some((w) => /plugin OpenCode/.test(w.message)));
});
