"use strict";

const { test, beforeEach } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");

const {
  mutateCommand,
  findAllSites,
  applyMutant,
  restoreOriginal,
  testMutant,
  formatSiteResult,
  formatScore,
  invertBoolean,
  invertComparison,
  mutateConfigPath,
  mutateLockPath,
  recoverOrphanLock,
  mutationReport,
  formatMutationGap,
  emptyMutationReport,
} = require("../bin/lib/mutate");
const { capture, sampleProgress, tmpProject, writeFile } = require("./helpers");

beforeEach(() => {
  process.exitCode = 0;
});

// A checkpoint that never inspects the return value of the mutated function —
// it stays green whether the boolean literal is `true` or `false`, so the
// mutant always survives.
const WEAK_CHECKPOINT = 'node -e "require(\'./src/index.js\')"';

// A checkpoint that fails when the mutated literal flips — the mutant is
// killed.
const STRONG_CHECKPOINT = "node -e \"const { isReady } = require('./src/index.js'); if (isReady() !== true) process.exit(1)\"";

function projectWithBooleanLiteral(checkpoint) {
  const dir = tmpProject(
    sampleProgress({
      phases: [{ id: 0, name: "Phase zero", status: "pending", checkpoint, artifacts: [], predictionsRequired: 0 }],
    }),
  );
  writeFile(dir, "src/index.js", "function isReady() {\n  return true;\n}\n\nmodule.exports = { isReady };\n");
  return dir;
}

// ---------------------------------------------------------------------------
// Detection — boolean-literal operator (portée depuis 02-01, réexercée via
// findAllSites plutôt que le findFirstSite disparu).
// ---------------------------------------------------------------------------

test("detection: finds a boolean literal outside string/comment, with its line", () => {
  const dir = projectWithBooleanLiteral(WEAK_CHECKPOINT);
  const sites = findAllSites(dir);
  const site = sites.find((s) => s.operator === "boolean-literal");

  assert.ok(site);
  assert.strictEqual(site.line, 2);
  assert.strictEqual(site.matchedText, "true");
});

test("detection: a literal inside a string is never chosen", () => {
  const dir = tmpProject(sampleProgress());
  writeFile(dir, "src/index.js", "const label = \"true\";\nmodule.exports = { label };\n");

  assert.deepStrictEqual(findAllSites(dir), []);
});

test("detection: a literal inside a comment is never chosen", () => {
  const dir = tmpProject(sampleProgress());
  writeFile(dir, "src/index.js", "// false by default\nmodule.exports = {};\n");

  assert.deepStrictEqual(findAllSites(dir), []);
});

test("detection: truely/falsey never match (word boundaries)", () => {
  const dir = tmpProject(sampleProgress());
  writeFile(dir, "src/index.js", "const truely = 1;\nconst falsey = 2;\nmodule.exports = { truely, falsey };\n");

  assert.deepStrictEqual(findAllSites(dir), []);
});

test("detection: no mutable site at all reports an empty list", () => {
  const dir = tmpProject(sampleProgress());
  writeFile(dir, "src/index.js", "module.exports = { add: (a, b) => a + b };\n");

  assert.deepStrictEqual(findAllSites(dir), []);
});

test("detection: a boolean literal in a non-source file (prose, config) is never chosen", () => {
  const dir = tmpProject(sampleProgress());
  writeFile(dir, "src/notes.md", "# Notes\n\nThis function returns true when data is ready.\n");
  writeFile(dir, "src/config.json", JSON.stringify({ debug: true }));

  assert.deepStrictEqual(findAllSites(dir), []);
});

test("detection: a boolean literal in the learner's own test file is never chosen", () => {
  const dir = tmpProject(sampleProgress());
  writeFile(dir, ".ai-learn/guard.json", JSON.stringify({ version: 1, learnerFiles: ["**/*.js"] }));
  writeFile(dir, "src/index.test.js", "test('is ready', () => { assert.strictEqual(true, true); });\n");
  writeFile(dir, "src/index.js", "module.exports = { ok: false };\n");

  const sites = findAllSites(dir);
  assert.strictEqual(sites.length, 1);
  assert.strictEqual(sites[0].file.rel, "src/index.js");
});

