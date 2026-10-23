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
  validateGuardConfig,
  matchesLearnerPath,
  isProtectedPath,
  shellWriteTargets,
  detectGitOrGh,
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

test("Bash git/gh invocations are denied — reads included — with common wrappers/chains/subshells", () => {
  const dir = tmpProject({ version: 1, project: "demo", technology: "X", docSource: null, phases: [] });

  for (const cmd of [
    "git status",
    "git -C /tmp log",
    "gh pr view",
    'git add . && git commit -m "x"',
    "ls; git log",
    "echo $(git rev-parse HEAD)",
    "echo `git rev-parse HEAD`",
    "/usr/bin/git status",
    "npx gh pr view 1",
    "sudo git log",
    "FOO=bar git status",
    "git log | head",
  ]) {
    assert.strictEqual(decide(hookFor(dir, "Bash", { command: cmd }), dir).decision, "deny", cmd);
  }
});

test("Bash git/gh false positives are avoided (name match is exact, not substring)", () => {
  const dir = tmpProject({ version: 1, project: "demo", technology: "X", docSource: null, phases: [] });

  for (const cmd of ["cat .gitignore", "npm run build", "legit-deploy.sh status", "digitalocean-cli deploy"]) {
    assert.strictEqual(decide(hookFor(dir, "Bash", { command: cmd }), dir).decision, "allow", cmd);
  }
});

test("blockedCommands: [] in guard.json disables the git/gh block entirely", () => {
  const dir = tmpProject({ version: 1, project: "demo", technology: "X", docSource: null, phases: [] });
  writeFile(dir, ".ai-learn/guard.json", JSON.stringify({ version: 1, learnerFiles: ["src/**"], blockedCommands: [] }));

  assert.strictEqual(decide(hookFor(dir, "Bash", { command: "git status" }), dir).decision, "allow");
});

test("gitAliases opts an explicit alias into the block; unlisted aliases stay allowed", () => {
  const dir = tmpProject({ version: 1, project: "demo", technology: "X", docSource: null, phases: [] });

  assert.strictEqual(decide(hookFor(dir, "Bash", { command: "g status" }), dir).decision, "allow");

  writeFile(dir, ".ai-learn/guard.json", JSON.stringify({ version: 1, learnerFiles: ["src/**"], gitAliases: ["g"] }));
  assert.strictEqual(decide(hookFor(dir, "Bash", { command: "g status" }), dir).decision, "deny");
});

test("detectGitOrGh returns the matched binary and offending segment", () => {
  assert.deepStrictEqual(detectGitOrGh("git status", ["git", "gh"]), { binary: "git", segment: "git status" });
  assert.strictEqual(detectGitOrGh("npm test", ["git", "gh"]), null);
});

test("guardCommand logs the offending command (not a path) for a git/gh denial", () => {
  const dir = tmpProject({ version: 1, project: "demo", technology: "X", docSource: null, phases: [] });
  const denied = runGuard({ dir, toolName: "Bash", toolInput: { command: "git commit -m x" } });
  assert.strictEqual(denied.status, 2);

  const logPath = path.join(dir, ".ai-learn", "guard.log");
  const line = JSON.parse(fs.readFileSync(logPath, "utf8").trim().split("\n").pop());
  assert.strictEqual(line.path, null);
  assert.strictEqual(line.command, "git commit -m x");
  assert.match(line.reason, /git\/gh/);
});

test("loadGuardConfig defaults to src/** and reads a custom learnerFiles list", () => {
  const dir = tmpProject({ version: 1, project: "demo", technology: "X", docSource: null, phases: [] });

  assert.deepStrictEqual(loadGuardConfig(dir).learnerFiles, ["src/**"]);

  writeFile(dir, ".ai-learn/guard.json", JSON.stringify({ version: 1, learnerFiles: ["lib/**", "index.ts"] }));
  assert.deepStrictEqual(loadGuardConfig(dir).learnerFiles, ["lib/**", "index.ts"]);
});

// ---------------------------------------------------------------------------
// Mode `apprenti|dirigeant` (story 03.01). The mode inverts the property: in
// `dirigeant` the AI writes the implementation (`src/**`) and the learner keeps
// the specification (`test/**`, `checkpoint/**`). The default is the most
// restrictive mode — an absent or corrupt config can never open `src/**`.
// ---------------------------------------------------------------------------

function writeMode(dir, mode) {
  const config = mode === undefined ? { version: 1 } : { version: 1, mode };
  writeFile(dir, ".ai-learn/guard.json", JSON.stringify(config));
}

function blankProject() {
  return tmpProject({ version: 1, project: "demo", technology: "X", docSource: null, phases: [] });
}

test("mode apprenti (défaut) : src/** bloqué, test/** et checkpoint/** autorisés — non-régression", () => {
  const dir = blankProject();
  writeMode(dir, undefined);

  assert.strictEqual(decide(hookFor(dir, "Write", { file_path: path.join(dir, "src", "index.ts") }), dir).decision, "deny");
  assert.strictEqual(decide(hookFor(dir, "Write", { file_path: path.join(dir, "test", "index.test.ts") }), dir).decision, "allow");
  assert.strictEqual(decide(hookFor(dir, "Write", { file_path: path.join(dir, "checkpoint", "phase-0.mjs") }), dir).decision, "allow");
});

