"use strict";

const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const { updateCommand } = require("../bin/lib/update");
const { tmpProject, writeFile, capture } = require("./helpers");

const MARKER = "Instructions pour les agents IA — projet d'apprentissage";

function project(overrides = {}) {
  return {
    version: 1,
    project: "demo",
    technology: "Fastify",
    docSource: null,
    phases: [],
    ...overrides,
  };
}

test("update refreshes a generated AGENTS.md with the current template", () => {
  const dir = tmpProject(project());
  fs.writeFileSync(path.join(dir, "AGENTS.md"), `# ${MARKER}\nOLD PROTOCOL\n`);

  const before = fs.readFileSync(path.join(dir, "progress.json"), "utf8");
  capture(() => updateCommand({ root: dir }));

  const agents = fs.readFileSync(path.join(dir, "AGENTS.md"), "utf8");
  assert.match(agents, /Banque de pièges/);
  assert.match(agents, /Note \/10/);
  assert.match(agents, /L'apprenant tape le code/); // the learner-file block section
  assert.match(agents, /non-collable/); // the gap-reveal rule (Cmd+A paste fails the checkpoint)
  assert.match(agents, /Fastify/); // {{technology}} replaced
  assert.doesNotMatch(agents, /OLD PROTOCOL/);

  assert.strictEqual(fs.readFileSync(path.join(dir, "progress.json"), "utf8"), before);
});

test("update never overwrites a customized AGENTS.md", () => {
  const dir = tmpProject(project());
  fs.writeFileSync(path.join(dir, "AGENTS.md"), "# Custom AGENTS\nMY OWN RULES\n");

  capture(() => updateCommand({ root: dir }));

  assert.strictEqual(fs.readFileSync(path.join(dir, "AGENTS.md"), "utf8"), "# Custom AGENTS\nMY OWN RULES\n");

  const modeFile = path.join(dir, "docs", "plans", "mode-apprentissage.md");
  assert.ok(fs.existsSync(modeFile));
  assert.match(fs.readFileSync(modeFile, "utf8"), /Banque de pièges/);
});

test("update creates AGENTS.md when no protocol file exists", () => {
  const dir = tmpProject(project());

  capture(() => updateCommand({ root: dir }));

  assert.ok(fs.existsSync(path.join(dir, "AGENTS.md")));
  assert.match(fs.readFileSync(path.join(dir, "AGENTS.md"), "utf8"), /Note \/10/);
});

test("update regenerates the traps bank in each project", () => {
  const dir = tmpProject(
    project({
      docSource: { type: "local", sources: [{ name: "fastify-docs", mode: "local", path: "docs/sources/fastify-docs" }] },
    }),
  );
  writeFile(
    dir,
    "docs/sources/fastify-docs/Reference/Routes.md",
    "# Routes\n\n> ⚠ Warning:\n> Do not return undefined from a handler.\n",
  );

  capture(() => updateCommand({ root: dir }));

  const data = JSON.parse(fs.readFileSync(path.join(dir, ".ai-learn", "traps.json"), "utf8"));
  assert.strictEqual(data.traps.length, 1);
  assert.match(data.traps[0].text, /Do not return undefined/);
});

test("update wires the learner-file guard (hook, policy, solutions dir)", () => {
  const dir = tmpProject(project());

  capture(() => updateCommand({ root: dir }));

  const settings = JSON.parse(fs.readFileSync(path.join(dir, ".claude", "settings.json"), "utf8"));
  assert.ok(JSON.stringify(settings).includes("ai-learn.js guard"));
  assert.ok(fs.existsSync(path.join(dir, ".ai-learn", "guard.json")));
  assert.ok(fs.existsSync(path.join(dir, "docs", "solutions", "README.md")));

  // Idempotent: a second update wires nothing new and keeps progress.json intact.
  const before = fs.readFileSync(path.join(dir, ".claude", "settings.json"), "utf8");
  capture(() => updateCommand({ root: dir }));
  assert.strictEqual(fs.readFileSync(path.join(dir, ".claude", "settings.json"), "utf8"), before);
});

test("update creates .ai-learn/norm.json once and never rewrites a learner's edits", () => {
  const dir = tmpProject(project());

  capture(() => updateCommand({ root: dir }));

  const normConfigPath = path.join(dir, ".ai-learn", "norm.json");
  assert.ok(fs.existsSync(normConfigPath));

  fs.writeFileSync(normConfigPath, JSON.stringify({ version: 1, maxFunctionLines: 999 }));
  capture(() => updateCommand({ root: dir }));

  const stillCustom = JSON.parse(fs.readFileSync(normConfigPath, "utf8"));
  assert.strictEqual(stillCustom.maxFunctionLines, 999);
});

test("update backfills the friction journal into a project that predates it", () => {
  const dir = tmpProject(project());

  capture(() => updateCommand({ root: dir }));

  const dogfoodPath = path.join(dir, ".ai-learn", "dogfood.md");
  assert.ok(fs.existsSync(dogfoodPath));
  assert.match(fs.readFileSync(dogfoodPath, "utf8"), /Journal de friction/);
});

test("update never overwrites an existing dogfood journal with real entries", () => {
  const dir = tmpProject(project());
  const dogfoodPath = writeFile(dir, ".ai-learn/dogfood.md", "### medium — déjà noté\n- Surface : verify\n");

  capture(() => updateCommand({ root: dir }));

  assert.strictEqual(fs.readFileSync(dogfoodPath, "utf8"), "### medium — déjà noté\n- Surface : verify\n");
});

test("update backfills the checkpoint/ orientation stub into a project that predates it", () => {
  const dir = tmpProject(project());

  capture(() => updateCommand({ root: dir }));

  const readmePath = path.join(dir, "checkpoint", "README.md");
  assert.ok(fs.existsSync(readmePath));
  assert.match(fs.readFileSync(readmePath, "utf8"), /ai-learn verify/);
});

test("update never overwrites an existing checkpoint/README.md", () => {
  const dir = tmpProject(project());
  const readmePath = writeFile(dir, "checkpoint/README.md", "custom notes");

  capture(() => updateCommand({ root: dir }));

  assert.strictEqual(fs.readFileSync(readmePath, "utf8"), "custom notes");
});

test("update --platform installs that platform's slash commands into an isolated home", () => {
  const dir = tmpProject(project());
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "ai-learn-update-platform-"));
  const original = process.env.HOME;
  process.env.HOME = home;

  try {
    capture(() => updateCommand({ root: dir, platform: "codex" }));
    assert.ok(fs.existsSync(path.join(home, ".codex", "prompts", "ai-learn-next.md")));
  } finally {
    process.env.HOME = original;
  }
});

