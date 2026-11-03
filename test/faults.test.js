"use strict";

// Story 11.02 — the semantic fault bank of `ai-learn break`: each operator
// rewrites only the expected text, and never matches inside strings/comments.

const { test } = require("node:test");
const assert = require("node:assert");

const { FAULT_OPERATORS, resolveFaults } = require("../bin/lib/faults");
const { detectAllSites } = require("../bin/lib/mutate");
const { stripStringsAndComments } = require("../bin/lib/norm");

// First rewrite of `line` by one operator, or null when it must not match.
function rewrite(id, line) {
  const [site] = detectAllSites(stripStringsAndComments(line), [FAULT_OPERATORS[id]]);

  return site ? line.slice(0, site.index) + site.mutate(site.matchedText) + line.slice(site.index + site.length) : null;
}

const CASES = [
  ["await-removal", "const r = await f();", "const r = f();"],
  ["await-removal", "const s = 'await f()';", null],
  ["await-removal", "// await f()", null],
  ["throw-to-return", "  throw new Error('x');", "  return;"],
  ["throw-to-return", "  if (!ok) throw err;", "  if (!ok) return;"],
  ["throw-to-return", "const f = () => throw_(x);", null],
  ["throw-to-return", "const m = 'throw x;';", null],
  ["release-removal", "  client.release();", "  "],
  ["release-removal", "  await client.release();", "  "],
  ["release-removal", "  const r = pool.release();", null],
  ["release-removal", "  // client.release();", null],
  ["logical-operator", "if (a && b) {}", "if (a || b) {}"],
  ["logical-operator", "if (a || b) {}", "if (a && b) {}"],
  ["logical-operator", "a ||= b;", null],
  ["logical-operator", "a &&= b;", null],
  ["logical-operator", "const s = 'a && b';", null],
  ["nullish-to-or", "const n = a ?? 5;", "const n = a || 5;"],
  ["nullish-to-or", "a ??= 5;", null],
  // Review findings (story 11.02): rewrites must not eat or move surrounding code.
  ["throw-to-return", "try { throw new Error('x'); } catch (e) { handle(e); }", "try { return; } catch (e) { handle(e); }"],
  ["throw-to-return", "try { throw new Error('x') } catch (e) { handle(e); }", null],
  ["throw-to-return", "if (a) { throw e } else { go(); }", null],
  ["throw-to-return", "throw new Error('top level');", null],
  ["release-removal", "  if (err) client.release();", null],
  ["release-removal", "  } else client.release();", null],
  ["release-removal", "  for (const c of cs) c.release();", null],
  ["release-removal", "  client.release().then(f);", null],
  ["await-removal", "  await [1].map(g);", null],
  ["release-removal", "  client.release()\n    .then(g);", null],
  ["await-removal", "obj.await  (1);", null],
  ["await-removal", "for await (const x of xs) {}", null],
  ["nullish-to-or", "const s = 'a ?? b';", null],
];

test("each fault operator rewrites only the expected text", () => {
  for (const [id, line, expected] of CASES) {
    assert.strictEqual(rewrite(id, line), expected, `${id}: ${line}`);
  }
});

test("every rewritten case still parses", () => {
  const vm = require("vm");

  for (const [id, line, expected] of CASES.filter((c) => c[2] !== null)) {
    assert.doesNotThrow(() => new vm.Script(`(async function () {\n${expected}\n})`), `${id}: ${expected}`);
  }
});

test("a rewrite never adds or removes a line", () => {
  const line = "  client.release();";

  assert.strictEqual(rewrite("release-removal", line).split("\n").length, 1);
});

test("every operator names its mechanism", () => {
  for (const operator of Object.values(FAULT_OPERATORS)) {
    assert.ok(operator.label && operator.mechanism, operator.id);
  }
});

test("resolveFaults drops unknown ids and tolerates a pack without faults", () => {
  assert.deepStrictEqual(resolveFaults(undefined), []);
  assert.deepStrictEqual(resolveFaults(["nope", "await-removal"]).map((o) => o.id), ["await-removal"]);
});