test("mode dirigeant : l'IA écrit src/** (autorisé) et ne touche plus à test/** ni checkpoint/** (bloqués)", () => {
  const dir = blankProject();
  writeMode(dir, "dirigeant");

  assert.strictEqual(decide(hookFor(dir, "Edit", { file_path: path.join(dir, "src", "index.ts") }), dir).decision, "allow");
  for (const rel of ["test/index.test.ts", "checkpoint/phase-0.mjs"]) {
    assert.strictEqual(decide(hookFor(dir, "Write", { file_path: path.join(dir, rel) }), dir).decision, "deny", rel);
  }
});

test("mode inconnu, absent ou non-chaîne retombe sur apprenti — jamais le mode le plus permissif", () => {
  for (const mode of [undefined, "Dirigeant", "admin", "", 42, true, null, { n: "dirigeant" }, ["dirigeant"]]) {
    const dir = blankProject();
    writeMode(dir, mode);
    assert.strictEqual(
      decide(hookFor(dir, "Write", { file_path: path.join(dir, "src", "index.ts") }), dir).decision,
      "deny",
      `mode=${JSON.stringify(mode)} must stay apprenti`,
    );
    assert.strictEqual(
      decide(hookFor(dir, "Write", { file_path: path.join(dir, "test", "x.test.ts") }), dir).decision,
      "allow",
      `mode=${JSON.stringify(mode)} must stay apprenti`,
    );
  }
});

test("matrice de décision du guard : chaque case {mode} × {src, test, checkpoint} est couverte", () => {
  const cases = [
    ["apprenti", "src/index.ts", "deny"],
    ["apprenti", "test/index.test.ts", "allow"],
    ["apprenti", "checkpoint/phase-0.mjs", "allow"],
    ["dirigeant", "src/index.ts", "allow"],
    ["dirigeant", "test/index.test.ts", "deny"],
    ["dirigeant", "checkpoint/phase-0.mjs", "deny"],
  ];

  for (const [mode, rel, expected] of cases) {
    const dir = blankProject();
    writeMode(dir, mode);
    assert.strictEqual(decide(hookFor(dir, "Write", { file_path: path.join(dir, rel) }), dir).decision, expected, `${mode} × ${rel} → ${expected}`);
  }
});

test("mode dirigeant : toutes les conventions de test reconnues par scan.js restent à l'apprenant", () => {
  const dir = blankProject();
  writeMode(dir, "dirigeant");

  // `scan.js#detectTests` treats a file as a test when it lives under
  // test(s)/ or __tests__, or when its basename carries a test/spec marker.
  // The guard must agree, otherwise the AI could rewrite the specification.
  const learnerOwned = [
    "test/index.test.ts",
    "tests/index.test.ts",
    "src/__tests__/index.ts",
    "__tests__/index.ts",
    "src/index.test.ts",
    "index.spec.js",
    "src/index.spec.js",
    "src/test_helpers.py",
    "src/helpers_test.go",
    "src/helpers-test.js",
    "src/helpers_spec.rb",
    "src/Foo.Test.ts",
    "src/foo_test",
    "src/foo-spec",
    "src/helpers_spec",
    "src/TEST_helpers.py",
    "test",
    "spec",
    "test.js",
    "spec.js",
    "test.ts",
    "spec.ts",
    "src/test",
    "src/spec",
    "src/test.js",
    "src/spec.ts",
    "src/test.py",
    "src/spec.rb",
    "checkpoint/phase-0.mjs",
  ];

  for (const rel of learnerOwned) {
    assert.strictEqual(decide(hookFor(dir, "Write", { file_path: path.join(dir, rel) }), dir).decision, "deny", rel);
  }

  for (const rel of ["src/index.ts", "src/helpers.ts", "docs/solutions/x.md"]) {
    assert.strictEqual(decide(hookFor(dir, "Write", { file_path: path.join(dir, rel) }), dir).decision, "allow", rel);
  }
});

test("mode dirigeant : les commandes Bash respectent le même périmètre inversé", () => {
  const dir = blankProject();
  writeMode(dir, "dirigeant");

  assert.strictEqual(decide(hookFor(dir, "Bash", { command: "echo x > test/index.test.ts" }), dir).decision, "deny");
  assert.strictEqual(decide(hookFor(dir, "Bash", { command: "tee checkpoint/phase-0.mjs" }), dir).decision, "deny");
  assert.strictEqual(decide(hookFor(dir, "Bash", { command: "echo x > src/index.ts" }), dir).decision, "allow");
});

test("Bash: a leading cd does not move a protected or learner target out of the check", () => {
  const dir = blankProject();
  writeMode(dir, "dirigeant");

  for (const command of [
    "cd .ai-learn && echo {} > guard.json",
    "cd .claude && echo x > settings.local.json",
    "cd .codex && echo x > config.toml",
    "cd test && echo x > x.test.ts",
    "cd src/__tests__ && echo x > a.test.ts",
  ]) {
    assert.strictEqual(decide(hookFor(dir, "Bash", { command }), dir).decision, "deny", command);
  }

  assert.strictEqual(decide(hookFor(dir, "Bash", { command: "cd src && echo x > index.ts" }), dir).decision, "allow");
});

