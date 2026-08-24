"use strict";

// `ai-learn norm` — mechanical clean-code checker. Under test: the heuristic
// function-boundary detection (brace strategy + Python indentation strategy),
// its deliberate under-detection policy on ambiguous/unbalanced input (a
// false negative here is always preferable to a false positive, since this
// mechanism hard-blocks verify/check — see bin/lib/norm.js's header), and the
// project-level scan/config layer (learnerFiles scoping, test-file exclusion,
// .ai-learn/norm.json overrides).

const { test, afterEach } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");
const { writeFile } = require("./helpers");
const {
  analyzeFile,
  detectFunctionsBrace,
  detectFunctionsPython,
  splitTopLevelParams,
  normProject,
  loadNormConfig,
  resolveThresholds,
  formatViolation,
  ensureNormConfig,
} = require("../bin/lib/norm");

afterEach(() => {
  process.exitCode = 0;
});

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "ai-learn-norm-"));
}

const BIN = path.join(__dirname, "..", "bin", "ai-learn.js");

function isolatedEnv() {
  return { ...process.env, HOME: fs.mkdtempSync(path.join(os.tmpdir(), "ai-learn-norm-home-")), CLAUDECODE: "" };
}

function jsFunctionOfLength(name, bodyLines) {
  const lines = [`function ${name}() {`];
  for (let i = 0; i < bodyLines; i++) lines.push(`  const x${i} = ${i};`);
  lines.push("}");
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// M1 — core engine: brace strategy.
// ---------------------------------------------------------------------------

test("detectFunctionsBrace flags a known function-length precisely", () => {
  const source = jsFunctionOfLength("handleUpload", 5); // 5 body lines + open/close = 7
  const { functions, balanced } = detectFunctionsBrace(source);

  assert.equal(balanced, true);
  assert.equal(functions.length, 1);
  assert.equal(functions[0].name, "handleUpload");
  assert.equal(functions[0].lengthLines, 7);
  assert.equal(functions[0].paramCount, 0);
});

test("detectFunctionsBrace measures nesting depth from control blocks, not from the function frame itself", () => {
  const source = [
    "function outer() {",
    "  if (a) {",
    "    if (b) {",
    "      doThing();",
    "    }",
    "  }",
    "}",
  ].join("\n");

  const { functions } = detectFunctionsBrace(source);
  assert.equal(functions.length, 1);
  assert.equal(functions[0].maxNestingDepth, 2);
});

test("detectFunctionsBrace counts params via depth-aware splitting, unaffected by a function-pointer param's own commas", () => {
  const source = [
    "int register_cmp(int (*cmp)(const void*, const void*), int flag) {",
    "  return flag;",
    "}",
  ].join("\n");

  const { functions } = detectFunctionsBrace(source);
  assert.equal(functions.length, 1);
  assert.equal(functions[0].name, "register_cmp");
  assert.equal(functions[0].paramCount, 2);
});

test("detectFunctionsBrace never mistakes a control block or a class body for a function", () => {
  const source = [
    "class Widget {",
    "  render() {",
    "    if (this.visible) {",
    "      return 1;",
    "    }",
    "  }",
    "}",
  ].join("\n");

  const { functions } = detectFunctionsBrace(source);
  assert.equal(functions.length, 1);
  assert.equal(functions[0].name, "render");
});

test("detectFunctionsBrace ignores braces inside strings and comments", () => {
  const source = [
    'function foo() {',
    '  const s = "not a { brace }";',
    '  // a comment with a { brace }',
    '  /* another } comment { */',
    '  return s;',
    '}',
  ].join("\n");

  const { functions, balanced } = detectFunctionsBrace(source);
  assert.equal(balanced, true);
  assert.equal(functions.length, 1);
  assert.equal(functions[0].name, "foo");
});

test("detectFunctionsBrace reports unbalanced braces rather than guessing", () => {
  const source = "function foo() {\n  if (x) {\n";
  const { balanced } = detectFunctionsBrace(source);
  assert.equal(balanced, false);
});

test("detectFunctionsBrace detects a TypeScript function with a typed return annotation", () => {
  const source = "function foo(a: number, b: string): boolean {\n  return true;\n}\n";
  const { functions, balanced } = detectFunctionsBrace(source);
  assert.equal(balanced, true);
  assert.equal(functions.length, 1);
  assert.equal(functions[0].name, "foo");
  assert.equal(functions[0].paramCount, 2);
});

test("detectFunctionsBrace detects a generic TypeScript function", () => {
  const source = "function identity<T>(arg: T): T {\n  return arg;\n}\n";
  const { functions, balanced } = detectFunctionsBrace(source);
  assert.equal(balanced, true);
  assert.equal(functions.length, 1);
  assert.equal(functions[0].name, "identity");
  assert.equal(functions[0].paramCount, 1);
});

test("detectFunctionsBrace detects a TypeScript class method with a typed return annotation", () => {
  const source = "class Foo {\n  bar(x: number): number {\n    return x;\n  }\n}\n";
  const { functions } = detectFunctionsBrace(source);
  assert.equal(functions.length, 1);
  assert.equal(functions[0].name, "bar");
  assert.equal(functions[0].paramCount, 1);
});

test("detectFunctionsBrace counts params correctly for a TypeScript arrow function with a typed return annotation", () => {
  const source = "const add = (a: number, b: number): number => {\n  return a + b;\n};\n";
  const { functions } = detectFunctionsBrace(source);
  assert.equal(functions.length, 1);
  assert.equal(functions[0].name, "add");
  assert.equal(functions[0].paramCount, 2);
});

test("detectFunctionsBrace counts a single typed param correctly on a typed-return arrow function", () => {
  const source = "const double = (a: number): number => {\n  return a * 2;\n};\n";
  const { functions } = detectFunctionsBrace(source);
  assert.equal(functions.length, 1);
  assert.equal(functions[0].name, "double");
  assert.equal(functions[0].paramCount, 1);
});

test("detectFunctionsBrace detects a generic TypeScript arrow function", () => {
  const source = "const wrap = <T,>(x: T): T[] => {\n  return [x];\n};\n";
  const { functions } = detectFunctionsBrace(source);
  assert.equal(functions.length, 1);
  assert.equal(functions[0].name, "wrap");
  assert.equal(functions[0].paramCount, 1);
});

test("detectFunctionsBrace detects a function with a destructured, typed param without losing the signature to the pattern's own braces", () => {
  const source = "function foo({ a, b }: { a: number, b: string }): void {\n  return;\n}\n";
  const { functions, balanced } = detectFunctionsBrace(source);
  assert.equal(balanced, true);
  assert.equal(functions.length, 1);
  assert.equal(functions[0].name, "foo");
  assert.equal(functions[0].paramCount, 1);
});

test("detectFunctionsBrace detects an arrow function with a destructured param", () => {
  const source = "const handler = ({ req, res }: Ctx) => {\n  res.send(req.body);\n};\n";
  const { functions } = detectFunctionsBrace(source);
  assert.equal(functions.length, 1);
  assert.equal(functions[0].name, "handler");
  assert.equal(functions[0].paramCount, 1);
});

test("detectFunctionsBrace detects a function whose signature spans multiple lines with a typed return", () => {
  const source = "function foo(\n  a: number,\n  b: string\n): boolean {\n  return true;\n}\n";
  const { functions, balanced } = detectFunctionsBrace(source);
  assert.equal(balanced, true);
  assert.equal(functions.length, 1);
  assert.equal(functions[0].name, "foo");
  assert.equal(functions[0].paramCount, 2);
});

test("detectFunctionsBrace does not confuse a default object-literal param's braces with the function body", () => {
  const source = "function foo(opts = { x: 1, y: 2 }) {\n  return opts;\n}\n";
  const { functions } = detectFunctionsBrace(source);
  assert.equal(functions.length, 1);
  assert.equal(functions[0].name, "foo");
});

// ---------------------------------------------------------------------------
// M1 — core engine: Python indentation strategy.
// ---------------------------------------------------------------------------

test("detectFunctionsPython flags a function via indentation and excludes self from the param count", () => {
  const source = [
    "def process(self, items):",
    "    total = 0",
    "    for item in items:",
    "        if item > 0:",
    "            total += item",
    "    return total",
  ].join("\n");

  const { functions } = detectFunctionsPython(source);
  assert.equal(functions.length, 1);
  assert.equal(functions[0].name, "process");
  assert.equal(functions[0].paramCount, 1);
  assert.equal(functions[0].lengthLines, 6);
  assert.equal(functions[0].maxNestingDepth, 2);
});

test("detectFunctionsPython detects a nested def as its own function", () => {
  const source = [
    "def outer():",
    "    def inner():",
    "        return 1",
    "    return inner()",
  ].join("\n");

  const { functions } = detectFunctionsPython(source);
  const names = functions.map((f) => f.name).sort();
  assert.deepEqual(names, ["inner", "outer"]);
});

// ---------------------------------------------------------------------------
// M1 — splitTopLevelParams.
// ---------------------------------------------------------------------------

test("splitTopLevelParams treats an empty parameter list as zero params", () => {
  assert.deepEqual(splitTopLevelParams(""), []);
  assert.deepEqual(splitTopLevelParams("   "), []);
});

test("splitTopLevelParams does not split inside nested parens/brackets", () => {
  const params = splitTopLevelParams("a, (b, c), [d, e]");
  assert.deepEqual(params, ["a", "(b, c)", "[d, e]"]);
});

// ---------------------------------------------------------------------------
// M1 — analyzeFile: thresholds + the false-negative-over-false-positive policy.
// ---------------------------------------------------------------------------

test("analyzeFile flags file-length and function-length against given thresholds", () => {
  const dir = tmpDir();
  const abs = writeFile(dir, "src/big.js", jsFunctionOfLength("big", 5));
  const file = { rel: "src/big.js", abs, loc: 7 };
  const thresholds = { maxFileLines: 5, maxFunctionLines: 3, maxNestingDepth: 4, maxParams: 5 };

  const { violations, skipped } = analyzeFile(file, thresholds, "JavaScript");
  assert.equal(skipped, false);

  const rules = violations.map((v) => v.rule).sort();
  assert.deepEqual(rules, ["file-length", "function-length"]);

  const formatted = violations.map(formatViolation);
  assert.ok(formatted[0].startsWith("src/big.js:1"));
});

test("analyzeFile skips function-level rules (but keeps file-length) on unbalanced braces", () => {
  const dir = tmpDir();
  const source = "function foo() {\n  if (x) {\n    doThing();\n";
  const abs = writeFile(dir, "src/broken.js", source);
  const file = { rel: "src/broken.js", abs, loc: 100 };
  const thresholds = { maxFileLines: 5, maxFunctionLines: 3, maxNestingDepth: 4, maxParams: 5 };

  const { violations, skipped, skipReason } = analyzeFile(file, thresholds, "JavaScript");
  assert.equal(skipped, true);
  assert.equal(skipReason, "unbalanced braces");
  assert.equal(violations.length, 1);
  assert.equal(violations[0].rule, "file-length");
});

// ---------------------------------------------------------------------------
// M2 — normProject: learnerFiles scoping, test-file exclusion, config
// overrides, ignore globs, stack-default fallback.
// ---------------------------------------------------------------------------

test("normProject only scans files under learnerFiles (default src/**)", () => {
  const dir = tmpDir();
  writeFile(dir, ".ai-learn/norm.json", JSON.stringify({ version: 1, maxFunctionLines: 3 }));
  writeFile(dir, "src/index.js", jsFunctionOfLength("inScope", 5));
  writeFile(dir, "scripts/build.js", jsFunctionOfLength("outOfScope", 5));

  const report = normProject(dir);
  assert.equal(report.violations.length, 1);
  assert.equal(report.violations[0].file, "src/index.js");
});

test("normProject excludes test files by default, includes them when includeTests is true", () => {
  const dir = tmpDir();
  writeFile(dir, ".ai-learn/norm.json", JSON.stringify({ version: 1, maxFunctionLines: 3 }));
  writeFile(dir, "src/index.js", "function clean() {\n  return 1;\n}");
  writeFile(dir, "src/index.test.js", jsFunctionOfLength("setupHeavyTest", 5));

  const excluded = normProject(dir);
  assert.equal(excluded.violations.length, 0);

  writeFile(dir, ".ai-learn/norm.json", JSON.stringify({ version: 1, maxFunctionLines: 3, includeTests: true }));
  const included = normProject(dir);
  assert.equal(included.violations.length, 1);
  assert.equal(included.violations[0].file, "src/index.test.js");
});

test("normProject honors an ignore glob scoped to the matching path only", () => {
  const dir = tmpDir();
  writeFile(
    dir,
    ".ai-learn/norm.json",
    JSON.stringify({ version: 1, maxFunctionLines: 3, ignore: ["src/generated/**"] }),
  );
  writeFile(dir, "src/generated/schema.js", jsFunctionOfLength("generated", 5));
  writeFile(dir, "src/index.js", jsFunctionOfLength("handWritten", 5));

  const report = normProject(dir);
  assert.equal(report.violations.length, 1);
  assert.equal(report.violations[0].file, "src/index.js");
});

test("normProject falls back to the detected stack's defaults when norm.json is absent or corrupt", () => {
  const cFunctionLines = (n) => {
    const lines = ["int compute(void) {"];
    for (let i = 0; i < n; i++) lines.push(`  int v${i} = ${i};`);
    lines.push("  return 0;");
    lines.push("}");
    return lines.join("\n");
  };

  const absent = tmpDir();
  writeFile(absent, "Makefile", "CC=gcc\n");
  writeFile(absent, "src/main.c", cFunctionLines(29)); // length 32 > c pack's maxFunctionLines (30)
  const absentReport = normProject(absent);
  assert.ok(absentReport.violations.some((v) => v.rule === "function-length"));

  const corrupt = tmpDir();
  writeFile(corrupt, "Makefile", "CC=gcc\n");
  writeFile(corrupt, ".ai-learn/norm.json", "{ not valid json");
  writeFile(corrupt, "src/main.c", cFunctionLines(29));
  const corruptReport = normProject(corrupt);
  assert.ok(corruptReport.violations.some((v) => v.rule === "function-length"));
});

test("resolveThresholds prefers norm.json, then the stack pack, then FALLBACK_NORM", () => {
  const dir = tmpDir();
  writeFile(dir, ".ai-learn/norm.json", JSON.stringify({ version: 1, maxParams: 2 }));

  const thresholds = resolveThresholds(dir, "C");
  assert.equal(thresholds.maxParams, 2); // overridden
  assert.equal(thresholds.maxFunctionLines, 30); // from the C stack pack
});

test("loadNormConfig treats an absent file as all-defaults, empty ignore, includeTests false", () => {
  const dir = tmpDir();
  const config = loadNormConfig(dir);
  assert.deepEqual(config.ignore, []);
  assert.equal(config.includeTests, false);
  assert.equal(config.thresholds.maxFunctionLines, null);
});

// ---------------------------------------------------------------------------
// M2 — ensureNormConfig: auto-create once, never overwrite.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// M3 — `ai-learn norm` standalone CLI dispatch.
// ---------------------------------------------------------------------------

test("ai-learn norm exits 0 and reports no violation on a clean project", () => {
  const dir = tmpDir();
  writeFile(dir, "src/index.js", "function clean() {\n  return 1;\n}\n");

  const result = spawnSync(process.execPath, [BIN, "norm", "--dir", dir], { encoding: "utf8", env: isolatedEnv() });
  assert.strictEqual(result.status, 0);
  assert.match(result.stdout, /no violation/);
});

test("ai-learn norm exits non-zero and cites file:line — message [rule] on a violation", () => {
  const dir = tmpDir();
  writeFile(dir, ".ai-learn/norm.json", JSON.stringify({ version: 1, maxFunctionLines: 3 }));
  writeFile(dir, "src/index.js", jsFunctionOfLength("tooLong", 5));

  const result = spawnSync(process.execPath, [BIN, "norm", "--dir", dir], { encoding: "utf8", env: isolatedEnv() });
  assert.strictEqual(result.status, 1);
  assert.match(result.stdout, /src\/index\.js:1 — function `tooLong` is 7 lines \(max 3\) \[function-length\]/);
});

test("ensureNormConfig writes the detected stack's concrete thresholds once, never overwrites afterward", () => {
  const dir = tmpDir();
  const first = ensureNormConfig(dir, "C");
  assert.equal(first.created, true);

  const configPath = path.join(dir, ".ai-learn", "norm.json");
  const written = JSON.parse(fs.readFileSync(configPath, "utf8"));
  assert.equal(written.maxFunctionLines, 30);
  assert.equal(written.maxParams, 4);

  fs.writeFileSync(configPath, JSON.stringify({ version: 1, maxFunctionLines: 999 }));
  const second = ensureNormConfig(dir, "C");
  assert.equal(second.created, false);

  const stillCustom = JSON.parse(fs.readFileSync(configPath, "utf8"));
  assert.equal(stillCustom.maxFunctionLines, 999);
});
