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

  // checkpoint/ used to scaffold empty with no hint of the expected test
  // strategy — a stub README orients without prescribing a specific runner.
  assert.ok(fs.existsSync(path.join(dir, "checkpoint", "README.md")));
  assert.match(fs.readFileSync(path.join(dir, "checkpoint", "README.md"), "utf8"), /ai-learn verify/);
  assert.ok(created.includes("checkpoint/README.md"));
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

  // The friction journal ships with every project — the AI's channel to log
  // unexpected tool behavior for the maintainer.
  const dogfoodPath = path.join(dir, ".ai-learn", "dogfood.md");
  assert.ok(fs.existsSync(dogfoodPath));
  assert.match(fs.readFileSync(dogfoodPath, "utf8"), /Journal de friction/);
  assert.ok(created.includes(".ai-learn/dogfood.md"));

  // Codex's mechanical guard: a sandbox permissions profile denying writes to
  // src/** (see bin/lib/platforms/codex-guard.js), wired alongside Claude's.
  const codexConfigPath = path.join(dir, ".codex", "config.toml");
  assert.ok(fs.existsSync(codexConfigPath));
  assert.match(fs.readFileSync(codexConfigPath, "utf8"), /"src\/\*\*" = "deny"/);
  assert.ok(created.includes(".codex/config.toml"));

  // The clean-code norm config — auto-created once, generic defaults for a
  // fresh project with no source files yet to detect a stack from.
  const normConfigPath = path.join(dir, ".ai-learn", "norm.json");
  assert.ok(fs.existsSync(normConfigPath));
  assert.ok(created.includes(".ai-learn/norm.json"));
  const normConfig = readJson(normConfigPath, null);
  assert.strictEqual(normConfig.maxFunctionLines, 50);

  // The prediction journal's source of truth (story 01.03) — created empty,
  // versioned like every other data file the tool scaffolds.
  const predictionsDataPath = path.join(dir, ".ai-learn", "predictions.json");
  assert.ok(fs.existsSync(predictionsDataPath));
  assert.ok(created.includes(".ai-learn/predictions.json"));
  const predictionsData = readJson(predictionsDataPath, null);
  assert.deepStrictEqual(predictionsData, { version: 1, entries: [] });
});

test("init writes the detected stack's norm thresholds when real source already exists (ex. a scan-based init)", () => {
  const dir = tmpDir();
  fs.mkdirSync(path.join(dir, "src"), { recursive: true });
  fs.writeFileSync(path.join(dir, "Makefile"), "CC=gcc\n");
  fs.writeFileSync(path.join(dir, "src", "main.c"), "int main(void) {\n  return 0;\n}\n");

  scaffold({ dir, project: "demo", technology: "C", docSource: null, phases: [] });

  const normConfig = readJson(path.join(dir, ".ai-learn", "norm.json"), null);
  assert.strictEqual(normConfig.maxFunctionLines, 30);
  assert.strictEqual(normConfig.maxParams, 4);
});

test("init never overwrites an existing dogfood journal", () => {
  const dir = tmpDir();
  scaffold({ dir, project: "demo", technology: "Fastify", docSource: null, phases: [] });

  const dogfoodPath = path.join(dir, ".ai-learn", "dogfood.md");
  fs.writeFileSync(dogfoodPath, "### low — déjà noté\n- Surface : next\n");

  scaffold({ dir, project: "demo", technology: "Fastify", docSource: null, phases: [] });

  assert.strictEqual(fs.readFileSync(dogfoodPath, "utf8"), "### low — déjà noté\n- Surface : next\n");
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

test("init never touches any real home directory when --platform is omitted", () => {
  // scaffold() must be a pure function of its explicit inputs — no ambient
  // env-var detection inside it (that belongs to the CLI entry point only).
  // Otherwise every test calling scaffold() would silently install real
  // commands into the machine's actual ~/.claude, ~/.codex, etc.
  const dir = tmpDir();
  const { created, platform } = scaffold({ dir, project: "demo", technology: "Go", docSource: null, phases: [] });

  assert.strictEqual(platform, null);
  assert.ok(!created.some((f) => f.includes(".codex/prompts") || f.includes(".gemini/commands")));
});

test("init installs the given platform's slash commands into an isolated home", () => {
  const dir = tmpDir();
  const home = tmpDir();
  const original = { HOME: process.env.HOME, USERPROFILE: process.env.USERPROFILE };
  // os.homedir() reads USERPROFILE on Windows, not HOME — set both so this
  // isolates on every platform.
  process.env.HOME = home;
  process.env.USERPROFILE = home;

  try {
    const { platform } = scaffold({ dir, project: "demo", technology: "Go", docSource: null, phases: [], platform: "codex" });
    assert.strictEqual(platform, "codex");
    assert.ok(fs.existsSync(path.join(home, ".codex", "prompts", "ai-learn-next.md")));
  } finally {
    process.env.HOME = original.HOME;
    process.env.USERPROFILE = original.USERPROFILE;
  }
});

test("init warns but still scaffolds the project on an unknown platform", () => {
  const dir = tmpDir();
  const { created, platform } = scaffold({ dir, project: "demo", technology: "Go", docSource: null, phases: [], platform: "nope" });

  assert.strictEqual(platform, "nope");
  assert.ok(fs.existsSync(path.join(dir, "progress.json")));
  assert.ok(created.includes("progress.json"));
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
