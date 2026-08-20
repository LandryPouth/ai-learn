"use strict";

const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");

const {
  decide,
  loadGuardConfig,
  matchesLearnerPath,
  shellWriteTargets,
  toRelative,
  ensureGuardHook,
} = require("../bin/lib/guard");
const { checkProject } = require("../bin/lib/check");
const { tmpProject, writeFile } = require("./helpers");

const BIN = path.join(__dirname, "..", "bin", "ai-learn.js");

function hookFor(dir, toolName, toolInput) {
  return { cwd: dir, tool_name: toolName, tool_input: toolInput };
}

function runGuard({ dir, toolName, toolInput }) {
  const input = path.join(dir, "_hook-input.json");
  fs.writeFileSync(input, JSON.stringify(hookFor(dir, toolName, toolInput)));
  try {
    const stdout = execFileSync(process.execPath, [BIN, "guard", "--input", input], { encoding: "utf8" });
    return { status: 0, stdout };
  } catch (error) {
    return { status: error.status, stdout: error.stdout || "" };
  }
}

test("Write/Edit into a learner file is denied; docs/solutions is allowed", () => {
  const dir = tmpProject({ version: 1, project: "demo", technology: "X", docSource: null, phases: [] });

  const denied = decide(hookFor(dir, "Edit", { file_path: path.join(dir, "src", "index.ts") }), dir);
  assert.strictEqual(denied.decision, "deny");
  assert.match(denied.reason, /src\/index\.ts/);

  const allowed = decide(hookFor(dir, "Write", { file_path: path.join(dir, "docs", "solutions", "route.md") }), dir);
  assert.strictEqual(allowed.decision, "allow");

  // NotebookEdit and MultiEdit are covered too.
  assert.strictEqual(
    decide(hookFor(dir, "NotebookEdit", { notebook_path: path.join(dir, "src", "x.ipynb") }), dir).decision,
    "deny",
  );
  assert.strictEqual(
    decide(hookFor(dir, "MultiEdit", { file_path: path.join(dir, "src", "y.ts") }), dir).decision,
    "deny",
  );
});

test("non-write tools (Read, Grep) are never blocked", () => {
  const dir = tmpProject({ version: 1, project: "demo", technology: "X", docSource: null, phases: [] });
  assert.strictEqual(decide(hookFor(dir, "Read", { file_path: path.join(dir, "src", "index.ts") }), dir).decision, "allow");
});

test("Bash writing into a learner file via redirection or tee is denied; read-only bash is allowed", () => {
  const dir = tmpProject({ version: 1, project: "demo", technology: "X", docSource: null, phases: [] });

  for (const cmd of [
    `echo 'export {}' > src/index.ts`,
    `cat >> src/index.ts <<'EOF'\nx\nEOF`,
    `tee src/index.ts < ref.txt`,
  ]) {
    assert.strictEqual(decide(hookFor(dir, "Bash", { command: cmd }), dir).decision, "deny", cmd);
  }

  assert.strictEqual(
    decide(hookFor(dir, "Bash", { command: "node --import tsx --test checkpoint/phase-0.test.mjs" }), dir).decision,
    "allow",
  );
  assert.strictEqual(
    decide(hookFor(dir, "Bash", { command: "npm run build" }), dir).decision,
    "allow",
  );
});

test("Bash in-place editors and one-liner writers are denied; their read-only twins are allowed", () => {
  const dir = tmpProject({ version: 1, project: "demo", technology: "X", docSource: null, phases: [] });

  // In-place editors rewrite their file operands.
  for (const cmd of [
    `sed -i 's/x/y/' src/index.ts`,
    `sed -ibak 's/x/y/' src/index.ts`, // attached suffix (macOS style)
    `perl -i -pe 's/x/y/' src/index.ts`,
    `python3 -c "open('src/x.ts','w').write('x')"`,
    `python3 -c "Path('src/x.ts').write_text('x')"`,
    `node -e "require('fs').writeFileSync('src/x.ts','x')"`,
    `node --eval "require('fs').appendFileSync('src/x.ts','x')"`,
  ]) {
    assert.strictEqual(decide(hookFor(dir, "Bash", { command: cmd }), dir).decision, "deny", cmd);
  }

  // Read-only twins of the same commands must pass.
  for (const cmd of [
    `sed 's/x/y/' src/index.ts`, // no -i: writes to stdout
    `sed -n 'p' src/index.ts`,
    `python3 -c "open('src/x.ts').read()"`, // no write mode
    `node -e "require('fs').readFileSync('src/x.ts','utf8')"`,
    `grep -rn "writeFileSync(" src/`, // a grep for the pattern is not a write
  ]) {
    assert.strictEqual(decide(hookFor(dir, "Bash", { command: cmd }), dir).decision, "allow", cmd);
  }
});

test("loadGuardConfig defaults to src/** and reads a custom learnerFiles list", () => {
  const dir = tmpProject({ version: 1, project: "demo", technology: "X", docSource: null, phases: [] });

  assert.deepStrictEqual(loadGuardConfig(dir).learnerFiles, ["src/**"]);

  writeFile(dir, ".ai-learn/guard.json", JSON.stringify({ version: 1, learnerFiles: ["lib/**", "index.ts"] }));
  assert.deepStrictEqual(loadGuardConfig(dir).learnerFiles, ["lib/**", "index.ts"]);
});