test("detection: respects a custom learnerFiles scope", () => {
  const dir = tmpProject(sampleProgress());
  writeFile(dir, ".ai-learn/guard.json", JSON.stringify({ version: 1, learnerFiles: ["lib/**"] }));
  writeFile(dir, "src/index.js", "module.exports = { ok: true };\n");
  writeFile(dir, "lib/index.js", "module.exports = { ok: false };\n");

  const sites = findAllSites(dir);
  assert.strictEqual(sites.length, 1);
  assert.strictEqual(sites[0].file.rel, "lib/index.js");
});

test("findAllSites excludes non-source and test files even when other files in scope have valid sites", () => {
  const dir = tmpProject(sampleProgress());
  writeFile(dir, ".ai-learn/guard.json", JSON.stringify({ version: 1, learnerFiles: ["**/*.js", "**/*.md", "**/*.json"] }));
  writeFile(dir, "src/notes.md", "This function returns true when ready and checks a < b.\n");
  writeFile(dir, "src/config.json", JSON.stringify({ debug: true }));
  writeFile(dir, "src/index.test.js", "test('lt', () => { assert.ok(1 < 2); });\n");
  writeFile(dir, "src/index.js", "function isReady() {\n  return true;\n}\nfunction inRange(x) {\n  return x < 10;\n}\nmodule.exports = { isReady, inRange };\n");

  const sites = findAllSites(dir);
  assert.ok(sites.length > 0);
  assert.ok(sites.every((s) => s.file.rel === "src/index.js"));
});

// ---------------------------------------------------------------------------
// Detection — comparison-operator (boundary mutation, story 02.02).
// ---------------------------------------------------------------------------

test("invertComparison mutates by boundary in both directions", () => {
  assert.strictEqual(invertComparison("<"), "<=");
  assert.strictEqual(invertComparison("<="), "<");
  assert.strictEqual(invertComparison(">"), ">=");
  assert.strictEqual(invertComparison(">="), ">");
});

test("detection: mutates a comparison operator by boundary, at the correct position", () => {
  const dir = tmpProject(sampleProgress());
  writeFile(dir, "src/index.js", "function inRange(x) {\n  return x < 10;\n}\nmodule.exports = { inRange };\n");

  const sites = findAllSites(dir);
  const site = sites.find((s) => s.operator === "comparison-operator");

  assert.ok(site);
  assert.strictEqual(site.matchedText, "<");
  assert.strictEqual(site.mutate(site.matchedText), "<=");
});

test("detection: a compound operator (>=) inverts to its boundary pair, and an arrow function's => is never a comparison site", () => {
  const dir = tmpProject(sampleProgress());
  writeFile(
    dir,
    "src/index.js",
    "const double = (x) => x * 2;\nfunction atLeast(x) {\n  return x >= 10;\n}\nmodule.exports = { double, atLeast };\n",
  );

  const sites = findAllSites(dir).filter((s) => s.operator === "comparison-operator");
  assert.strictEqual(sites.length, 1);
  assert.strictEqual(sites[0].matchedText, ">=");
  assert.strictEqual(sites[0].mutate(sites[0].matchedText), ">");
});

test("detection: C's pointer/struct access (->) is never confused with a comparison site", () => {
  const dir = tmpProject(sampleProgress());
  writeFile(dir, ".ai-learn/guard.json", JSON.stringify({ version: 1, learnerFiles: ["**/*.c", "**/*.h"] }));
  writeFile(
    dir,
    "src/main.c",
    "struct node { int value; struct node *next; };\nint peek(struct node *ptr) {\n  return ptr->value;\n}\n",
  );

  const sites = findAllSites(dir).filter((s) => s.operator === "comparison-operator");
  assert.deepStrictEqual(sites, []);
});

test("detection: a real comparison in a .c file is still found alongside a -> on the same line", () => {
  const dir = tmpProject(sampleProgress());
  writeFile(dir, ".ai-learn/guard.json", JSON.stringify({ version: 1, learnerFiles: ["**/*.c", "**/*.h"] }));
  writeFile(
    dir,
    "src/main.c",
    "struct node { int value; struct node *next; };\nint inRange(struct node *ptr) {\n  return ptr->value < 10;\n}\n",
  );

  const sites = findAllSites(dir).filter((s) => s.operator === "comparison-operator");
  assert.strictEqual(sites.length, 1);
  assert.strictEqual(sites[0].matchedText, "<");
});

