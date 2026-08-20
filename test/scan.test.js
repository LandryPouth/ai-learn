"use strict";

// `ai-learn scan` — analyze an existing project and propose deepening
// directions. The contract under test is the one that makes `scan` safe: it
// must read the codebase objectively, never mutate it, and never suggest a step
// back. Non-regression is the structural invariant, so it gets its own test.

const { test, afterEach } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");
const { writeFile, capture } = require("./helpers");
const {
  scanProject,
  scanCommand,
  walkSources,
  gitState,
  detectStack,
  detectTests,
  detectConcepts,
  estimateLevel,
  suggestDirections,
} = require("../bin/lib/scan");

const BIN = path.join(__dirname, "..", "bin", "ai-learn.js");

afterEach(() => {
  process.exitCode = 0;
});

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "ai-learn-scan-"));
}

// A believable advanced C project: Makefile, split src/, struct + function
// pointers, malloc, strtok/sscanf parsing, pthreads, sockets, signals, tests.
function makeCFixture(root) {
  writeFile(root, "Makefile", "CC=gcc\nCFLAGS=-Wall -Wextra\n\nall: main.o net.o\n\t$(CC) $(CFLAGS) -o rpg main.o net.o\n");
  writeFile(
    root,
    "src/main.c",
    [
      '#include <stdio.h>',
      '#include <stdlib.h>',
      '#include <string.h>',
      '',
      'typedef struct Entity Entity;',
      'typedef int (*attack_fn)(Entity *);',
      'typedef void (*defend_fn)(Entity *, int);',
      '',
      'int main(void) {',
      '  char *buf = malloc(64);',
      '  char name[32];',
      '  sscanf("hero 12", "%s %d", name, &((int){0}));',
      '  char *tok = strtok(buf, " ");',
      '  free(buf);',
      '  return 0;',
      '}',
      '',
    ].join("\n"),
  );
  writeFile(
    root,
    "src/net.c",
    [
      '#include <pthread.h>',
      '#include <sys/socket.h>',
      '#include <netinet/in.h>',
      '#include <signal.h>',
      '',
      'void *worker(void *a) { return a; }',
      '',
      'int server(void) {',
      '  pthread_t t;',
      '  pthread_create(&t, NULL, worker, 0);',
      '  pthread_join(t, 0);',
      '  int fd = socket(AF_INET, SOCK_STREAM, 0);',
      '  bind(fd, 0, 0);',
      '  listen(fd, 5);',
      '  signal(SIGINT, SIG_IGN);',
      '  return fd;',
      '}',
      '',
    ].join("\n"),
  );
  writeFile(root, "test/test.c", '#include <stdio.h>\nint main(void) { printf("ok\\n"); return 0; }\n');
}

test("scan on an advanced C fixture reports stack, concepts, level, tests", () => {
  const dir = tmpDir();
  makeCFixture(dir);

  const report = scanProject(dir);
  const ids = report.concepts.used.map((c) => c.id);

  assert.strictEqual(report.stack.language, "C");
  assert.ok(ids.includes("c-memory"), `c-memory missing in ${ids}`);
  assert.ok(ids.includes("c-struct-fn-ptr"), `c-struct-fn-ptr missing in ${ids}`);
  assert.ok(ids.includes("c-threads"), `c-threads missing in ${ids}`);
  assert.ok(ids.includes("c-sockets"), `c-sockets missing in ${ids}`);
  assert.strictEqual(report.level.tier, 4);
  assert.strictEqual(report.level.label, "Avancé");
  assert.strictEqual(report.tests.count, 1);
  assert.strictEqual(report.git.isRepo, false); // graceful when not a git repo
  assert.strictEqual(report.learningProject, false);
});

test("scan is non-destructive: only .ai-learn/scan.json is added, sources untouched", () => {
  const dir = tmpDir();
  makeCFixture(dir);

  const snapshot = (root) => {
    const out = {};
    const walk = (current) => {
      for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
        const abs = path.join(current, entry.name);
        if (entry.isDirectory()) {
          walk(abs);
        } else if (entry.isFile()) {
          out[path.relative(root, abs)] = fs.readFileSync(abs);
        }
      }
    };
    walk(root);
    return out;
  };

  const before = snapshot(dir);
  scanCommand({ dir }); // the only command that writes
  const after = snapshot(dir);

  const added = Object.keys(after).filter((rel) => !(rel in before));
  const modified = Object.keys(before).filter((rel) => Buffer.compare(before[rel], after[rel]) !== 0);

  assert.deepStrictEqual(added, [".ai-learn/scan.json"]);
  assert.deepStrictEqual(modified, []);
  assert.ok(!("progress.json" in after));
});