test("Bash: chained cd, pushd/popd and & segments resolve back inside the project", () => {
  const dir = blankProject();
  writeMode(dir, "dirigeant");

  for (const command of [
    // `cd a && cd ..` must land on the root, not on `../` (which toRelative drops).
    "cd test && cd .. && echo x > test/x.test.ts",
    "cd src/__tests__ && cd .. && echo x > a.test.ts",
    "cd .ai-learn && cd .. && echo {} > .ai-learn/guard.json",
    // `&` is a command separator too; the rest of the segment must be scanned.
    "cd .ai-learn & echo {} > guard.json",
    "pushd test && echo x > x.test.ts && popd",
  ]) {
    assert.strictEqual(decide(hookFor(dir, "Bash", { command }), dir).decision, "deny", command);
  }

  assert.strictEqual(
    decide(hookFor(dir, "Bash", { command: "cd test && cd .. && echo x > src/index.ts" }), dir).decision,
    "allow",
  );
});

test("Bash: one-liner and subshell writes are resolved against the cd context", () => {
  const dir = blankProject();
  writeMode(dir, "dirigeant");

  for (const command of [
    `cd .ai-learn && python3 -c "open('guard.json','w').write('{}')"`,
    `cd .ai-learn && node -e "require('fs').writeFileSync('guard.json','x')"`,
    "echo $(echo x > .ai-learn/guard.json)",
    "echo `echo x > .ai-learn/guard.json`",
    `cd test && python3 -c "open('x.test.ts','w').write('')"`,
  ]) {
    assert.strictEqual(decide(hookFor(dir, "Bash", { command }), dir).decision, "deny", command);
  }

  assert.strictEqual(
    decide(hookFor(dir, "Bash", { command: `cd src && python3 -c "open('index.ts','w').write('')"` }), dir).decision,
    "allow",
  );
});

test("Bash: cp -t / --target-directory resolves the destination directory", () => {
  const dir = blankProject();
  writeMode(dir, "dirigeant");

  for (const command of [
    "cp guard.json -t .ai-learn",
    "cp -t .ai-learn guard.json",
    "cp --target-directory=.ai-learn guard.json",
    "cp --target-directory .ai-learn guard.json",
    "mv -t test x.test.ts",
  ]) {
    assert.strictEqual(decide(hookFor(dir, "Bash", { command }), dir).decision, "deny", command);
  }

  assert.strictEqual(decide(hookFor(dir, "Bash", { command: "cp src/index.ts -t docs" }), dir).decision, "allow");
});

test("Bash: destructive/in-place forms are caught for policy and learner files", () => {
  const dir = blankProject();
  writeMode(dir, "dirigeant");

  for (const command of [
    "rm .ai-learn/guard.json",
    "rm -rf .ai-learn",
    "mv .ai-learn/guard.json /tmp/x",
    "tee -a .claude/settings.local.json",
    "truncate -s 0 .claude/settings.json",
  ]) {
    assert.strictEqual(decide(hookFor(dir, "Bash", { command }), dir).decision, "deny", command);
  }
});

test("le guard refuse à l'IA de réécrire sa propre configuration dans les deux modes", () => {
  for (const mode of [undefined, "apprenti", "dirigeant"]) {
    const dir = blankProject();
    writeMode(dir, mode);

    for (const rel of [
      ".ai-learn/guard.json",
      ".claude/settings.json",
      ".claude/settings.local.json",
      ".codex/config.toml",
    ]) {
      assert.strictEqual(
        decide(hookFor(dir, "Write", { file_path: path.join(dir, rel) }), dir).decision,
        "deny",
        `${mode}: ${rel}`,
      );
    }
  }

  const dir = blankProject();
  writeMode(dir, "dirigeant");
  assert.strictEqual(decide(hookFor(dir, "Bash", { command: "echo '{}' > .ai-learn/guard.json" }), dir).decision, "deny");
  assert.strictEqual(
    decide(hookFor(dir, "Bash", { command: "sed -i 's/a/b/' .claude/settings.json" }), dir).decision,
    "deny",
  );
  assert.strictEqual(
    decide(hookFor(dir, "Bash", { command: "echo '{\"disableAllHooks\":true}' > .claude/settings.local.json" }), dir).decision,
    "deny",
  );
});

test("les ledgers globaux ~/.ai-learn ne sont pas réécrivables par l'IA (preuves du mode dirigeant)", () => {
  const dir = blankProject();
  writeMode(dir, "dirigeant");
  const ledger = path.join(os.homedir(), ".ai-learn", "tracks", "tests.json");

  for (const tool of ["Write", "Edit", "MultiEdit"]) {
    assert.strictEqual(
      decide(hookFor(dir, tool, { file_path: ledger }), dir).decision,
      "deny",
      `${tool} ${ledger}`,
    );
  }

  // The whole global state directory is protected, not just the one file.
  assert.strictEqual(
    decide(hookFor(dir, "Write", { file_path: path.join(os.homedir(), ".ai-learn") }), dir).decision,
    "deny",
  );
  // A relative escape from the project resolves to the same absolute path.
  assert.strictEqual(
    decide(hookFor(dir, "Write", { file_path: path.relative(dir, ledger) }), dir).decision,
    "deny",
  );
  // The common shell route is denied too (a hedge, like the rest of Bash).
  assert.strictEqual(
    decide(hookFor(dir, "Bash", { command: `echo '{}' > ${ledger}` }), dir).decision,
    "deny",
  );
  // A sibling directory that merely shares the prefix is not over-matched.
  assert.strictEqual(
    decide(hookFor(dir, "Write", { file_path: path.join(path.dirname(os.homedir()), "not-ai-learn", "x.json") }), dir).decision,
    "allow",
  );
});