test("detection: JSX/TSX tag brackets are never treated as comparison sites, even though boolean-literal still applies", () => {
  const dir = tmpProject(sampleProgress());
  writeFile(dir, ".ai-learn/guard.json", JSON.stringify({ version: 1, learnerFiles: ["**/*.jsx", "**/*.tsx"] }));
  writeFile(
    dir,
    "src/App.jsx",
    "function App() {\n  const ready = true;\n  return <div className=\"x\">hi</div>;\n}\nexport default App;\n",
  );

  const sites = findAllSites(dir);
  assert.strictEqual(sites.length, 1);
  assert.strictEqual(sites[0].operator, "boolean-literal");
});

test("detection: TypeScript generic angle brackets are a known, accepted residual false-positive (documented in plan.md)", () => {
  const dir = tmpProject(sampleProgress());
  writeFile(dir, ".ai-learn/guard.json", JSON.stringify({ version: 1, learnerFiles: ["**/*.ts"] }));
  writeFile(dir, "src/index.ts", "function identity<T>(x: T): T {\n  return x;\n}\nexport { identity };\n");

  const sites = findAllSites(dir).filter((s) => s.operator === "comparison-operator");
  // Pinned, not desired: `<T>`/`>` are misdetected as comparison sites on
  // plain .ts (non-JSX) files — closing this fully needs real parsing, out
  // of scope for this zero-dependency regex engine. JSX files are excluded
  // outright (see test above); this narrower case is an accepted residual
  // risk, not a regression.
  assert.strictEqual(sites.length, 2);
});

// ---------------------------------------------------------------------------
// Apply / restore / testMutant (shared engine, unchanged since 02-01).
// ---------------------------------------------------------------------------

test("apply + restore leaves the file byte-identical to its original", () => {
  const dir = projectWithBooleanLiteral(WEAK_CHECKPOINT);
  const site = findAllSites(dir)[0];
  const before = fs.readFileSync(site.file.abs);

  applyMutant(site);
  assert.notDeepStrictEqual(fs.readFileSync(site.file.abs), before);

  restoreOriginal(site);
  assert.deepStrictEqual(fs.readFileSync(site.file.abs), before);
});

test("testMutant restores the file even when the executor throws", () => {
  const dir = projectWithBooleanLiteral(WEAK_CHECKPOINT);
  const site = findAllSites(dir)[0];
  const before = fs.readFileSync(site.file.abs);
  const phase = { checkpoint: "node -e \"process.exit(0)\"" };

  assert.throws(() => {
    testMutant(site, phase, dir, {
      execute: () => {
        throw new Error("boom");
      },
    });
  }, /boom/);

  assert.deepStrictEqual(fs.readFileSync(site.file.abs), before);
});

test("testMutant removes the recovery lock after a successful restore", () => {
  const dir = projectWithBooleanLiteral(WEAK_CHECKPOINT);
  const site = findAllSites(dir)[0];
  const phase = { checkpoint: WEAK_CHECKPOINT };

  testMutant(site, phase, dir);

  assert.strictEqual(fs.existsSync(mutateLockPath(dir)), false);
});

test("formatSiteResult matches the file:line — operator — verdict format", () => {
  const site = { file: { rel: "src/index.js" }, line: 2, operator: "boolean-literal" };
  assert.strictEqual(formatSiteResult(site, "SURVÉCU"), "src/index.js:2 — boolean-literal — SURVÉCU");
});

// ---------------------------------------------------------------------------
// Multiple sites in the same file: sequential, restored between each.
// ---------------------------------------------------------------------------

test("multiple sites in the same file: each is restored to the pristine original before the next runs", () => {
  const dir = tmpProject(sampleProgress());
  writeFile(
    dir,
    "src/index.js",
    "function isReady() {\n  return true;\n}\nfunction inRange(x) {\n  return x < 10;\n}\nmodule.exports = { isReady, inRange };\n",
  );

  const sites = findAllSites(dir);
  assert.strictEqual(sites.length, 2);

  const original = fs.readFileSync(sites[0].file.abs);
  const phase = { checkpoint: 'node -e "process.exit(0)"' };

  for (const site of sites) {
    testMutant(site, phase, dir);
    assert.deepStrictEqual(fs.readFileSync(site.file.abs), original, `${site.operator} was not restored before the next site`);
  }
});

// ---------------------------------------------------------------------------
// Score formatting.
// ---------------------------------------------------------------------------