test("suggestions are strictly deeper than the deepest used concept", () => {
  const dir = tmpDir();
  makeCFixture(dir);

  const report = scanProject(dir);
  const usedTiers = report.concepts.used.map((c) => c.tier);
  const maxUsedTier = Math.max(...usedTiers);
  const usedIds = new Set(report.concepts.used.map((c) => c.id));

  assert.ok(report.suggestions.length > 0, "expected at least one suggestion");
  for (const suggestion of report.suggestions) {
    assert.ok(suggestion.tier > maxUsedTier, `${suggestion.id} is not deeper than ${maxUsedTier}`);
    assert.ok(!usedIds.has(suggestion.deepens), `${suggestion.deepens} is already mastered`);
  }
  assert.strictEqual(report.suggestions[0].tier, maxUsedTier + 1);
});

test("recipes carry a concrete ladder (steps + checkpoints) in scan.json", () => {
  const dir = tmpDir();
  makeCFixture(dir);

  const report = scanProject(dir);
  const http = report.suggestions.find((s) => s.id === "c-http-server");
  assert.ok(http, `c-http-server should be suggested for the C fixture: ${report.suggestions.map((s) => s.id)}`);
  assert.ok(Array.isArray(http.steps) && http.steps.length === 3);
  assert.ok(http.steps.every((s) => s.title && s.checkpoint), "every ladder step needs a title and a checkpoint");
});

test("recipe ladders render as an Échelle with checkpoints in the report", () => {
  const dir = tmpDir();
  makeCFixture(dir);

  const out = capture(() => scanCommand({ dir }));

  assert.match(out, /Étapes concrètes/);
  assert.match(out, /Serveur HTTP from scratch/);
  assert.match(out, /checkpoint : curl -v/);
});

test("recipes require their anchors: js-redis is blocked without tests", () => {
  const dir = tmpDir();
  // async but no test files → js-http-server (requires js-async) survives,
  // js-redis (requires js-async + js-tests) is filtered out by non-regression.
  writeFile(
    dir,
    "src/index.js",
    "async function main() { await Promise.resolve(1); }\nasync function other() { await Promise.resolve(2); }\nmain();\n",
  );

  const report = scanProject(dir);
  const ids = report.suggestions.map((s) => s.id);

  assert.ok(ids.includes("js-http-server"), `js-http-server missing in ${ids}`);
  assert.ok(!ids.includes("js-redis"), `js-redis should be filtered (no js-tests): ${ids}`);
});

test("scan on an already-tracked project reuses the ledger and keeps it unchanged", () => {
  const dir = tmpDir();
  const progress = {
    version: 1,
    project: "fastify-demo",
    technology: "Fastify",
    docSource: null,
    phases: [
      { id: 0, name: "Routes", status: "done", checkpoint: "node -e \"\"", artifacts: ["docs/0.md"], predictionsRequired: 1 },
      { id: 1, name: "Schema", status: "pending", checkpoint: "node -e \"\"", artifacts: [], predictionsRequired: 3 },
    ],
  };
  writeFile(dir, "progress.json", `${JSON.stringify(progress, null, 2)}\n`);
  writeFile(
    dir,
    "src/index.js",
    'const fastify = require("fastify");\nconst server = fastify();\nserver.get("/health", async (req, reply) => reply.send({ ok: true }));\nserver.post("/echo", async (req, reply) => reply.send(req.body));\n',
  );

  const ledgerBefore = fs.readFileSync(path.join(dir, "progress.json"), "utf8");
  const report = scanProject(dir);
  const ids = report.concepts.used.map((c) => c.id);

  assert.strictEqual(report.learningProject, true);
  assert.strictEqual(report.learning.doneCount, 1);
  assert.strictEqual(report.learning.totalCount, 2);
  assert.strictEqual(report.learning.phases[0].status, "done");
  assert.ok(ids.includes("js-routes"), `js-routes missing in ${ids}`);
  assert.ok(ids.includes("js-async"), `js-async missing in ${ids}`);
  assert.strictEqual(fs.readFileSync(path.join(dir, "progress.json"), "utf8"), ledgerBefore);
});

