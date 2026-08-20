"use strict";

const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const { scaffold } = require("../bin/lib/init");
const { readJson } = require("../bin/lib/util");

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "ai-learn-init-"));
}

test("init scaffolds the expected structure", () => {
  const dir = tmpDir();
  const { created } = scaffold({
    dir,
    project: "demo",
    technology: "Fastify",
    docSource: { type: "local", value: "/nope" },
    phases: [],
  });

  assert.ok(fs.existsSync(path.join(dir, "progress.json")));
  assert.ok(fs.existsSync(path.join(dir, "docs", "plans", "plan-apprentissage.md")));
  assert.ok(fs.existsSync(path.join(dir, "docs", "plans", "predictions.md")));
  assert.ok(fs.existsSync(path.join(dir, "checkpoint")));
  assert.ok(fs.existsSync(path.join(dir, ".ai-learn", "runs")));
  assert.ok(created.includes("progress.json"));

  // The learning protocol ships with the tool: written into AGENTS.md at the
  // project root, or docs/plans/ when an AGENTS.md already exists.
  assert.ok(fs.existsSync(path.join(dir, "AGENTS.md")));
  assert.match(fs.readFileSync(path.join(dir, "AGENTS.md"), "utf8"), /prédire avant de révéler/);

  const progress = readJson(path.join(dir, "progress.json"), null);
  assert.strictEqual(progress.version, 1);
  assert.strictEqual(progress.project, "demo");
  assert.strictEqual(progress.technology, "Fastify");
  assert.deepStrictEqual(progress.phases, []);
});

test("init writes the given phases and keeps existing files", () => {
  const dir = tmpDir();
  const phases = [{ id: 0, name: "Mise en route", status: "pending" }];

  scaffold({ dir, project: "demo", technology: "Fastify", docSource: null, phases });

  const progress = readJson(path.join(dir, "progress.json"), null);
  assert.strictEqual(progress.phases.length, 1);
  assert.strictEqual(progress.phases[0].name, "Mise en route");

  // Second run must not overwrite the plan the user may have filled.
  const planPath = path.join(dir, "docs", "plans", "plan-apprentissage.md");
  fs.writeFileSync(planPath, "# custom plan");

  scaffold({ dir, project: "demo", technology: "Fastify", docSource: null, phases: [] });

  assert.strictEqual(fs.readFileSync(planPath, "utf8"), "# custom plan");
  assert.strictEqual(readJson(path.join(dir, "progress.json"), null).phases.length, 1);
});

test("init keeps an existing AGENTS.md and writes the protocol to docs/plans/ instead", () => {
  const dir = tmpDir();
  fs.writeFileSync(path.join(dir, "AGENTS.md"), "# repo rules");

  scaffold({ dir, project: "demo", technology: "Fastify", docSource: null, phases: [] });

  assert.strictEqual(fs.readFileSync(path.join(dir, "AGENTS.md"), "utf8"), "# repo rules");
  assert.ok(fs.existsSync(path.join(dir, "docs", "plans", "mode-apprentissage.md")));
  assert.match(
    fs.readFileSync(path.join(dir, "docs", "plans", "mode-apprentissage.md"), "utf8"),
    /prédire avant de révéler/,
  );
});
