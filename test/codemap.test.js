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

test("a host:port in the prose is not a citation", () => {
  const { errors, codeMaps } = mapIssues(fixture({ body: "via registry.npmjs.org:443\nlib/route.js:12\nlib/reply.js:40\nlib/hooks.js:3\n" }).dir);

  assert.deepStrictEqual(errors, []);
  assert.deepStrictEqual(codeMaps[0].invalid, []);
});

test("./x and x are the same citation for the minimum", () => {
  const { errors } = mapIssues(fixture({ body: "lib/route.js:12\n./lib/route.js:12\nlib/reply.js:40\n" }).dir);

  assert.match(errors[0].message, /au moins 3 citations/);
});

test("a map citing itself is invalid", () => {
  const { errors } = mapIssues(fixture({ root: ".", body: "docs/carte-du-code.md:1\nlib/route.js:12\nlib/reply.js:40\n" }).dir);

  assert.match(errors[0].message, /carte-du-code\.md:1/);
});

test("a citation escaping through a symlink is invalid", () => {
  const fx = fixture();
  fs.symlinkSync(path.join(path.dirname(fx.source), `${path.basename(fx.source)}-secret.js`), path.join(fx.source, "lib/link.js"));
  const { errors } = mapIssues(fixture({ root: fx.source, body: "lib/link.js:1\nlib/route.js:12\nlib/reply.js:40\nlib/hooks.js:3\n" }).dir);

  assert.match(errors[0].message, /lib\/link\.js:1/);
});

test("several maps in a phase are checked separately", () => {
  const fx = fixture();
  const progress = sampleProgress({ phases: [{ id: 0, name: "P", status: "done", checkpoint: "true", artifacts: [MAP, "docs/carte-du-code-b.md"], predictionsRequired: 0 }] });
  const dir = tmpProject(progress);
  writeFile(dir, MAP, `Racine : ${fx.source}\nlib/route.js:12\nlib/reply.js:40\nlib/hooks.js:3\n`);
  writeFile(dir, "docs/carte-du-code-b.md", "pas de racine\n");
  const { issues } = checkProject(dir, { home: fs.mkdtempSync(path.join(os.tmpdir(), "ai-learn-h-")) });

  assert.deepStrictEqual(issues.errors.filter((i) => /carte-du-code/.test(i.file)).map((i) => i.file), ["docs/carte-du-code-b.md"]);
});