test("~ et $HOME-free ~/.ai-learn ne contournent pas le refus Bash", () => {
  const dir = blankProject();
  writeMode(dir, "dirigeant");

  assert.strictEqual(
    decide(hookFor(dir, "Bash", { command: "echo x > ~/.ai-learn/tracks/tests.json" }), dir).decision,
    "deny",
  );
  assert.strictEqual(
    decide(hookFor(dir, "Bash", { command: "cd ~ && echo x > .ai-learn/tracks/tests.json" }), dir).decision,
    "deny",
  );
  assert.strictEqual(
    decide(hookFor(dir, "Bash", { command: "echo x > $HOME/.ai-learn/tracks/tests.json" }), dir).decision,
    "deny",
  );
  assert.strictEqual(
    decide(hookFor(dir, "Bash", { command: "echo x > ${HOME}/.ai-learn/tracks/tests.json" }), dir).decision,
    "deny",
  );
  assert.strictEqual(
    decide(hookFor(dir, "Bash", { command: `echo x > ~${os.userInfo().username}/.ai-learn/tracks/tests.json` }), dir).decision,
    "deny",
    "`~<login>` names the same home directory as `~`",
  );
  // Another login's home is not this ledger: leave it unresolved instead of
  // over-denying a path that is not `$HOME`.
  assert.strictEqual(
    decide(
      hookFor(dir, "Bash", { command: "echo x > ~ai-learn-nonexistent-user/.ai-learn/tracks/tests.json" }),
      dir,
    ).decision,
    "allow",
  );
});

test("un HOME symlinké ne sort pas le ledger réel de la protection", () => {
  const dir = blankProject();
  writeMode(dir, "dirigeant");
  const base = fs.mkdtempSync(path.join(os.tmpdir(), "ai-learn-home-"));
  const realHome = path.join(base, "real-home");
  const linkHome = path.join(base, "link-home");
  fs.mkdirSync(path.join(realHome, ".ai-learn", "tracks"), { recursive: true });

  try {
    fs.symlinkSync(realHome, linkHome, "dir");
  } catch {
    fs.rmSync(base, { recursive: true, force: true });
    return; // symlinks unavailable on this platform/user
  }

  const previousHome = process.env.HOME;
  process.env.HOME = linkHome;
  try {
    assert.strictEqual(
      decide(
        hookFor(dir, "Write", { file_path: path.join(realHome, ".ai-learn", "tracks", "tests.json") }),
        dir,
      ).decision,
      "deny",
      "the real path of a symlinked HOME is still the ledger",
    );
  } finally {
    if (previousHome === undefined) {
      delete process.env.HOME;
    } else {
      process.env.HOME = previousHome;
    }
    fs.rmSync(base, { recursive: true, force: true });
  }
});

test("un symlink ne contourne pas la protection (chemins résolus via realpath)", () => {
  const dir = blankProject();
  writeMode(dir, "dirigeant");
  fs.mkdirSync(path.join(dir, "test"), { recursive: true });

  const protectedLink = path.join(dir, "policy");

  try {
    fs.symlinkSync(path.join(dir, ".ai-learn"), protectedLink, "dir");
  } catch {
    return; // symlinks unavailable on this platform/user
  }

  // A symlinked route to the guard's own policy is denied like the real path.
  assert.strictEqual(
    decide(hookFor(dir, "Write", { file_path: path.join(protectedLink, "guard.json") }), dir).decision,
    "deny",
  );

  const specLink = path.join(dir, "spec");
  fs.symlinkSync(path.join(dir, "test"), specLink, "dir");
  assert.strictEqual(
    decide(hookFor(dir, "Write", { file_path: path.join(specLink, "foo.ts") }), dir).decision,
    "deny",
    "a symlinked route into the learner's specification is denied",
  );
});

test("un symlink interne vers l'extérieur ne contourne pas le blocage apprenant", () => {
  const dir = blankProject();
  writeMode(dir, "apprenti");
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), "ai-learn-outside-"));

  try {
    fs.mkdirSync(path.join(dir, "src"), { recursive: true });
    fs.rmdirSync(path.join(dir, "src"));
    fs.symlinkSync(outside, path.join(dir, "src"), "dir");
  } catch {
    fs.rmSync(outside, { recursive: true, force: true });
    return; // symlinks unavailable on this platform/user
  }

  try {
    // The lexical path is the learner's `src/**` even though its real target is
    // outside the project — judging only the realpath would let this write pass.
    assert.strictEqual(
      decide(hookFor(dir, "Write", { file_path: path.join(dir, "src", "foo.ts") }), dir).decision,
      "deny",
    );
    assert.strictEqual(
      decide(hookFor(dir, "Bash", { command: "echo x > src/foo.ts" }), dir).decision,
      "deny",
    );
  } finally {
    fs.rmSync(outside, { recursive: true, force: true });
  }
});

test("`disableAllHooks` cannot be planted: settings.local.json outranks settings.json but stays denied", () => {
  for (const mode of [undefined, "apprenti", "dirigeant"]) {
    const dir = blankProject();
    writeMode(dir, mode);

    // A Write is the mechanical wall; a settings.local.json edit would be
    // reloaded by Claude Code and could switch the PreToolUse hook off.
    assert.strictEqual(
      decide(hookFor(dir, "Write", { file_path: path.join(dir, ".claude", "settings.local.json") }), dir).decision,
      "deny",
      `${mode}: Write settings.local.json`,
    );
    assert.strictEqual(
      decide(hookFor(dir, "Edit", { file_path: path.join(dir, ".claude", "settings.local.json") }), dir).decision,
      "deny",
      `${mode}: Edit settings.local.json`,
    );
  }
});

