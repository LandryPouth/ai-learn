"use strict";

// Story 12.02 — a code map is proof only if every citation resolves.

const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const { checkProject, buildCheckReport } = require("../bin/lib/check");
const { sampleProgress, tmpProject, writeFile } = require("./helpers");

const MAP = "docs/carte-du-code.md";

function lines(n) {
  return "x\n".repeat(n);
}

function fixture({ status = "done", body, root, extraRoot } = {}) {
  const source = fs.mkdtempSync(path.join(os.tmpdir(), "ai-learn-codemap-"));
  writeFile(source, "lib/route.js", lines(50));
  writeFile(source, "lib/reply.js", lines(50));
  writeFile(source, "lib/hooks.js", lines(5));
  fs.writeFileSync(path.join(path.dirname(source), `${path.basename(source)}-secret.js`), "s\n");
  const dir = tmpProject(sampleProgress({ phases: [{ id: 0, name: "P", status, checkpoint: "true", artifacts: [MAP], predictionsRequired: 0 }] }));
  const rootLine = root === null ? "" : `Racine : ${root || source}\n${extraRoot ? `Racine : ${extraRoot}\n` : ""}`;
  const cites = body ?? "- 404 : lib/route.js:12\n```\nlib/reply.js:40\n```\n- hooks : lib/hooks.js:3\n";
  writeFile(dir, MAP, `# Carte\n\n${rootLine}\n${cites}`);
  return { dir, source };
}

function mapIssues(dir) {
  const { issues, codeMaps } = checkProject(dir, { home: fs.mkdtempSync(path.join(os.tmpdir(), "ai-learn-h-")) });
  return {
    errors: issues.errors.filter((issue) => issue.file === MAP),
    warnings: issues.warnings.filter((issue) => issue.file === MAP),
    codeMaps,
  };
}

test("a code map with three real citations passes", () => {
  const { errors, warnings, codeMaps } = mapIssues(fixture().dir);

  assert.deepStrictEqual([errors, warnings], [[], []]);
  assert.deepStrictEqual(codeMaps[0].valid, ["lib/route.js:12", "lib/reply.js:40", "lib/hooks.js:3"]);
});

test("a citation past the end of the file is named", () => {
  const { errors } = mapIssues(fixture({ body: "lib/route.js:99999\nlib/reply.js:40\nlib/hooks.js:3\nlib/route.js:1\n" }).dir);

  assert.strictEqual(errors.length, 1);
  assert.match(errors[0].message, /lib\/route\.js:99999/);
});

test("a code map must declare its root", () => {
  const { errors } = mapIssues(fixture({ root: null }).dir);

  assert.match(errors[0].message, /racine non déclarée/);
});

test("a code map needs at least three real citations", () => {
  const { errors } = mapIssues(fixture({ body: "lib/route.js:12\nlib/route.js:12\nlib/reply.js:40\n" }).dir);

  assert.match(errors[0].message, /au moins 3 citations/);
});

test("a missing root only warns", () => {
  const { errors, warnings, codeMaps } = mapIssues(fixture({ root: "/nope/never" }).dir);

  assert.strictEqual(errors.length, 0);
  assert.match(warnings[0].message, /citations non vérifiées ici/);
  assert.deepStrictEqual(codeMaps[0].rootsMissing, ["/nope/never"]);
});

test("a citation escaping the root is invalid", () => {
  const fx = fixture();
  const secret = `../${path.basename(fx.source)}-secret.js:1`;
  const { errors } = mapIssues(fixture({ root: fx.source, body: `${secret}\nlib/route.js:12\nlib/reply.js:40\nlib/hooks.js:3\n` }).dir);

  assert.match(errors[0].message, /secret\.js:1/);
});

test("a citation unresolved while another root is absent is unverified, not an error", () => {
  const fx = fixture({ extraRoot: "/nope/never", body: "lib/route.js:12\nlib/reply.js:40\nlib/hooks.js:3\nlib/other.js:9\n" });
  const { errors, warnings } = mapIssues(fx.dir);

  assert.strictEqual(errors.length, 0);
  assert.match(warnings[0].message, /lib\/other\.js:9/);
});

test("check --json carries the detail per code map", () => {
  const fx = fixture({ body: "lib/route.js:99999\nlib/reply.js:40\nlib/hooks.js:3\n" });
  const report = buildCheckReport(fx.dir);
  const map = report.projects[0].codeMaps[0];

  assert.deepStrictEqual([map.file, map.valid.length, map.invalid], [MAP, 2, ["lib/route.js:99999"]]);
});