test("matchesLearnerPath glob: ** crosses directories, * stays in one segment", () => {
  assert.strictEqual(matchesLearnerPath("src/index.ts", ["src/**"]), true);
  assert.strictEqual(matchesLearnerPath("src/sub/deep.ts", ["src/**"]), true);
  assert.strictEqual(matchesLearnerPath("docs/src/x.ts", ["src/**"]), false);
  assert.strictEqual(matchesLearnerPath("src.ts", ["src/**"]), false);
  assert.strictEqual(matchesLearnerPath("src/a.ts", ["src/*"]), true);
  assert.strictEqual(matchesLearnerPath("src/sub/a.ts", ["src/*"]), false);
});

test("toRelative resolves a path inside the project and rejects outside", () => {
  const dir = tmpProject({ version: 1, project: "demo", technology: "X", docSource: null, phases: [] });
  assert.strictEqual(toRelative(dir, path.join(dir, "src", "index.ts")), "src/index.ts");
  assert.strictEqual(toRelative(dir, "/etc/passwd"), null);
});

test("guardCommand denies with exit 2 and logs the denial; allows with exit 0", () => {
  const dir = tmpProject({ version: 1, project: "demo", technology: "X", docSource: null, phases: [] });

  const denied = runGuard({ dir, toolName: "Write", toolInput: { file_path: path.join(dir, "src", "index.ts") } });
  assert.strictEqual(denied.status, 2);
  assert.match(denied.stdout, /permissionDecision.*deny/);

  const logPath = path.join(dir, ".ai-learn", "guard.log");
  assert.ok(fs.existsSync(logPath));
  const line = JSON.parse(fs.readFileSync(logPath, "utf8").trim().split("\n").pop());
  assert.strictEqual(line.tool, "Write");
  assert.strictEqual(line.path, "src/index.ts");
  assert.match(line.reason, /solution/);

  const allowed = runGuard({ dir, toolName: "Write", toolInput: { file_path: path.join(dir, "docs", "solutions", "x.md") } });
  assert.strictEqual(allowed.status, 0);
  assert.match(allowed.stdout, /permissionDecision.*allow/);
});

test("a broken hook input fails open (allow)", () => {
  const dir = tmpProject({ version: 1, project: "demo", technology: "X", docSource: null, phases: [] });
  const input = path.join(dir, "_broken.json");
  fs.writeFileSync(input, "not json {");
  const stdout = execFileSync(process.execPath, [BIN, "guard", "--input", input], { encoding: "utf8" });
  assert.match(stdout, /permissionDecision.*allow/);
});

test("ensureGuardHook wires settings.json + guard.json + docs/solutions/, idempotent and merging", () => {
  const dir = tmpProject({ version: 1, project: "demo", technology: "X", docSource: null, phases: [] });
  // Pre-existing settings with another hook — must be preserved.
  writeFile(dir, ".claude/settings.json", JSON.stringify({ hooks: { PreToolUse: [{ matcher: "Bash", hooks: [{ type: "command", command: "other-guard" }] }] } }));

  const first = ensureGuardHook(dir);
  assert.strictEqual(first.wired, false);
  assert.ok(first.created.length >= 3);

  const settings = JSON.parse(fs.readFileSync(path.join(dir, ".claude", "settings.json"), "utf8"));
  const entries = settings.hooks.PreToolUse;
  assert.strictEqual(entries.length, 2); // the other hook survived
  const ours = entries.find((e) => JSON.stringify(e).includes("ai-learn.js guard"));
  assert.ok(ours);
  assert.ok(fs.existsSync(path.join(dir, ".ai-learn", "guard.json")));
  assert.match(fs.readFileSync(path.join(dir, "docs", "solutions", "README.md"), "utf8"), /apprenant tape/);

  // Idempotent: a second run wires nothing new.
  const before = fs.readFileSync(path.join(dir, ".claude", "settings.json"), "utf8");
  const second = ensureGuardHook(dir);
  assert.strictEqual(second.wired, true);
  assert.strictEqual(second.created.length, 0);
  assert.strictEqual(fs.readFileSync(path.join(dir, ".claude", "settings.json"), "utf8"), before);
});

test("checkProject warns when guard.json exists but the hook is not wired", () => {
  const dir = tmpProject({ version: 1, project: "demo", technology: "X", docSource: null, phases: [] });
  writeFile(dir, ".ai-learn/guard.json", JSON.stringify({ version: 1, learnerFiles: ["src/**"] }));
  // No .claude/settings.json — the block is configured but inactive.

  const entry = checkProject(dir);
  assert.ok(entry.issues.warnings.some((w) => /guard/.test(w.message)));
});

test("checkProject warns on IA-typed corrections (the visible escape hatch)", () => {
  const dir = tmpProject({
    version: 1,
    project: "demo",
    technology: "X",
    docSource: null,
    phases: [{ id: 0, name: "P", status: "pending", checkpoint: null, artifacts: [], predictionsRequired: 1 }],
  });
  writeFile(dir, "docs/plans/predictions.md", "### Phase 0 — prédiction 1/1\n- Corrigé par : IA\n");

  const entry = checkProject(dir);
  assert.ok(entry.issues.warnings.some((w) => /Corrigé par : IA/i.test(w.message)));
});
