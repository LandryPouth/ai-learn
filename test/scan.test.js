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
const { writeFile, capture, spawnGit } = require("./helpers");
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
  evaluateMandatoryAt,
  resolveDirectionDoc,
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
          out[path.relative(root, abs).replace(/\\/g, "/")] = fs.readFileSync(abs);
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

  const twoSignals = estimateLevel({ usedConcepts: [], tests: { count: 1 }, git: { commits: 50 }, size: { totalLoc: 2000 } });
  assert.strictEqual(twoSignals.tier, 2);
  assert.strictEqual(twoSignals.label, "Intermédiaire");
});

test("estimateLevel: tests + git alone never bump the level, however high git climbs — taille is required", () => {
  // tests>=1 and git.commits>=50 co-occur trivially once a repo has existed
  // for a while (a lone empty test file, an AI-assisted workflow's naturally
  // high commit count) — neither proves any real understanding. Without a
  // real LOC signal, this pair must not bump the level, no matter how high
  // the commit count climbs.
  const testsAndGitOnly = estimateLevel({ usedConcepts: [], tests: { count: 1 }, git: { commits: 5000 }, size: { totalLoc: 100 } });
  assert.strictEqual(testsAndGitOnly.tier, 0);
  assert.strictEqual(testsAndGitOnly.label, "Débutant");

  const tailleWithGit = estimateLevel({ usedConcepts: [], tests: { count: 0 }, git: { commits: 50 }, size: { totalLoc: 2000 } });
  assert.strictEqual(tailleWithGit.tier, 2);

  const tailleWithTests = estimateLevel({ usedConcepts: [], tests: { count: 1 }, git: { commits: 0 }, size: { totalLoc: 2000 } });
  assert.strictEqual(tailleWithTests.tier, 2);
});