test("protected and learner paths match case-insensitively where the filesystem does (win32/darwin)", () => {
  assert.strictEqual(isProtectedPath(".claude/settings.local.json", "linux"), true);
  assert.strictEqual(isProtectedPath(".CLAUDE/SETTINGS.LOCAL.JSON", "linux"), false);
  assert.strictEqual(isProtectedPath(".CLAUDE/SETTINGS.LOCAL.JSON", "win32"), true);
  assert.strictEqual(isProtectedPath(".AI-LEARN/GUARD.JSON", "darwin"), true);

  assert.strictEqual(matchesLearnerPath("Src/Index.ts", ["src/**"], "linux"), false);
  assert.strictEqual(matchesLearnerPath("Src/Index.ts", ["src/**"], "linux", { caseInsensitive: true }), true);
  assert.strictEqual(matchesLearnerPath("Src/Index.ts", ["src/**"], "win32"), true);
  assert.strictEqual(matchesLearnerPath("TEST/X.test.ts", ["test/**"], "darwin"), true);

  // A directory that contains a protected file is protected itself: removing
  // `.ai-learn` deletes guard.json just as surely as writing it.
  assert.strictEqual(isProtectedPath(".ai-learn", "linux"), true);
  assert.strictEqual(isProtectedPath(".claude", "linux"), true);
  assert.strictEqual(isProtectedPath(".codex", "linux"), true);
  assert.strictEqual(isProtectedPath(".ai-learn/other.json", "linux"), false);
});

test("apprenti keeps the platform's case-insensitive match on win32/darwin", () => {
  const dir = blankProject();
  writeMode(dir, undefined);

  const original = process.platform;
  const override = (platform) =>
    Object.defineProperty(process, "platform", { value: platform, configurable: true });

  try {
    override("win32");
    assert.strictEqual(
      decide(hookFor(dir, "Write", { file_path: path.join(dir, "Src", "Index.ts") }), dir).decision,
      "deny",
      "a capital letter must not walk past src/** on a case-insensitive filesystem",
    );

    override("linux");
    assert.strictEqual(
      decide(hookFor(dir, "Write", { file_path: path.join(dir, "Src", "Index.ts") }), dir).decision,
      "allow",
      "on a case-sensitive filesystem Src/Index.ts is a distinct, allowed path",
    );
  } finally {
    override(original);
  }
});

test("un learnerFiles mal typé retombe sur le défaut au lieu de faire fail-open", () => {
  const dir = blankProject();
  writeFile(dir, ".ai-learn/guard.json", JSON.stringify({ version: 1, learnerFiles: [null] }));

  assert.deepStrictEqual(loadGuardConfig(dir).learnerFiles, ["src/**"]);
  assert.strictEqual(decide(hookFor(dir, "Write", { file_path: path.join(dir, "src", "index.ts") }), dir).decision, "deny");
  assert.match(validateGuardConfig({ version: 1, learnerFiles: [null] })[0].message, /non-string or empty entry/);

  writeFile(dir, ".ai-learn/guard.json", JSON.stringify({ version: 1, blockedCommands: [null] }));
  assert.deepStrictEqual(loadGuardConfig(dir).blockedCommands, ["git", "gh"]);
  assert.match(validateGuardConfig({ version: 1, blockedCommands: [null] })[0].message, /non-string or empty entry/);
});

test("checkProject warns when the implementation scope matches no files", () => {
  const dir = blankProject();
  writeMode(dir, "dirigeant");

  // A freshly initialized project has nothing to scope yet: not a misconfiguration.
  const fresh = checkProject(dir);
  assert.ok(!fresh.issues.warnings.some((w) => /implementation scope .* matches no files/.test(w.message)));

  // Source exists, but outside the declared scope: the proof would be vacuous.
  writeFile(dir, "lib/index.js", "module.exports = {};\n");
  const misplaced = checkProject(dir);
  assert.ok(misplaced.issues.warnings.some((w) => /implementation scope .* matches no files/.test(w.message)));

  writeFile(dir, "src/index.js", "module.exports = {};\n");
  const populated = checkProject(dir);
  assert.ok(!populated.issues.warnings.some((w) => /implementation scope .* matches no files/.test(w.message)));
});

test("matrice de décision du guard : git/gh reste bloqué dans les deux modes (§3bis inchangé)", () => {
  for (const mode of ["apprenti", "dirigeant"]) {
    const dir = blankProject();
    writeMode(dir, mode);
    for (const command of ["git status", "gh pr view", "git add . && git commit -m x"]) {
      assert.strictEqual(decide(hookFor(dir, "Bash", { command }), dir).decision, "deny", `${mode}: ${command}`);
    }
  }
});

