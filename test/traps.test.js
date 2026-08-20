"use strict";

const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const { WARNING_MARKERS, extractTrapsFromSource, regenerateTraps, trapsCommand } = require("../bin/lib/traps");
const { addSource } = require("../bin/lib/docs");
const { checkProject } = require("../bin/lib/check");
const { tmpProject, writeFile, capture } = require("./helpers");

const WARNING_DOC = `# Reference

## Promise resolution

> ⚠ Warning:
> * When using both \`return value\` and \`reply.send(value)\`, the first one takes
>   precedence, the second is discarded, and a *warn* log is emitted.
> * \`undefined\` cannot be returned.

Plain text follows.

## Something else

> A routine note that should not be a trap.
`;

function trapsProject() {
  const dir = tmpProject({
    version: 1,
    project: "demo",
    technology: "Fastify",
    docSource: { type: "local", sources: [{ name: "fastify-docs", mode: "local", path: "docs/sources/fastify-docs" }] },
    phases: [],
  });
  writeFile(dir, "docs/sources/fastify-docs/Reference/Routes.md", WARNING_DOC);
  writeFile(dir, "docs/sources/fastify-docs/Guides/Getting-Started.md", "# Getting Started\n\nJust a note.\n");
  return dir;
}

test("extractTrapsFromSource captures the warning callout with its citation", () => {
  const dir = trapsProject();

  const traps = extractTrapsFromSource("fastify-docs", path.join(dir, "docs", "sources", "fastify-docs"));

  assert.strictEqual(traps.length, 1);
  assert.strictEqual(traps[0].source, "fastify-docs");
  assert.strictEqual(traps[0].file, "Reference/Routes.md");
  assert.strictEqual(traps[0].section, "Promise resolution");
  assert.strictEqual(traps[0].line, 5);
  assert.match(traps[0].text, /first one takes/); // wrapped line inside the block
  assert.match(traps[0].text, /second is discarded/);
  assert.doesNotMatch(traps[0].text, /^>/); // blockquote prefix stripped
});

test("WARNING_MARKERS matches the documented warnings but not a routine blockquote", () => {
  assert.match("⚠ Warning: something", WARNING_MARKERS);
  assert.match("Security Consideration: by default...", WARNING_MARKERS);
  assert.match("Do not use reply.send in a hook", WARNING_MARKERS);
  assert.match("Never mix callbacks and async hooks", WARNING_MARKERS);
  assert.doesNotMatch("A routine note about the router", WARNING_MARKERS);
  assert.doesNotMatch("Plain text has no markers", WARNING_MARKERS);
  // "whenever" contains "never" — word boundaries must keep it out.
  assert.doesNotMatch("Our pipeline deploys whenever a merge lands in main.", WARNING_MARKERS);
  // ...but a standalone marker still matches.
  assert.match("Caution: this changes the response", WARNING_MARKERS);
});

test("regenerateTraps writes the machine and human banks", () => {
  const dir = trapsProject();

  const result = regenerateTraps(dir);

  assert.strictEqual(result.traps.length, 1);
  assert.strictEqual(result.sources, 1);

  const data = JSON.parse(fs.readFileSync(path.join(dir, ".ai-learn", "traps.json"), "utf8"));
  assert.strictEqual(data.schemaVersion, 1);
  assert.ok(data.generatedAt);
  assert.strictEqual(data.traps.length, 1);
  assert.strictEqual(data.traps[0].file, "Reference/Routes.md");
  assert.strictEqual(data.traps[0].line, 5);

  const md = fs.readFileSync(path.join(dir, "docs", "plans", "pièges.md"), "utf8");
  assert.match(md, /# Banque de pièges/);
  assert.match(md, /Reference\/Routes\.md:5/);
});

test("a missing source is skipped and a doc without traps yields an empty bank", () => {
  const dir = tmpProject({
    version: 1,
    project: "demo",
    technology: "X",
    docSource: { type: "local", sources: [{ name: "missing", mode: "local", path: "docs/sources/missing" }] },
    phases: [],
  });

  assert.deepStrictEqual(extractTrapsFromSource("missing", path.join(dir, "docs", "sources", "missing")), []);

  const result = regenerateTraps(dir);
  assert.strictEqual(result.traps.length, 0);
  assert.strictEqual(result.sources, 0);
  assert.ok(fs.existsSync(path.join(dir, ".ai-learn", "traps.json")));
  assert.ok(fs.existsSync(path.join(dir, "docs", "plans", "pièges.md")));
});

test("trapsCommand prints a report and never touches progress.json", () => {
  const dir = trapsProject();
  const before = fs.readFileSync(path.join(dir, "progress.json"), "utf8");

  const out = capture(() => trapsCommand({ dir }));

  assert.match(out, /pièges|traps/i);
  assert.match(out, /1 piège/);
  assert.strictEqual(fs.readFileSync(path.join(dir, "progress.json"), "utf8"), before);
});

test("trapsCommand fails without a ledger", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ai-learn-test-"));
  assert.throws(() => trapsCommand({ dir }), /No progress\.json/);
});

test("docs add regenerates the traps bank automatically", () => {
  const src = fs.mkdtempSync(path.join(os.tmpdir(), "ai-learn-src-"));
  writeFile(src, "docs/Reference/Routes.md", "# Routes\n\n> ⚠ Warning:\n> Do not return undefined from a handler.\n");

  const dir = tmpProject({ version: 1, project: "demo", technology: "X", docSource: null, phases: [] });
  addSource({ dir, name: "fastify-docs", source: src, online: false, subpath: "docs" });

  const data = JSON.parse(fs.readFileSync(path.join(dir, ".ai-learn", "traps.json"), "utf8"));
  assert.strictEqual(data.traps.length, 1);
  assert.strictEqual(data.traps[0].file, "Reference/Routes.md");
  assert.match(data.traps[0].text, /Do not return undefined/);
});

test("checkProject warns when local sources exist but no friction bank", () => {
  const dir = trapsProject(); // no .ai-learn/traps.json on purpose
  const entry = checkProject(dir);

  assert.ok(entry.issues.warnings.some((w) => /friction bank/.test(w.message)));
});

test("traps extraction ignores a non-md origin file but reads the transcript", () => {
  const dir = tmpProject({
    version: 1,
    project: "demo",
    technology: "X",
    docSource: {
      type: "local",
      sources: [{ name: "livre", mode: "local", path: "docs/sources/livre", file: "book.pdf", generated: true }],
    },
    phases: [],
  });
  writeFile(dir, "docs/sources/livre/book.pdf", "%PDF-1.4 fake\n");
  writeFile(dir, "docs/sources/livre/essentiel.md", "# Essentiel\n\n> ⚠ Warning:\n> Do not mix callbacks and async hooks.\n");

  const traps = extractTrapsFromSource("livre", path.join(dir, "docs", "sources", "livre"));

  assert.strictEqual(traps.length, 1);
  assert.strictEqual(traps[0].file, "essentiel.md");
  assert.strictEqual(traps[0].line, 3);
  assert.match(traps[0].text, /Do not mix callbacks/);
});