test("gitState reports a real repo and a non-repo without throwing", () => {
  const repo = tmpDir();
  writeFile(repo, "a.txt", "x");
  spawnGit(["init", "-b", "main"], { cwd: repo });
  spawnGit(["add", "."], { cwd: repo });
  const commit = spawnGit(["-c", "user.name=t", "-c", "user.email=t@t", "commit", "-m", "init"], { cwd: repo });
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

test("walkSources attaches an exact per-file loc, 0 for binaries, summing to totalLoc", () => {
  const dir = tmpDir();
  writeFile(dir, "a.txt", "one\ntwo\nthree\n"); // 3 newlines → 3 lines
  writeFile(dir, "b.txt", "single line, no trailing newline");
  fs.writeFileSync(path.join(dir, "bin.dat"), Buffer.from([0, 1, 2, 0]));

  const walked = walkSources(dir);
  const byRel = Object.fromEntries(walked.files.map((f) => [f.rel, f]));

  assert.strictEqual(byRel["a.txt"].loc, 3);
  assert.strictEqual(byRel["b.txt"].loc, 0); // no newline char → 0, matching countLines' own contract
  assert.strictEqual(byRel["bin.dat"].loc, 0);
  assert.strictEqual(walked.totalLoc, walked.files.reduce((sum, f) => sum + f.loc, 0));
});

test("a single fortuitous line is not enough to mark a concept used", () => {
  const dir = tmpDir();
  // One lone malloc( in a comment/one-off line — not real mastery.
  writeFile(dir, "src/index.c", "int main(void) {\n  // char *p = malloc(1); // TODO try this someday\n  return 0;\n}\n");

  const report = scanProject(dir);
  assert.ok(!report.concepts.used.some((c) => c.id === "c-memory"), "a single occurrence should not count as mastered");
});

test("two identical calls pasted from a tutorial (same underlying function, different args) are not enough — real code adjacency (socket/bind/listen) still is", () => {
  const dir = tmpDir();
  // Two malloc() calls with different arguments, exactly the shape of a
  // pasted memory-management example — same literal call, only the argument
  // differs (the regex doesn't capture arguments, so both match the
  // identical substring "malloc(").
  writeFile(dir, "src/index.c", "int main(void) {\n  char *a = malloc(64);\n  char *b = malloc(128);\n  return 0;\n}\n");

  const report = scanProject(dir);
  assert.ok(
    !report.concepts.used.some((c) => c.id === "c-memory"),
    "two occurrences of the identical call must not count as mastery on their own",
  );
});

test("js-hooks has no diversity defense once collapsed to a single marker — two .use() calls count, even from one paste", () => {
  const dir = tmpDir();
  // js-hooks matches only `.use(` (see stacks/javascript.js) — there is no
  // second distinct operation to require diversity against, so it is not in
  // DIVERSE_EVIDENCE_CONCEPTS and falls back to plain count>=2, same accepted
  // limitation as js-async/js-modules.
  writeFile(dir, "src/index.js", "app.use(logger);\napp.use(cors());\n");

  const report = scanProject(dir);
  assert.ok(report.concepts.used.some((c) => c.id === "js-hooks"), "two .use() calls should count as middleware usage");
});

test("js-hooks does not fire on process.on()/EventEmitter listeners — unrelated to middleware registration", () => {
  const dir = tmpDir();
  // .on( used to be grouped into this concept's marker, letting an ordinary
  // shutdown handler or stream listener count as "middleware mastered" with
  // zero real understanding of middleware. It no longer matches at all.
  writeFile(
    dir,
    "src/index.js",
    'process.on("SIGTERM", () => process.exit(0));\nprocess.on("SIGINT", () => process.exit(0));\n',
  );

  const report = scanProject(dir);
  assert.ok(!report.concepts.used.some((c) => c.id === "js-hooks"), "process.on() must not count as middleware usage");
});

test("js-hooks does not fire on a bare next()/done() unrelated to middleware registration", () => {
  const dir = tmpDir();
  // A plain callback — next() alone, twice, with no .use() anywhere.
  writeFile(
    dir,
    "src/index.js",
    "function mw1(req, res, next) { next(); }\nfunction mw2(req, res, next) { next(); }\n",
  );

  const report = scanProject(dir);
  assert.ok(!report.concepts.used.some((c) => c.id === "js-hooks"), "bare next() must not count as middleware usage");
});

test("detectStack finds a package.json framework even when tsconfig.json wins the language", () => {
  const dir = tmpDir();
  writeFile(dir, "tsconfig.json", "{}");
  writeFile(dir, "package.json", JSON.stringify({ name: "demo", dependencies: { express: "^4.0.0" } }));
  writeFile(dir, "src/index.ts", "export {};\n");

  const report = scanProject(dir);
  assert.strictEqual(report.stack.language, "TypeScript");
  assert.ok(report.stack.frameworks.includes("Express"), `expected Express in ${report.stack.frameworks}`);
});

test("resolveDirectionDoc falls back to docUrl when the local vendored doc is absent, cites it when present", () => {
  // Generic mechanism test, independent of any stack pack's content: any
  // direction citing a docs/sources/<name> path that doesn't exist on this
  // project's disk must fall back to a public, always-resolvable docUrl —
  // never a citation to a file that was never vendored.
  const missing = resolveDirectionDoc({ doc: "docs/sources/some-docs — Reference", docUrl: "https://example.com/docs" }, tmpDir());
  assert.strictEqual(missing, "https://example.com/docs");

  const dir = tmpDir();
  writeFile(dir, "docs/sources/some-docs/Reference.md", "# Reference\n");
  const present = resolveDirectionDoc({ doc: "docs/sources/some-docs — Reference", docUrl: "https://example.com/docs" }, dir);
  assert.strictEqual(present, "docs/sources/some-docs — Reference");

  // No docUrl fallback declared → the (unresolvable) local citation is kept
  // as-is rather than silently dropped.
  const noFallback = resolveDirectionDoc({ doc: "docs/sources/some-docs — Reference" }, tmpDir());
  assert.strictEqual(noFallback, "docs/sources/some-docs — Reference");
});

test("an unknown-language project yields no concepts and generic directions", () => {
  const dir = tmpDir();
  writeFile(dir, "README.md", "# notes\n");

  const report = scanProject(dir);
  assert.strictEqual(report.stack.language, null);
  assert.strictEqual(report.concepts.used.length, 0);
  assert.ok(report.suggestions.length > 0);
  assert.ok(report.suggestions.every((s) => s.id.startsWith("g-")));
  // The generic "10x" stress bank is the fallback for any untracked
  // language — same "g-" namespace as the generic directions.
  assert.ok(report.stresses.length > 0);
  assert.ok(report.stresses.every((s) => s.id.startsWith("g-")));
});

test("stresses are strictly deeper than the deepest used concept, never mastered (C)", () => {
  const dir = tmpDir();
  // Just malloc/free — no threads/sockets/signals, so maxUsedTier stays at 2
  // and the tier-3 c-malloc-stress is exactly "next tier up".
  writeFile(dir, "src/main.c", "void *p = malloc(10);\nfree(p);\n");

  const report = scanProject(dir);
  const usedIds = new Set(report.concepts.used.map((c) => c.id));
  const maxUsedTier = Math.max(0, ...report.concepts.used.map((c) => c.tier));

  const stress = report.stresses.find((s) => s.id === "c-malloc-stress");
  assert.ok(stress, `c-malloc-stress should be suggested: ${report.stresses.map((s) => s.id)}`);
  assert.ok(stress.tier > maxUsedTier);
  assert.ok(!usedIds.has(stress.deepens));
  assert.ok(stress.stressCheckpoint, "a stress must carry a real, executable stressCheckpoint");
});

test("stresses require their anchor: js-load-concurrency needs js-routes", () => {
  const dir = tmpDir();
  writeFile(
    dir,
    "src/index.js",
    'const app = require("express")();\napp.get("/items", async (req, res) => { res.json([]); });\napp.listen(3000);\n',
  );

  const report = scanProject(dir);
  const ids = report.stresses.map((s) => s.id);
  assert.ok(ids.includes("js-load-concurrency"), `js-load-concurrency missing in ${ids}`);

  // Without any route detected, the same stress must not appear.
  const noRoutesDir = tmpDir();
  writeFile(noRoutesDir, "src/index.js", "async function f() { await Promise.resolve(1); }\nf();\n");
  const noRoutesReport = scanProject(noRoutesDir);
  assert.ok(!noRoutesReport.stresses.map((s) => s.id).includes("js-load-concurrency"));
});

test("stresses already mastered (past their tier) never regress back into suggestions", () => {
  const dir = tmpDir();
  makeCFixture(dir); // threads/sockets/signals → maxUsedTier 4, above c-malloc-stress's tier 3

  const report = scanProject(dir);
  assert.ok(
    !report.stresses.map((s) => s.id).includes("c-malloc-stress"),
    "a tier-3 stress must not resurface once the project is already past tier 3",
  );
});

test("the report renders a distinct 'Stress réels proposés' section with the real stressCheckpoint", () => {
  const dir = tmpDir();
  writeFile(dir, "src/main.c", "void *p = malloc(10);\nfree(p);\n");

  const out = capture(() => scanCommand({ dir }));
  assert.match(out, /Stress réels proposés/);
  assert.match(out, /Casse\s+: valgrind --leak-check=full/);
});

test("evaluateMandatoryAt: locInFile checks per-file loc against gt, false without a mandatoryAt or walked", () => {
  const walked = { files: [{ loc: 100 }, { loc: 400 }] };
  assert.strictEqual(evaluateMandatoryAt({ metric: "locInFile", gt: 300 }, { walked }), true);
  assert.strictEqual(evaluateMandatoryAt({ metric: "locInFile", gt: 500 }, { walked }), false);
  assert.strictEqual(evaluateMandatoryAt(null, { walked }), false);
  assert.strictEqual(evaluateMandatoryAt({ metric: "locInFile", gt: 1 }, { walked: null }), false);
});

test("a file crossing the mandatoryAt threshold promotes g-arch to mandatory:true, sorted first", () => {
  const dir = tmpDir();
  writeFile(dir, "README.md", "# notes\n");
  writeFile(dir, "big.txt", "x\n".repeat(301));

  const report = scanProject(dir);
  const arch = report.suggestions.find((s) => s.id === "g-arch");
  assert.ok(arch, "g-arch should be suggested");
  assert.strictEqual(arch.mandatory, true);
  assert.strictEqual(report.suggestions[0].id, "g-arch", "mandatory entries must sort first");
});

test("below the threshold, g-arch is suggested but never mandatory", () => {
  const dir = tmpDir();
  writeFile(dir, "README.md", "# notes\n");
  writeFile(dir, "small.txt", "x\n".repeat(10));

  const report = scanProject(dir);
  const arch = report.suggestions.find((s) => s.id === "g-arch");
  assert.ok(arch);
  assert.strictEqual(arch.mandatory, false);
});

test("the report renders a mandatory direction distinctly (⚠ OBLIGATOIRE)", () => {
  const dir = tmpDir();
  writeFile(dir, "README.md", "# notes\n");
  writeFile(dir, "big.txt", "x\n".repeat(301));

  const out = capture(() => scanCommand({ dir }));
  assert.match(out, /⚠ OBLIGATOIRE — Architecture & modularité/);
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