test("mode dirigeant ignore un learnerFiles stocké : l'inversion ne peut pas être à moitié appliquée", () => {
  const dir = blankProject();
  // A hand-set learnerFiles that points at the implementation must NOT survive:
  // otherwise dirigeant would still block src/** and never invert the property.
  writeFile(dir, ".ai-learn/guard.json", JSON.stringify({ version: 1, mode: "dirigeant", learnerFiles: ["src/**"] }));

  assert.ok(loadGuardConfig(dir).learnerFiles.includes("test/**"));
  assert.ok(loadGuardConfig(dir).learnerFiles.includes("checkpoint/**"));
  assert.strictEqual(decide(hookFor(dir, "Write", { file_path: path.join(dir, "src", "index.ts") }), dir).decision, "allow");
  assert.strictEqual(decide(hookFor(dir, "Write", { file_path: path.join(dir, "test", "x.test.ts") }), dir).decision, "deny");
});

test("loadGuardConfig expose le mode et un implementationFiles (cible de la mutation) sûr dans les deux modes", () => {
  const dir = blankProject();

  // No guard.json at all: apprenti by default, and the mutation target is src.
  const absent = loadGuardConfig(dir);
  assert.strictEqual(absent.mode, "apprenti");
  assert.deepStrictEqual(absent.learnerFiles, ["src/**"]);
  assert.deepStrictEqual(absent.implementationFiles, ["src/**"]);

  // Apprenti with a custom scope: the mutation target follows the learner's
  // files, so a later consumer switch does not start mutating src/**.
  writeFile(dir, ".ai-learn/guard.json", JSON.stringify({ version: 1, learnerFiles: ["lib/**"] }));
  assert.deepStrictEqual(loadGuardConfig(dir).implementationFiles, ["lib/**"]);

  writeFile(dir, ".ai-learn/guard.json", JSON.stringify({ version: 1, mode: "dirigeant" }));
  const dirigeant = loadGuardConfig(dir);
  assert.strictEqual(dirigeant.mode, "dirigeant");
  assert.ok(dirigeant.learnerFiles.includes("test/**"));
  assert.ok(dirigeant.learnerFiles.includes("checkpoint/**"));
  // The implementation the AI now writes stays the mutation target.
  assert.deepStrictEqual(dirigeant.implementationFiles, ["src/**"]);

  // A non-src layout can declare its implementation scope explicitly; without
  // this, the proof scope silently matched zero files for lib/** projects.
  writeFile(
    dir,
    ".ai-learn/guard.json",
    JSON.stringify({ version: 1, mode: "dirigeant", implementationFiles: ["lib/**"] }),
  );
  const custom = loadGuardConfig(dir);
  assert.ok(custom.learnerFiles.includes("test/**"), "the block set still inverts to the specification");
  assert.deepStrictEqual(custom.implementationFiles, ["lib/**"]);

  // A malformed explicit value falls back to src/**, never to a partial list.
  writeFile(dir, ".ai-learn/guard.json", JSON.stringify({ version: 1, mode: "dirigeant", implementationFiles: [null] }));
  assert.deepStrictEqual(loadGuardConfig(dir).implementationFiles, ["src/**"]);

  // In apprenti the field is ignored: the learner's own scope is the target.
  writeFile(
    dir,
    ".ai-learn/guard.json",
    JSON.stringify({ version: 1, learnerFiles: ["lib/**"], implementationFiles: ["src/**"] }),
  );
  assert.deepStrictEqual(loadGuardConfig(dir).implementationFiles, ["lib/**"]);
});

test("loadGuardConfig returns fresh arrays: a caller mutating them cannot poison the next call", () => {
  const dir = blankProject();
  writeFile(dir, ".ai-learn/guard.json", JSON.stringify({ version: 1, learnerFiles: ["lib/**"] }));

  const first = loadGuardConfig(dir);
  first.learnerFiles.push("src/**");
  first.implementationFiles.push("src/**");

  assert.deepStrictEqual(loadGuardConfig(dir).learnerFiles, ["lib/**"]);
  assert.deepStrictEqual(loadGuardConfig(dir).implementationFiles, ["lib/**"]);
});

test("validateGuardConfig signale un mode inconnu, une version inattendue et un champ mal typé", () => {
  assert.deepStrictEqual(validateGuardConfig({ version: 1, mode: "dirigeant" }), []);

  const issues = validateGuardConfig({ version: 2, mode: "Dirigeant", learnerFiles: "src/**" });
  const messages = issues.map((i) => i.message).join("\n");
  assert.match(messages, /version is 2/);
  assert.match(messages, /mode "Dirigeant" is unknown/);
  assert.match(messages, /learnerFiles is not an array/);

  assert.match(validateGuardConfig(null)[0].message, /unreadable/);

  // implementationFiles is a dirigeant-only override: accepted there, ignored
  // (and signalled) in apprenti, and rejected when malformed.
  assert.deepStrictEqual(validateGuardConfig({ version: 1, mode: "dirigeant", implementationFiles: ["lib/**"] }), []);
  assert.match(
    validateGuardConfig({ version: 1, implementationFiles: ["lib/**"] })[0].message,
    /only applies in mode "dirigeant"/,
  );
  assert.match(
    validateGuardConfig({ version: 1, mode: "dirigeant", implementationFiles: [null] })[0].message,
    /non-empty array of non-empty strings/,
  );
});

test("checkProject warns on an unknown guard.json mode instead of silently enforcing apprenti", () => {
  const dir = blankProject();
  writeFile(dir, ".ai-learn/guard.json", JSON.stringify({ version: 1, mode: "Dirigeant" }));

  const entry = checkProject(dir);
  assert.ok(entry.issues.warnings.some((w) => /\.ai-learn\/guard\.json/.test(w.file) && /mode .* is unknown/.test(w.message)));
});