test("formatScore rounds killed/total to the nearest percent", () => {
  assert.strictEqual(formatScore(3, 4), "75%");
  assert.strictEqual(formatScore(2, 3), "67%");
});

test("formatScore reports a dedicated message for zero sites, never a percentage", () => {
  assert.strictEqual(formatScore(0, 0), "aucun site mutable — rien à mesurer");
});

// ---------------------------------------------------------------------------
// mutateCommand — end to end.
// ---------------------------------------------------------------------------

test("mutate reports SURVÉCU and exits 1 when the checkpoint does not detect the mutant", () => {
  const dir = projectWithBooleanLiteral(WEAK_CHECKPOINT);
  const out = capture(() => mutateCommand({ dir, phaseId: 0 }));

  assert.match(out, /SURVÉCU/);
  assert.strictEqual(process.exitCode, 1);
  // The file must be restored after the command completes.
  const content = fs.readFileSync(path.join(dir, "src/index.js"), "utf8");
  assert.match(content, /return true;/);
});

test("mutate reports TUÉ and exits 0 when the checkpoint detects the mutant", () => {
  const dir = projectWithBooleanLiteral(STRONG_CHECKPOINT);
  const out = capture(() => mutateCommand({ dir, phaseId: 0 }));

  assert.match(out, /TUÉ/);
  assert.strictEqual(process.exitCode, 0);
  const content = fs.readFileSync(path.join(dir, "src/index.js"), "utf8");
  assert.match(content, /return true;/);
});

test("mutate reports no mutable site as a success, not an error", () => {
  const dir = tmpProject(
    sampleProgress({
      phases: [
        {
          id: 0,
          name: "Phase zero",
          status: "pending",
          checkpoint: 'node -e "process.exit(0)"',
          artifacts: [],
          predictionsRequired: 0,
        },
      ],
    }),
  );
  writeFile(dir, "src/index.js", "module.exports = { add: (a, b) => a + b };\n");

  const out = capture(() => mutateCommand({ dir, phaseId: 0 }));

  assert.match(out, /Aucun mutant à tester/);
  assert.strictEqual(process.exitCode, 0);
});

test("a stack with no dedicated operator bank (generic.js fallback) on a file with no boolean literal reports success, exit 0", () => {
  // No manifest and no .js file at all: the dominant extension is .py, so
  // detectStack resolves "Python" — a language with no stacks/python.js —
  // and mutate falls back to generic.js's bank (boolean-literal only).
  const dir = tmpProject(
    sampleProgress({
      phases: [{ id: 0, name: "Phase zero", status: "pending", checkpoint: 'node -e "process.exit(0)"', artifacts: [], predictionsRequired: 0 }],
    }),
  );
  writeFile(dir, ".ai-learn/guard.json", JSON.stringify({ version: 1, learnerFiles: ["**/*.py"] }));
  writeFile(dir, "src/add.py", "def add(a, b):\n    return a + b\n");

  assert.deepStrictEqual(findAllSites(dir), []);

  const out = capture(() => mutateCommand({ dir, phaseId: 0 }));

  assert.match(out, /Aucun mutant à tester/);
  assert.strictEqual(process.exitCode, 0);
});

test("mutate reports success, exit 0 when .ai-learn/mutate.json explicitly configures zero operators", () => {
  // A file with a real boolean-literal site, but the project's own config
  // overrides the stack's mutator bank down to an empty list — "no operator
  // configured" (spec.md), distinct from "no site found" above, but the same
  // explicit-success code path (findAllSites returns [] either way).
  const dir = projectWithBooleanLiteral(WEAK_CHECKPOINT);
  fs.mkdirSync(path.join(dir, ".ai-learn"), { recursive: true });
  fs.writeFileSync(mutateConfigPath(dir), JSON.stringify({ version: 1, mutators: [], maxMutantsPerRun: 50, ignore: [] }));

  assert.deepStrictEqual(findAllSites(dir), []);

  const out = capture(() => mutateCommand({ dir, phaseId: 0 }));

  assert.match(out, /Aucun mutant à tester/);
  assert.strictEqual(process.exitCode, 0);
});

