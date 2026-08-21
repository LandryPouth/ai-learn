"use strict";

const { test, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");

const { checkProject, checkCommand, countDogfoodEntries } = require("../bin/lib/check");
const { verifyCommand } = require("../bin/lib/verify");
const { capture, sampleProgress, tmpProject, writeFile } = require("./helpers");
const { findLearningProjects } = require("../bin/lib/util");

beforeEach(() => {
  process.exitCode = 0;
});

afterEach(() => {
  // A test that intentionally fails a check leaves exitCode at 1; the file must
  // still exit cleanly or node --test reports the whole file as broken.
  process.exitCode = 0;
});

test("a phase marked done without evidence is an error", () => {
  const progress = sampleProgress();
  progress.phases[0].status = "done";
  const dir = tmpProject(progress);

  const entry = checkProject(dir);
  assert.ok(entry.issues.errors.some((e) => /marked done but has no passing evidence/.test(e.message)));
  assert.strictEqual(entry.issues.warnings.length, 0);
});

test("a done phase with a green evidence passes", () => {
  const progress = sampleProgress();
  const dir = tmpProject(progress);

  capture(() => verifyCommand({ dir, phaseId: 0 }));

  const entry = checkProject(dir);
  assert.deepStrictEqual(entry.issues.errors, []);
  assert.deepStrictEqual(entry.issues.warnings, []);
});

test("check auto-writes a dogfood entry when the claude/codex guard isn't wired, deduplicated across runs", () => {
  const dir = tmpProject(sampleProgress());
  writeFile(dir, ".ai-learn/guard.json", JSON.stringify({ version: 1, learnerFiles: ["src/**"] }));
  writeFile(dir, ".ai-learn/dogfood.md", "# Journal de friction\n\n## Entrées\n\n<!-- Nouvelle entrée en haut, sous cette ligne. -->\n");

  checkProject(dir);
  const afterFirst = fs.readFileSync(path.join(dir, ".ai-learn", "dogfood.md"), "utf8");
  assert.match(afterFirst, /<!-- auto:claude-code:hook-guard:/);
  assert.match(afterFirst, /<!-- auto:codex:config:/);
  assert.match(afterFirst, /écrite automatiquement par `ai-learn check`, pas par l'agent/);

  checkProject(dir); // second run: must not duplicate the same finding
  const afterSecond = fs.readFileSync(path.join(dir, ".ai-learn", "dogfood.md"), "utf8");
  assert.strictEqual(afterSecond, afterFirst);
});

test("a guard policy without a wired codex profile is a warning, not an error", () => {
  const dir = tmpProject(sampleProgress());
  writeFile(dir, ".ai-learn/guard.json", JSON.stringify({ version: 1, learnerFiles: ["src/**"] }));

  const entry = checkProject(dir);
  assert.deepStrictEqual(entry.issues.errors, []);
  assert.ok(entry.issues.warnings.some((w) => /ai-learn permissions profile/.test(w.message)));
});

test("the friction journal is counted but never gates check", () => {
  const dir = tmpProject(sampleProgress());
  writeFile(
    dir,
    ".ai-learn/dogfood.md",
    "### low — message confus\n- Surface : next\n- Problème : pas clair\n- Workaround : aucun\n- Version de l'outil : 0.1.0\n\n" +
      "### medium — checkpoint lent\n- Surface : verify\n- Problème : timeout\n- Workaround : relancé\n- Version de l'outil : 0.1.0\n",
  );

  assert.strictEqual(countDogfoodEntries(path.join(dir, ".ai-learn", "dogfood.md")), 2);

  const entry = checkProject(dir);
  assert.deepStrictEqual(entry.issues.errors, []);
  assert.deepStrictEqual(entry.issues.warnings, []);
});

test("a missing artifact blocks a done phase", () => {
  const progress = sampleProgress();
  progress.phases[0].status = "done";
  progress.phases[0].artifacts = ["docs/phase-0-notes.md"];
  const dir = tmpProject(progress);

  capture(() => verifyCommand({ dir, phaseId: 0 }));

  writeFile(dir, "docs/phase-0-notes.md", "# notes");

  const entry = checkProject(dir);
  assert.deepStrictEqual(entry.issues.errors, []);

  fs.rmSync(path.join(dir, "docs", "phase-0-notes.md"));

  const entry2 = checkProject(dir);
  assert.ok(entry2.issues.errors.some((e) => /requires artifact/.test(e.message)));
});

test("stale evidence on a pending phase is a warning", () => {
  const dir = tmpProject(sampleProgress());

  capture(() => verifyCommand({ dir, phaseId: 0, noMark: true }));

  const entry = checkProject(dir);
  assert.deepStrictEqual(entry.issues.errors, []);
  assert.ok(entry.issues.warnings.some((w) => /passing evidence but is not marked done/.test(w.message)));
});

test("a declared local doc source that vanished is a warning", () => {
  const progress = sampleProgress();
  progress.docSource = { type: "local", value: "/definitely/not/a/real/path" };
  const dir = tmpProject(progress);

  const entry = checkProject(dir);
  assert.ok(entry.issues.warnings.some((w) => /declared doc source does not exist/.test(w.message)));
});

test("local doc sources without a friction bank is a warning", () => {
  const progress = sampleProgress();
  progress.docSource = {
    type: "local",
    sources: [{ name: "fastify-docs", mode: "local", path: "docs/sources/fastify-docs" }],
  };
  const dir = tmpProject(progress);
  writeFile(dir, "docs/sources/fastify-docs/Reference/Routes.md", "# Routes\n");

  const entry = checkProject(dir);

  assert.ok(entry.issues.warnings.some((w) => /friction bank/.test(w.message)));
});

test("a docs/solutions reveal with no hole marker is a warning (copy-pasteable as-is)", () => {
  const dir = tmpProject(sampleProgress());
  writeFile(
    dir,
    "docs/solutions/routes.md",
    "# Routes\n\n```js\napp.get('/health', (req, reply) => reply.send({ ok: true }));\n```\n",
  );

  const entry = checkProject(dir);
  assert.ok(entry.issues.warnings.some((w) => /docs\/solutions\/routes\.md/.test(w.file) && /hole marker/.test(w.message)));
});

test("a docs/solutions reveal with a hole marker passes cleanly, README.md is never flagged", () => {
  const dir = tmpProject(sampleProgress());
  writeFile(
    dir,
    "docs/solutions/routes.md",
    "# Routes\n\n```js\napp.get('/health', (req, reply) => reply.send({ [...] }));\n```\n",
  );
  writeFile(dir, "docs/solutions/README.md", "# Solutions de référence — où l'IA dépose le code\n\nComplete text, no holes needed here.\n");

  const entry = checkProject(dir);
  assert.ok(!entry.issues.warnings.some((w) => /docs\/solutions/.test(w.file)));
});

test("hole markers: ellipsis, TODO and a trailing truncated line all count; a fenced code block with no gap does not", () => {
  const dir = tmpProject(sampleProgress());
  writeFile(dir, "docs/solutions/a.md", "# A\n\n```js\nconst x = 1; // …\n```\n");
  writeFile(dir, "docs/solutions/b.md", "# B\n\n```js\n// TODO: complète le handler\n```\n");
  writeFile(dir, "docs/solutions/c.md", "# C\n\n```js\nconst payload = {\n  status: ...\n```\n");
  writeFile(dir, "docs/solutions/d.md", "# D\n\n```js\nconst x = 1;\nconsole.log(x);\n```\n");

  const entry = checkProject(dir);
  const flagged = entry.issues.warnings.filter((w) => /docs\/solutions/.test(w.file)).map((w) => w.file);

  assert.deepStrictEqual(flagged, ["docs/solutions/d.md"]);
});

test("missing predictions in the journal is a warning", () => {
  const progress = sampleProgress();
  progress.phases[0].predictionsRequired = 2;
  const dir = tmpProject(progress);

  writeFile(dir, "docs/plans/predictions.md", "# Journal\n");

  const entry = checkProject(dir);
  assert.ok(entry.issues.warnings.some((w) => /recorded predictions/.test(w.message)));
});

test("a checkpoint file written but never verified is an error", () => {
  const progress = sampleProgress();
  progress.phases[0].checkpoint = "node --test checkpoint/phase-0.test.mjs";
  const dir = tmpProject(progress);

  writeFile(dir, "checkpoint/phase-0.test.mjs", "import { test } from 'node:test'; test('ok', () => {});");

  const entry = checkProject(dir);
  assert.ok(entry.issues.errors.some((e) => /checkpoint exists but no passing evidence/.test(e.message)));
});

test("a verified checkpoint file passes cleanly", () => {
  const progress = sampleProgress();
  progress.phases[0].checkpoint = "node --test checkpoint/phase-0.test.mjs";
  const dir = tmpProject(progress);

  writeFile(dir, "checkpoint/phase-0.test.mjs", "import { test } from 'node:test'; test('ok', () => {});");

  capture(() => verifyCommand({ dir, phaseId: 0 }));

  const entry = checkProject(dir);
  assert.deepStrictEqual(entry.issues.errors, []);
  assert.deepStrictEqual(entry.issues.warnings, []);
});

test("a non-file checkpoint (inline command) is not flagged", () => {
  const dir = tmpProject(sampleProgress());

  const entry = checkProject(dir);
  assert.deepStrictEqual(entry.issues.errors, []);
});

function generatedProgress(overrides = {}) {
  const progress = sampleProgress();
  progress.docSource = {
    type: "local",
    sources: [
      { name: "gen", mode: "local", path: "docs/sources/gen", generated: true, url: "https://roadmap.sh/backend", ...overrides },
    ],
  };
  return progress;
}

test("a generated source without an origin is an error", () => {
  const progress = generatedProgress({ url: undefined });
  const dir = tmpProject(progress);

  const entry = checkProject(dir);
  assert.ok(entry.issues.errors.some((e) => /has no origin/.test(e.message)));
});

test("an empty generated source (recreation never happened) is an error", () => {
  const progress = generatedProgress();
  const dir = tmpProject(progress);
  // scaffold exists (docs add --regen created it) but the AI never filled it
  fs.mkdirSync(path.join(dir, "docs", "sources", "gen"), { recursive: true });

  const entry = checkProject(dir);
  assert.ok(entry.issues.errors.some((e) => /is empty.*must recreate it locally/.test(e.message)));
});

test("a generated source whose doc does not cite its origin is a warning", () => {
  const progress = generatedProgress();
  const dir = tmpProject(progress);
  writeFile(dir, "docs/sources/gen/backend.md", "# Notes\nTranscrit sans origine.\n");

  const entry = checkProject(dir);
  assert.deepStrictEqual(entry.issues.errors, []);
  assert.ok(entry.issues.warnings.some((w) => /does not cite its origin/.test(w.message)));
});

const SUBSTANTIAL_NOTES =
  "Le backend roadmap distingue 4 étapes : comprendre le protocole HTTP, choisir un langage, " +
  "apprendre les bases de données relationnelles et NoSQL, puis l'architecture (cache, files de " +
  "messages, scalabilité horizontale). Chaque étape est détaillée avec les concepts clés à maîtriser " +
  "avant de passer à la suivante, et des exemples concrets d'outils utilisés en production.";

test("a generated source that cites its origin passes cleanly", () => {
  const progress = generatedProgress();
  const dir = tmpProject(progress);
  writeFile(dir, "docs/sources/gen/backend.md", `# Notes\n${SUBSTANTIAL_NOTES}\nSource : https://roadmap.sh/backend\n`);
  writeFile(dir, ".ai-learn/traps.json", "{}\n"); // friction bank present

  const entry = checkProject(dir);
  assert.deepStrictEqual(entry.issues.errors, []);
  assert.deepStrictEqual(entry.issues.warnings, []);
});

test("origin citation matching is robust to scheme and trailing slash", () => {
  const progress = generatedProgress({ url: "https://roadmap.sh/backend/" });
  const dir = tmpProject(progress);
  // no scheme, no trailing slash
  writeFile(dir, "docs/sources/gen/backend.md", `${SUBSTANTIAL_NOTES}\nSource : roadmap.sh/backend\n`);
  writeFile(dir, ".ai-learn/traps.json", "{}\n"); // friction bank present

  const entry = checkProject(dir);
  assert.deepStrictEqual(entry.issues.errors, []);
  assert.deepStrictEqual(entry.issues.warnings, []);
});

test("a generated source with only a trailing citation and no real content is a warning (degenerate case)", () => {
  const progress = generatedProgress();
  const dir = tmpProject(progress);
  // The exact failure mode the content floor exists to catch: a citation
  // stapled onto near-nothing (or, in the real risk case, onto a
  // hallucinated file that happens to be short).
  writeFile(dir, "docs/sources/gen/backend.md", "# Notes\nSource : https://roadmap.sh/backend\n");

  const entry = checkProject(dir);
  assert.deepStrictEqual(entry.issues.errors, []);
  assert.ok(entry.issues.warnings.some((w) => /does not cite its origin/.test(w.message)));
});

function fileProgress(overrides = {}) {
  const progress = sampleProgress();
  progress.docSource = {
    type: "local",
    sources: [
      { name: "livre", mode: "local", path: "docs/sources/livre", file: "book.pdf", src: "/origin/book.pdf", generated: true, ...overrides },
    ],
  };
  return progress;
}

test("a generated file source with only the origin file (no transcript) is an error", () => {
  const progress = fileProgress();
  const dir = tmpProject(progress);
  writeFile(dir, "docs/sources/livre/book.pdf", "%PDF-1.4 fake\n");

  const entry = checkProject(dir);

  assert.ok(entry.issues.errors.some((e) => /is empty.*must recreate it locally/.test(e.message)));
});

test("a generated file source whose transcript does not cite the file is a warning", () => {
  const progress = fileProgress();
  const dir = tmpProject(progress);
  writeFile(dir, "docs/sources/livre/book.pdf", "%PDF-1.4 fake\n");
  writeFile(dir, "docs/sources/livre/essentiel.md", "# Essentiel\nSans citation de page.\n");

  const entry = checkProject(dir);

  assert.deepStrictEqual(entry.issues.errors, []);
  assert.ok(entry.issues.warnings.some((w) => /does not cite its origin/.test(w.message)));
});

test("a generated file source whose transcript cites the file passes cleanly", () => {
  const progress = fileProgress();
  const dir = tmpProject(progress);
  writeFile(dir, "docs/sources/livre/book.pdf", "%PDF-1.4 fake\n");
  writeFile(dir, "docs/sources/livre/essentiel.md", `# Essentiel\n${SUBSTANTIAL_NOTES}\nVoir book.pdf:page 12.\n`);
  writeFile(dir, ".ai-learn/traps.json", "{}\n"); // friction bank present

  const entry = checkProject(dir);

  assert.deepStrictEqual(entry.issues.errors, []);
  assert.deepStrictEqual(entry.issues.warnings, []);
});

test("checkCommand scans every learning project under a root", () => {
  const root = fs.mkdtempSync(path.join(require("os").tmpdir(), "ai-learn-root-"));

  const good = path.join(root, "proj-a");
  fs.mkdirSync(good, { recursive: true });
  writeFile(good, "progress.json", JSON.stringify(sampleProgress({ project: "proj-a" }), null, 2));

  const bad = path.join(root, "proj-b");
  fs.mkdirSync(bad, { recursive: true });
  const badProgress = sampleProgress({ project: "proj-b" });
  badProgress.phases[0].status = "done";
  writeFile(bad, "progress.json", JSON.stringify(badProgress, null, 2));

  capture(() => verifyCommand({ dir: good, phaseId: 0 }));

  const out = capture(() => checkCommand({ root }));

  assert.match(out, /proj-a/);
  assert.match(out, /proj-b/);
  assert.match(out, /1 error\(s\)/);
  assert.match(out, /check FAILED/);
  assert.strictEqual(process.exitCode, 1);

  assert.strictEqual(findLearningProjects(root).length, 2);
});