test("estimateLevel: a single cheap structural signal is not enough to bump the level", () => {
  const oneSignal = estimateLevel({ usedConcepts: [], tests: { count: 0 }, git: { commits: 50 }, size: { totalLoc: 100 } });
  assert.strictEqual(oneSignal.tier, 0);
  assert.strictEqual(oneSignal.label, "Débutant");

  const twoSignals = estimateLevel({ usedConcepts: [], tests: { count: 1 }, git: { commits: 50 }, size: { totalLoc: 100 } });
  assert.strictEqual(twoSignals.tier, 2);
  assert.strictEqual(twoSignals.label, "Intermédiaire");
});

test("gitState reports a real repo and a non-repo without throwing", () => {
  const repo = tmpDir();
  writeFile(repo, "a.txt", "x");
  spawnSync("git", ["init", "-b", "main"], { cwd: repo });
  spawnSync("git", ["add", "."], { cwd: repo });
  const commit = spawnSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", "commit", "-m", "init"], { cwd: repo });
  assert.strictEqual(commit.status, 0, commit.stderr && commit.stderr.toString());

  const state = gitState(repo);
  assert.strictEqual(state.isRepo, true);
  assert.strictEqual(state.commits, 1);
  assert.ok(state.branch, "expected a branch name");

  const plain = tmpDir();
  writeFile(plain, "a.txt", "x");
  const plainState = gitState(plain);
  assert.strictEqual(plainState.isRepo, false);
  assert.strictEqual(plainState.commits, null);
});

test("scanCommand fails on a missing directory, both direct and via CLI", () => {
  assert.throws(() => scanCommand({ dir: "/definitely/not/here" }), /No such directory/);

  const result = spawnSync(process.execPath, [BIN, "scan", "--dir", "/definitely/not/here"], { encoding: "utf8" });
  assert.strictEqual(result.status, 1);
  assert.match(result.stderr, /No such directory/);
});

test("walkSources skips noise dirs, dot-dirs and binary files without crashing", () => {
  const dir = tmpDir();
  makeCFixture(dir);
  writeFile(dir, "node_modules/evil.c", 'void t(void) { pthread_create(0, 0, 0, 0); }\n');
  writeFile(dir, ".hidden/evil.c", 'int s(void) { return socket(0, 0, 0); }\n');
  fs.writeFileSync(path.join(dir, "src/blob.c"), Buffer.from([0, 1, 2, 0, 3, 4, 5])); // binary .c

  const walked = walkSources(dir);
  const rels = walked.files.map((f) => f.rel);
  assert.ok(!rels.some((rel) => rel.startsWith("node_modules/")), `node_modules leaked: ${rels}`);
  assert.ok(!rels.some((rel) => rel.startsWith(".hidden")), `.hidden leaked: ${rels}`);

  const binary = walked.files.find((f) => f.rel === "src/blob.c");
  assert.ok(binary && binary.binary, "expected the NUL-padded file to be flagged binary");

  const report = scanProject(dir);
  for (const concept of report.concepts.used) {
    for (const evidence of concept.evidence) {
      assert.ok(!evidence.file.startsWith("node_modules/"), `evidence from ${evidence.file}`);
      assert.ok(!evidence.file.startsWith(".hidden"), `evidence from ${evidence.file}`);
      assert.notStrictEqual(evidence.file, "src/blob.c");
    }
  }
});

test("a single fortuitous line is not enough to mark a concept used", () => {
  const dir = tmpDir();
  // One lone malloc( in a comment/one-off line — not real mastery.
  writeFile(dir, "src/index.c", "int main(void) {\n  // char *p = malloc(1); // TODO try this someday\n  return 0;\n}\n");

  const report = scanProject(dir);
  assert.ok(!report.concepts.used.some((c) => c.id === "c-memory"), "a single occurrence should not count as mastered");
});

test("js-hooks no longer fires on a bare next()/done() unrelated to Fastify hooks", () => {
  const dir = tmpDir();
  // A plain Express-style middleware / Node callback — next() alone, twice,
  // with no addHook/preHandler anywhere.
  writeFile(
    dir,
    "src/index.js",
    "function mw1(req, res, next) { next(); }\nfunction mw2(req, res, next) { next(); }\n",
  );

  const report = scanProject(dir);
  assert.ok(!report.concepts.used.some((c) => c.id === "js-hooks"), "bare next() must not count as a Fastify hook");
});

