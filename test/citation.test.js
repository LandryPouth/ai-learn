"use strict";

// Citation primitives shared by the tier-6 PR URL check and the dirigeant
// review check (story 03.03). Direct unit tests for the edge cases that an
// integration test through `check` would have to reach indirectly.

const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const { findRealFileLine } = require("../bin/lib/citation");
const { DECISION_RE, reviewSlug } = require("../bin/lib/reviews");
const { writeFile } = require("./helpers");

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "ai-learn-citation-"));
}

test("findRealFileLine refuses the line after the last real line (LF, trailing newline)", () => {
  const dir = tmpDir();
  writeFile(dir, "src/index.js", "one\ntwo\nthree\n");

  assert.strictEqual(findRealFileLine("src/index.js:3", dir), "src/index.js:3");
  assert.strictEqual(findRealFileLine("src/index.js:4", dir), null);
});

test("findRealFileLine refuses the line after the last real line (CRLF, trailing newline)", () => {
  const dir = tmpDir();
  writeFile(dir, "src/index.js", "one\r\ntwo\r\n");

  assert.strictEqual(findRealFileLine("src/index.js:2", dir), "src/index.js:2");
  assert.strictEqual(findRealFileLine("src/index.js:3", dir), null);
});

test("findRealFileLine refuses line 1 of an empty file", () => {
  const dir = tmpDir();
  writeFile(dir, "src/empty.js", "");

  assert.strictEqual(findRealFileLine("src/empty.js:1", dir), null);
});

test("findRealFileLine keeps a dotdot-prefixed directory that is still inside the root", () => {
  const dir = tmpDir();
  writeFile(dir, "..foo/f.js", "a\n");

  assert.strictEqual(findRealFileLine("..foo/f.js:1", dir), "..foo/f.js:1");
});

test("findRealFileLine refuses a citation that escapes the project root", () => {
  const dir = tmpDir();
  writeFile(dir, "src/index.js", "a\n");

  assert.strictEqual(findRealFileLine("../outside.js:1", dir), null);
  assert.strictEqual(findRealFileLine("/etc/passwd:1", dir), null);
});

test("findRealFileLine applies the optional allowed-path predicate", () => {
  const dir = tmpDir();
  writeFile(dir, "README.md", "readme\n");
  const onlySrc = (relative) => relative.startsWith("src/");

  assert.strictEqual(findRealFileLine("README.md:1", dir, onlySrc), null);
});

test("findRealFileLine accepts Windows separators and accented filenames", () => {
  const dir = tmpDir();
  writeFile(dir, "src/index.js", "one\ntwo\n");
  writeFile(dir, "src/données.js", "a\nb\n");

  assert.strictEqual(findRealFileLine("src\\index.js:2", dir), "src\\index.js:2");
  assert.strictEqual(findRealFileLine("src\\index.js:3", dir), null);
  assert.strictEqual(findRealFileLine("src/données.js:2", dir), "src/données.js:2");
});

test("findRealFileLine refuses a Windows-style citation that escapes the root", () => {
  const dir = tmpDir();
  writeFile(dir, "src/index.js", "a\n");

  assert.strictEqual(findRealFileLine("..\\outside.js:1", dir), null);
  assert.strictEqual(findRealFileLine("C:\\outside\\file.js:1", dir), null);
});

test("DECISION_RE accepts accented past participles and refuses substring matches", () => {
  for (const text of [
    "Décision : accepter.",
    "Décision : accepté.",
    "Décision : acceptée.",
    "Décision : rejeté.",
    "Décision : refusée.",
    "Décision : demander un changement.",
    "Décision : changement demandé.",
    "Decision: approved.",
  ]) {
    assert.ok(DECISION_RE.test(text), text);
  }

  for (const text of ["rejection", "unaccepted", "preapprovedly"]) {
    assert.ok(!DECISION_RE.test(text), text);
  }
});

test("reviewSlug strips accents and punctuation, and falls back to phase-<id>", () => {
  assert.strictEqual(reviewSlug({ id: 2, name: "Décision clé & fin" }), "decision-cle-fin");
  assert.strictEqual(reviewSlug({ id: 7, name: "   " }), "phase-7");
  assert.strictEqual(reviewSlug({ id: 7, name: "Routes" }), "routes");
});
