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