test("detectStack finds a package.json framework even when tsconfig.json wins the language", () => {
  const dir = tmpDir();
  writeFile(dir, "tsconfig.json", "{}");
  writeFile(dir, "package.json", JSON.stringify({ name: "demo", dependencies: { fastify: "^4.0.0" } }));
  writeFile(dir, "src/index.ts", "export {};\n");

  const report = scanProject(dir);
  assert.strictEqual(report.stack.language, "TypeScript");
  assert.ok(report.stack.frameworks.includes("Fastify"), `expected Fastify in ${report.stack.frameworks}`);
});

test("Fastify-specific directions are gated on the detected framework", () => {
  const dir = tmpDir();
  // Same route/handler shape as a Fastify app, but no package.json → no
  // framework detected. js-lifecycle/js-schema-first/js-plugins are Fastify
  // content and must not be suggested without evidence the project uses it.
  writeFile(
    dir,
    "src/index.js",
    'app.get("/health", async (req, res) => res.send({ ok: true }));\napp.post("/echo", async (req, res) => res.send(req.body));\n',
  );

  const report = scanProject(dir);
  const ids = report.suggestions.map((s) => s.id);
  assert.ok(!ids.includes("js-lifecycle"), `js-lifecycle should be gated without a detected Fastify framework: ${ids}`);
  assert.ok(!ids.includes("js-schema-first"), `js-schema-first should be gated: ${ids}`);
  assert.ok(!ids.includes("js-plugins"), `js-plugins should be gated: ${ids}`);
});

test("Fastify directions appear when the framework is detected, citing a URL when the local doc source is absent", () => {
  const dir = tmpDir();
  writeFile(dir, "package.json", JSON.stringify({ name: "demo", dependencies: { fastify: "^4.0.0" } }));
  writeFile(
    dir,
    "src/index.js",
    'const server = require("fastify")();\nserver.get("/health", async (req, reply) => reply.send({ ok: true }));\nserver.post("/echo", async (req, reply) => reply.send(req.body));\n',
  );

  const report = scanProject(dir);
  assert.ok(report.stack.frameworks.includes("Fastify"));

  const lifecycle = report.suggestions.find((s) => s.id === "js-lifecycle");
  assert.ok(lifecycle, `js-lifecycle should be suggested for a detected Fastify project: ${report.suggestions.map((s) => s.id)}`);
  // No docs/sources/fastify-docs on disk → falls back to the public URL, never
  // a citation that doesn't exist.
  assert.doesNotMatch(lifecycle.doc, /^docs\/sources/);
  assert.match(lifecycle.doc, /^https:\/\/fastify\.dev/);
});

test("Fastify directions cite the local vendored doc when it actually exists on disk", () => {
  const dir = tmpDir();
  writeFile(dir, "package.json", JSON.stringify({ name: "demo", dependencies: { fastify: "^4.0.0" } }));
  writeFile(dir, "docs/sources/fastify-docs/Reference/Lifecycle.md", "# Lifecycle\n");
  writeFile(
    dir,
    "src/index.js",
    'const server = require("fastify")();\nserver.get("/health", async (req, reply) => reply.send({ ok: true }));\nserver.post("/echo", async (req, reply) => reply.send(req.body));\n',
  );

  const report = scanProject(dir);
  const lifecycle = report.suggestions.find((s) => s.id === "js-lifecycle");
  assert.ok(lifecycle);
  assert.match(lifecycle.doc, /^docs\/sources\/fastify-docs/);
});

test("an unknown-language project yields no concepts and generic directions", () => {
  const dir = tmpDir();
  writeFile(dir, "README.md", "# notes\n");

  const report = scanProject(dir);
  assert.strictEqual(report.stack.language, null);
  assert.strictEqual(report.concepts.used.length, 0);
  assert.ok(report.suggestions.length > 0);
  assert.ok(report.suggestions.every((s) => s.id.startsWith("g-")));
});

test("scanCommand prints the report and writes scan.json", () => {
  const dir = tmpDir();
  makeCFixture(dir);

  const out = capture(() => scanCommand({ dir }));

  assert.match(out, /Où tu en es/);
  assert.match(out, /Concepts déjà mobilisés/);
  assert.match(out, /Niveau estimé/);
  assert.match(out, /Suite proposée/);
  assert.match(out, /ai-learn init --phases/);

  const report = JSON.parse(fs.readFileSync(path.join(dir, ".ai-learn", "scan.json"), "utf8"));
  assert.strictEqual(report.schemaVersion, 1);
  assert.ok(Array.isArray(report.suggestions));
  assert.strictEqual(report.stack.language, "C");
});