test("checkProject stays quiet on a valid guard.json", () => {
  const dir = blankProject();
  writeFile(dir, ".ai-learn/guard.json", JSON.stringify({ version: 1, mode: "dirigeant", learnerFiles: ["test/**"] }));
  writeFile(dir, "src/index.js", "module.exports = {};\n");

  const entry = checkProject(dir);
  assert.ok(!entry.issues.warnings.some((w) => /\.ai-learn\/guard\.json/.test(w.file)));
});

test("mode dirigeant : un learnerFiles/blockedCommands custom ne rouvre pas la spécification (§3bis)", () => {
  const dir = blankProject();
  // blockedCommands: [] turns the git/gh block off, but the mode inversion is
  // independent: test/** and checkpoint/** stay the learner's.
  writeFile(
    dir,
    ".ai-learn/guard.json",
    JSON.stringify({ version: 1, mode: "dirigeant", learnerFiles: ["src/**"], blockedCommands: [] }),
  );

  assert.strictEqual(decide(hookFor(dir, "Bash", { command: "git status" }), dir).decision, "allow");
  assert.strictEqual(decide(hookFor(dir, "Write", { file_path: path.join(dir, "test", "x.test.ts") }), dir).decision, "deny");
  assert.strictEqual(decide(hookFor(dir, "Write", { file_path: path.join(dir, "src", "index.ts") }), dir).decision, "allow");
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

// Security fix (story 01.06): `path.relative()` between a directory and its
// exact parent yields ".." with no trailing "/../..." — `rel.startsWith("../")`
// alone doesn't match that literal string, so this exact case slipped past
// the guard before the fix, on any OS. Reachable natively on this host,
// unlike the Windows cross-drive case below.
test("toRelative rejects the project's own parent directory (exact '..', not just '../...')", () => {
  const dir = tmpProject({ version: 1, project: "demo", technology: "X", docSource: null, phases: [] });
  assert.strictEqual(toRelative(dir, path.dirname(dir)), null);
});

// Documents the Windows-specific half of the same fix: `path.relative()` is
// host-OS-native, so `toRelative()` itself can't be exercised with Windows
// semantics on Linux CI (same limitation noted for CRLF in story 01.01's
// plan.md). What's testable here is the assumption the fix relies on —
// across drives, path.win32.relative() returns the target path unchanged
// instead of "../..", which is exactly what path.isAbsolute() then catches.
test("path.win32.relative across drives returns the target unchanged, which toRelative's isAbsolute() check catches", () => {
  const rel = path.win32.relative("D:\\project", "C:\\Windows\\System32\\config");
  assert.strictEqual(path.win32.isAbsolute(rel), true);
  assert.strictEqual(rel.startsWith("../"), false);
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

test("guardCommand honours the mode end-to-end: dirigeant denies test/**, allows src/**", () => {
  const dir = blankProject();
  writeMode(dir, "dirigeant");

  const denied = runGuard({ dir, toolName: "Write", toolInput: { file_path: path.join(dir, "test", "x.test.ts") } });
  assert.strictEqual(denied.status, 2);
  assert.match(denied.stdout, /permissionDecision.*deny/);
  assert.match(denied.stdout, /spécification de l'apprenant/);

  const allowed = runGuard({ dir, toolName: "Write", toolInput: { file_path: path.join(dir, "src", "index.ts") } });
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

test("ensureGuardHook refreshes a stale generated solutions README (title marker), keeping it generated", () => {
  const dir = tmpProject({ version: 1, project: "demo", technology: "X", docSource: null, phases: [] });
  // A stale generated README: right title, outdated body (no non-collable rule).
  fs.mkdirSync(path.join(dir, "docs", "solutions"), { recursive: true });
  fs.writeFileSync(path.join(dir, "docs", "solutions", "README.md"), "# Solutions de référence — où l'IA dépose le code\nOLD\n");

  const result = ensureGuardHook(dir);
  assert.deepStrictEqual(result.refreshed, ["docs/solutions/README.md"]);
  const text = fs.readFileSync(path.join(dir, "docs", "solutions", "README.md"), "utf8");
  assert.match(text, /non-collable/);
  assert.doesNotMatch(text, /OLD/);
});

test("ensureGuardHook never overwrites a customized solutions README (different title)", () => {
  const dir = tmpProject({ version: 1, project: "demo", technology: "X", docSource: null, phases: [] });
  fs.mkdirSync(path.join(dir, "docs", "solutions"), { recursive: true });
  const custom = "# Mes notes perso\nPas généré par ai-learn.\n";
  fs.writeFileSync(path.join(dir, "docs", "solutions", "README.md"), custom);

  const result = ensureGuardHook(dir);
  assert.deepStrictEqual(result.refreshed, []);
  assert.strictEqual(fs.readFileSync(path.join(dir, "docs", "solutions", "README.md"), "utf8"), custom);
});

test("ensureGuardHook writes mode: apprenti into a fresh guard.json and preserves an existing dirigeant mode", () => {
  const fresh = blankProject();
  ensureGuardHook(fresh);
  const created = JSON.parse(fs.readFileSync(path.join(fresh, ".ai-learn", "guard.json"), "utf8"));
  assert.strictEqual(created.mode, "apprenti");
  assert.deepStrictEqual(created.learnerFiles, ["src/**"]);

  // Re-running the wiring (what `update` does) must not reset the mode.
  const dirigeant = blankProject();
  writeFile(dirigeant, ".ai-learn/guard.json", JSON.stringify({ version: 1, mode: "dirigeant" }));
  ensureGuardHook(dirigeant);
  const preserved = JSON.parse(fs.readFileSync(path.join(dirigeant, ".ai-learn", "guard.json"), "utf8"));
  assert.strictEqual(preserved.mode, "dirigeant");
});

test("ensureGuardHook in dirigeant inverts the Codex profile and the generated README", () => {
  const dir = blankProject();
  writeFile(dir, ".ai-learn/guard.json", JSON.stringify({ version: 1, mode: "dirigeant" }));

  ensureGuardHook(dir);

  const codex = fs.readFileSync(path.join(dir, ".codex", "config.toml"), "utf8");
  assert.match(codex, /"test" = "deny"/);
  assert.match(codex, /"checkpoint" = "deny"/);
  assert.doesNotMatch(codex, /"test\/\*\*" = "deny"/);
  assert.doesNotMatch(codex, /"src" = "deny"/);

  const readme = fs.readFileSync(path.join(dir, "docs", "solutions", "README.md"), "utf8");
  assert.match(readme, /mode \*\*dirigeant\*\*/);
  assert.match(readme, /l'IA écrit l'implémentation/);
  assert.doesNotMatch(readme, /l'apprenant tape tout le code/);
});

test("the Codex sandbox denies the guard's own config files in both modes", () => {
  for (const mode of [undefined, "apprenti", "dirigeant"]) {
    const dir = blankProject();
    writeMode(dir, mode);
    ensureGuardHook(dir);

    const codex = fs.readFileSync(path.join(dir, ".codex", "config.toml"), "utf8");
    assert.match(codex, /"\.ai-learn\/guard\.json" = "deny"/, `${mode}: guard.json`);
    assert.match(codex, /"\.codex\/config\.toml" = "deny"/, `${mode}: config.toml`);
  }
});

test("ensureGuardHook re-renders the README when the mode flips, without touching a custom one", () => {
  const dir = blankProject();
  ensureGuardHook(dir);
  const apprenti = fs.readFileSync(path.join(dir, "docs", "solutions", "README.md"), "utf8");
  assert.match(apprenti, /l'apprenant tape tout le code/);

  fs.mkdirSync(path.join(dir, "src", "__tests__"), { recursive: true });
  writeFile(dir, ".ai-learn/guard.json", JSON.stringify({ version: 1, mode: "dirigeant" }));
  const result = ensureGuardHook(dir);
  assert.ok(result.refreshed.includes("docs/solutions/README.md"));
  assert.ok(result.refreshed.includes(".codex/config.toml"));
  assert.match(fs.readFileSync(path.join(dir, "docs", "solutions", "README.md"), "utf8"), /mode \*\*dirigeant\*\*/);
  const codex = fs.readFileSync(path.join(dir, ".codex", "config.toml"), "utf8");
  assert.match(codex, /"src\/__tests__" = "deny"/);
});

test("denial reasons name the mode's actual remedy, not the apprenti one", () => {
  const apprenti = blankProject();
  writeMode(apprenti, "apprenti");
  const apprentiReason = decide(hookFor(apprenti, "Write", { file_path: path.join(apprenti, "src", "index.ts") }), apprenti).reason;
  assert.match(apprentiReason, /solution de l'apprenant/);
  assert.match(apprentiReason, /docs\/solutions/);

  const dirigeant = blankProject();
  writeMode(dirigeant, "dirigeant");
  const dirigeantReason = decide(hookFor(dirigeant, "Write", { file_path: path.join(dirigeant, "test", "x.test.ts") }), dirigeant).reason;
  assert.match(dirigeantReason, /spécification de l'apprenant/);
  assert.doesNotMatch(dirigeantReason, /code de révélation/);
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

test("l'IA ne lance pas `ai-learn mode` ni ne surcharge HOME pour forger un ledger", () => {
  const dir = blankProject();
  writeMode(dir, "apprenti");

  for (const command of [
    "ai-learn mode dirigeant",
    "HOME=/tmp/fakehome ai-learn mode dirigeant",
    "cd x && npx ai-learn mode dirigeant --dir .",
    "node bin/ai-learn.js mode dirigeant",
    "HOME=/tmp/fakehome ai-learn verify phase-1",
  ]) {
    assert.strictEqual(decide(hookFor(dir, "Bash", { command }), dir).decision, "deny", command);
  }

  // Other ai-learn commands stay usable by the AI (verify, check, status).
  for (const command of ["ai-learn verify phase-1", "ai-learn check", "ai-learn status"]) {
    assert.strictEqual(decide(hookFor(dir, "Bash", { command }), dir).decision, "allow", command);
  }
});

test("les évidences .ai-learn/runs ne sont pas réécrivables par l'IA", () => {
  const dir = blankProject();
  writeMode(dir, "dirigeant");

  for (const tool of ["Write", "Edit", "MultiEdit"]) {
    assert.strictEqual(
      decide(hookFor(dir, tool, { file_path: path.join(dir, ".ai-learn", "runs", "phase-1.json") }), dir).decision,
      "deny",
      tool,
    );
  }
  assert.strictEqual(
    decide(hookFor(dir, "Bash", { command: "echo '{}' > .ai-learn/runs/phase-1.json" }), dir).decision,
    "deny",
  );
});