test("mutate fails clearly when the checkpoint is already red before any mutation", () => {
  const dir = projectWithBooleanLiteral('node -e "process.exit(1)"');
  const out = capture(() => mutateCommand({ dir, phaseId: 0 }));

  assert.match(out, /déjà rouge/);
  assert.strictEqual(process.exitCode, 1);
  // No mutation should have been attempted: the file is untouched.
  const content = fs.readFileSync(path.join(dir, "src/index.js"), "utf8");
  assert.match(content, /return true;/);
});

test("mutate fails with verify's own message when the phase has no checkpoint", () => {
  const dir = tmpProject(
    sampleProgress({
      phases: [{ id: 0, name: "Phase zero", status: "pending", checkpoint: null, artifacts: [], predictionsRequired: 0 }],
    }),
  );

  assert.throws(() => mutateCommand({ dir, phaseId: 0 }), /has no checkpoint command/);
});

test("mutate fails when the phase id does not exist", () => {
  const dir = tmpProject(sampleProgress());
  assert.throws(() => mutateCommand({ dir, phaseId: 99 }), /No phase 99 in progress\.json/);
});

test("mutate mutes every site found (1 boolean, 2 comparisons): 2 killed / 1 survived, 3 report lines, 67% score, exit 1", () => {
  const checkpoint =
    "node -e \"" +
    "const { isReady, inRange } = require('./src/index.js');" +
    "if (isReady() !== true) process.exit(1);" +
    "if (inRange(10) !== false) process.exit(1);" +
    "\"";

  const dir = tmpProject(
    sampleProgress({
      phases: [{ id: 0, name: "Phase zero", status: "pending", checkpoint, artifacts: [], predictionsRequired: 0 }],
    }),
  );
  writeFile(
    dir,
    "src/index.js",
    [
      "function isReady() {",
      "  return true;",
      "}",
      "function inRange(x) {",
      "  return x < 10;",
      "}",
      "function inRange2(x) {",
      "  return x < 20;",
      "}",
      "module.exports = { isReady, inRange, inRange2 };",
      "",
    ].join("\n"),
  );

  const out = capture(() => mutateCommand({ dir, phaseId: 0 }));

  const lines = out.split("\n").filter((l) => /^\S+:\d+ — (?:boolean-literal|comparison-operator) — (?:TUÉ|SURVÉCU)$/.test(l));
  assert.strictEqual(lines.length, 3);
  assert.match(out, /Score de mutation : 67%/);
  assert.strictEqual(process.exitCode, 1);

  // isReady and inRange are exercised at their boundary by the checkpoint —
  // both mutants are killed. inRange2 is never called by the checkpoint, so
  // its mutant survives.
  const killedCount = (out.match(/— TUÉ/g) || []).length;
  const survivedCount = (out.match(/— SURVÉCU/g) || []).length;
  assert.strictEqual(killedCount, 2);
  assert.strictEqual(survivedCount, 1);
});

test("mutate respects maxMutantsPerRun and signals the truncation", () => {
  const dir = tmpProject(
    sampleProgress({
      phases: [{ id: 0, name: "Phase zero", status: "pending", checkpoint: 'node -e "process.exit(0)"', artifacts: [], predictionsRequired: 0 }],
    }),
  );
  writeFile(
    dir,
    "src/index.js",
    "function isReady() {\n  return true;\n}\nfunction inRange(x) {\n  return x < 10;\n}\nmodule.exports = { isReady, inRange };\n",
  );
  fs.mkdirSync(path.join(dir, ".ai-learn"), { recursive: true });
  fs.writeFileSync(
    mutateConfigPath(dir),
    JSON.stringify({ version: 1, mutators: ["boolean-literal", "comparison-operator"], maxMutantsPerRun: 1, ignore: [] }),
  );

  const out = capture(() => mutateCommand({ dir, phaseId: 0 }));

  assert.match(out, /Plafond de 1 mutant/);
  const lines = out.split("\n").filter((l) => /^\S+:\d+ — (?:boolean-literal|comparison-operator) — (?:TUÉ|SURVÉCU)$/.test(l));
  assert.strictEqual(lines.length, 1);
});

// ---------------------------------------------------------------------------
// Orphan lock recovery.
// ---------------------------------------------------------------------------