test("update without --platform never touches any home directory (backward compatible)", () => {
  const dir = tmpProject(project());
  const output = capture(() => updateCommand({ root: dir }));
  assert.doesNotMatch(output, /commandes \/… synchronisées/);
});

test("update warns on an unknown --platform but still syncs the project", () => {
  const dir = tmpProject(project());
  const output = capture(() => updateCommand({ root: dir, platform: "nope" }));
  assert.match(output, /plateforme "nope" inconnue/);
  assert.match(output, /protocol: AGENTS.md/);
});

test("update refreshes a pristine (entry-less) dogfood journal when the template evolves", () => {
  const dir = tmpProject(project());
  const dogfoodPath = writeFile(dir, ".ai-learn/dogfood.md", "# Journal de friction — `ai-learn`\n(vieille version, aucune entrée)\n");

  capture(() => updateCommand({ root: dir }));

  const content = fs.readFileSync(dogfoodPath, "utf8");
  assert.match(content, /Plateforme :/);
  assert.match(content, /Attendu vs réel/);
});

test("update backfills predictions.json onto a project that predates it", () => {
  const dir = tmpProject(project());

  const out = capture(() => updateCommand({ root: dir }));

  const predictionsDataPath = path.join(dir, ".ai-learn", "predictions.json");
  assert.ok(fs.existsSync(predictionsDataPath));
  assert.deepStrictEqual(JSON.parse(fs.readFileSync(predictionsDataPath, "utf8")), { version: 1, entries: [] });
  assert.match(out, /predictions\.json created/);
});

test("update backfilling predictions.json never touches an existing legacy predictions.md, but flags it", () => {
  const dir = tmpProject(project());
  const journal = writeFile(
    dir,
    "docs/plans/predictions.md",
    "# Journal de prédictions\n\n### Phase 0 — prédiction 1/1\n- Prédiction : x\n",
  );
  const before = fs.readFileSync(journal, "utf8");

  const out = capture(() => updateCommand({ root: dir }));

  assert.strictEqual(fs.readFileSync(journal, "utf8"), before);
  assert.match(out, /predictions\.json now takes precedence/);
});

test("update leaves an existing predictions.json untouched", () => {
  const dir = tmpProject(project());
  const dataPath = writeFile(dir, ".ai-learn/predictions.json", `${JSON.stringify({ version: 1, entries: [{ id: "x" }] }, null, 2)}\n`);

  capture(() => updateCommand({ root: dir }));

  assert.deepStrictEqual(JSON.parse(fs.readFileSync(dataPath, "utf8")).entries, [{ id: "x" }]);
});

test("update walks a root and refreshes every learning project", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ai-learn-update-root-"));

  for (const name of ["proj-a", "proj-b"]) {
    const p = path.join(root, name);
    fs.mkdirSync(p, { recursive: true });
    fs.writeFileSync(path.join(p, "progress.json"), `${JSON.stringify(project({ project: name }), null, 2)}\n`);
    fs.writeFileSync(path.join(p, "AGENTS.md"), `# ${MARKER}\nOLD\n`);
  }

  const out = capture(() => updateCommand({ root }));

  assert.match(out, /proj-a/);
  assert.match(out, /proj-b/);

  for (const name of ["proj-a", "proj-b"]) {
    assert.match(fs.readFileSync(path.join(root, name, "AGENTS.md"), "utf8"), /Banque de pièges/);
  }
});