test("recoverOrphanLock restores the original content and removes the lock", () => {
  const dir = tmpProject(sampleProgress());
  const target = writeFile(dir, "src/index.js", "MUTATED CONTENT");

  fs.mkdirSync(path.join(dir, ".ai-learn"), { recursive: true });
  fs.writeFileSync(mutateLockPath(dir), JSON.stringify({ file: "src/index.js", original: "ORIGINAL CONTENT" }));

  const recovered = recoverOrphanLock(dir);

  assert.strictEqual(recovered, "src/index.js");
  assert.strictEqual(fs.readFileSync(target, "utf8"), "ORIGINAL CONTENT");
  assert.strictEqual(fs.existsSync(mutateLockPath(dir)), false);
});

test("recoverOrphanLock recreates the target file when it was deleted in the meantime", () => {
  const dir = tmpProject(sampleProgress());
  fs.mkdirSync(path.join(dir, ".ai-learn"), { recursive: true });
  fs.writeFileSync(mutateLockPath(dir), JSON.stringify({ file: "src/index.js", original: "ORIGINAL CONTENT" }));

  const recovered = recoverOrphanLock(dir);

  assert.strictEqual(recovered, "src/index.js");
  assert.strictEqual(fs.readFileSync(path.join(dir, "src/index.js"), "utf8"), "ORIGINAL CONTENT");
});

test("recoverOrphanLock is a no-op when no lock file is present", () => {
  const dir = tmpProject(sampleProgress());
  assert.strictEqual(recoverOrphanLock(dir), null);
});

test("mutate recovers an orphan lock at startup and reassures before continuing normally", () => {
  const dir = projectWithBooleanLiteral(STRONG_CHECKPOINT);
  const originalContent = fs.readFileSync(path.join(dir, "src/index.js"), "utf8");

  // Simulate a crash mid-mutation: the file is left mutated, the lock is
  // still on disk pointing at the pristine content.
  fs.writeFileSync(path.join(dir, "src/index.js"), originalContent.replace("true", "false"));
  fs.mkdirSync(path.join(dir, ".ai-learn"), { recursive: true });
  fs.writeFileSync(mutateLockPath(dir), JSON.stringify({ file: "src/index.js", original: originalContent }));

  const out = capture(() => mutateCommand({ dir, phaseId: 0 }));

  assert.match(out, /run précédent a été interrompu/);
  assert.strictEqual(fs.existsSync(mutateLockPath(dir)), false);
  // The run continues normally afterward: the strong checkpoint kills the
  // boolean mutant it (re-)applies.
  assert.match(out, /TUÉ/);
  assert.strictEqual(process.exitCode, 0);
  const finalContent = fs.readFileSync(path.join(dir, "src/index.js"), "utf8");
  assert.strictEqual(finalContent, originalContent);
});

// ---------------------------------------------------------------------------
// mutationReport / formatMutationGap / emptyMutationReport — the pure fact
// object `verify.js` consumes (story 02.03), mirroring
// predictions.js#predictionsReport's split of calcul-pur vs formatage.
// ---------------------------------------------------------------------------

test("mutationReport: a phase without mutation short-circuits without running the mutation engine", () => {
  const dir = projectWithBooleanLiteral(WEAK_CHECKPOINT);
  const report = mutationReport({ dir, phase: { id: 0, checkpoint: WEAK_CHECKPOINT } });

  assert.deepStrictEqual(report, { required: false, ok: true, mutants: 0, killed: 0, survived: [], score: null, truncated: false });
  // The engine never ran: the file is untouched (never mutated then restored).
  const content = fs.readFileSync(path.join(dir, "src/index.js"), "utf8");
  assert.match(content, /return true;/);
});

test("mutationReport: a non-boolean phase.mutation value is never treated as required (strict === true)", () => {
  const dir = projectWithBooleanLiteral(WEAK_CHECKPOINT);
  const report = mutationReport({ dir, phase: { id: 0, checkpoint: WEAK_CHECKPOINT, mutation: "true" } });

  assert.strictEqual(report.required, false);
});

test("mutationReport: every mutant killed → ok true, 100% score", () => {
  const dir = projectWithBooleanLiteral(STRONG_CHECKPOINT);
  const report = mutationReport({ dir, phase: { id: 0, checkpoint: STRONG_CHECKPOINT, mutation: true } });

  assert.strictEqual(report.required, true);
  assert.strictEqual(report.ok, true);
  assert.strictEqual(report.mutants, 1);
  assert.strictEqual(report.killed, 1);
  assert.deepStrictEqual(report.survived, []);
  assert.strictEqual(report.score, 100);
  assert.strictEqual(report.truncated, false);
});

test("mutationReport: a survived mutant → ok false, survived lists the site", () => {
  const dir = projectWithBooleanLiteral(WEAK_CHECKPOINT);
  const report = mutationReport({ dir, phase: { id: 0, checkpoint: WEAK_CHECKPOINT, mutation: true } });

  assert.strictEqual(report.ok, false);
  assert.strictEqual(report.survived.length, 1);
  assert.strictEqual(report.survived[0].file, "src/index.js");
  assert.strictEqual(report.survived[0].operator, "boolean-literal");
});

test("mutationReport: no mutable site found → ok true, score null, never blocking", () => {
  const dir = tmpProject(sampleProgress());
  writeFile(dir, "src/index.js", "module.exports = { add: (a, b) => a + b };\n");

  const report = mutationReport({ dir, phase: { id: 0, checkpoint: 'node -e "process.exit(0)"', mutation: true } });

  assert.deepStrictEqual(report, { required: true, ok: true, mutants: 0, killed: 0, survived: [], score: null, truncated: false });
});

test("mutationReport: maxMutantsPerRun truncation with every tested mutant killed stays ok true", () => {
  const checkpoint =
    "node -e \"" +
    "const { isReady, inRange } = require('./src/index.js');" +
    "if (isReady() !== true) process.exit(1);" +
    "if (inRange(10) !== false) process.exit(1);" +
    "\"";
  const dir = tmpProject(
    sampleProgress({ phases: [{ id: 0, name: "Phase zero", status: "pending", checkpoint, artifacts: [], predictionsRequired: 0 }] }),
  );
  writeFile(
    dir,
    "src/index.js",
    "function isReady() {\n  return true;\n}\nfunction inRange(x) {\n  return x < 10;\n}\nmodule.exports = { isReady, inRange };\n",
  );
  fs.mkdirSync(path.join(dir, ".ai-learn"), { recursive: true });
  fs.writeFileSync(
    mutateConfigPath(dir),
    JSON.stringify({ version: 1, mutators: ["boolean-literal", "comparison-operator"], maxMutantsPerRun: 1, ignore: [] }),
  );

  const report = mutationReport({ dir, phase: { id: 0, checkpoint, mutation: true } });

  assert.strictEqual(report.truncated, true);
  assert.strictEqual(report.mutants, 1);
  assert.strictEqual(report.ok, true);
});

test("mutationReport: maxMutantsPerRun truncation with a survivor among the tested mutants stays ok false", () => {
  const checkpoint = 'node -e "process.exit(0)"'; // never inspects return values: every mutant survives
  const dir = tmpProject(
    sampleProgress({ phases: [{ id: 0, name: "Phase zero", status: "pending", checkpoint, artifacts: [], predictionsRequired: 0 }] }),
  );
  writeFile(
    dir,
    "src/index.js",
    "function isReady() {\n  return true;\n}\nfunction inRange(x) {\n  return x < 10;\n}\nmodule.exports = { isReady, inRange };\n",
  );
  fs.mkdirSync(path.join(dir, ".ai-learn"), { recursive: true });
  fs.writeFileSync(
    mutateConfigPath(dir),
    JSON.stringify({ version: 1, mutators: ["boolean-literal", "comparison-operator"], maxMutantsPerRun: 1, ignore: [] }),
  );

  const report = mutationReport({ dir, phase: { id: 0, checkpoint, mutation: true } });

  assert.strictEqual(report.truncated, true);
  assert.strictEqual(report.ok, false);
  assert.strictEqual(report.survived.length, 1);
});

test("emptyMutationReport returns the stable not-computed shape for both required values", () => {
  assert.deepStrictEqual(emptyMutationReport(false), {
    required: false,
    ok: true,
    mutants: 0,
    killed: 0,
    survived: [],
    score: null,
    truncated: false,
  });
  assert.deepStrictEqual(emptyMutationReport(true), {
    required: true,
    ok: true,
    mutants: 0,
    killed: 0,
    survived: [],
    score: null,
    truncated: false,
  });
});

test("formatMutationGap summarizes the kill count", () => {
  const report = { killed: 2, mutants: 3, survived: [{ file: "src/index.js", line: 2, operator: "boolean-literal" }] };
  assert.strictEqual(formatMutationGap({ id: 0 }, report), "phase 0: 2/3 mutants tués, 1 survécu(s)");
});
