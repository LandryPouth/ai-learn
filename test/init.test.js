"use strict";

const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const { scaffold } = require("../bin/lib/init");
const { readJson } = require("../bin/lib/util");
const { capture, withHome } = require("./helpers");

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
  assert.match(fs.readFileSync(codexConfigPath, "utf8"), /"src" = "deny"/);
  assert.ok(created.includes(".codex/config.toml"));

  // The clean-code norm config — auto-created once, generic defaults for a
  // fresh project with no source files yet to detect a stack from.
  const normConfigPath = path.join(dir, ".ai-learn", "norm.json");
  assert.ok(fs.existsSync(normConfigPath));
  assert.ok(created.includes(".ai-learn/norm.json"));
  const normConfig = readJson(normConfigPath, null);
  assert.strictEqual(normConfig.maxFunctionLines, 50);

  // The mutation testing config — auto-created once, generic defaults
  // (boolean-literal only) for a fresh project with no source files yet to
  // detect a stack from (story 02.02).
  const mutateConfigPath = path.join(dir, ".ai-learn", "mutate.json");
  assert.ok(fs.existsSync(mutateConfigPath));
  assert.ok(created.includes(".ai-learn/mutate.json"));
  const mutateConfig = readJson(mutateConfigPath, null);
  assert.deepStrictEqual(mutateConfig.mutators, ["boolean-literal"]);

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

  const mutateConfig = readJson(path.join(dir, ".ai-learn", "mutate.json"), null);
  assert.deepStrictEqual(mutateConfig.mutators, ["boolean-literal", "comparison-operator"]);
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

test("init writes the platform's native memory file importing AGENTS.md (claude)", () => {
  const dir = tmpDir();
  const home = tmpDir();

  const { created } = withHome(home, () =>
    scaffold({ dir, project: "demo", technology: "Fastify", docSource: null, phases: [], platform: "claude" }),
  );

  const claudePath = path.join(dir, "CLAUDE.md");
  assert.ok(fs.existsSync(claudePath));
  assert.match(fs.readFileSync(claudePath, "utf8"), /^\s*@AGENTS\.md\s*$/m);
  assert.ok(created.includes("CLAUDE.md"));
});

test("init appends only the missing import to a customized CLAUDE.md, idempotently", () => {
  const dir = tmpDir();
  const claudePath = path.join(dir, "CLAUDE.md");
  fs.writeFileSync(claudePath, "# Mes règles\n\n- déjà là\n");

  withHome(tmpDir(), () => {
    scaffold({ dir, project: "demo", technology: "Fastify", docSource: null, phases: [], platform: "claude" });
    scaffold({ dir, project: "demo", technology: "Fastify", docSource: null, phases: [], platform: "claude" });
  });

  const content = fs.readFileSync(claudePath, "utf8");
  assert.ok(content.startsWith("# Mes règles\n\n- déjà là\n"));
  assert.strictEqual((content.match(/^\s*@AGENTS\.md\s*$/gm) || []).length, 1);
});

test("init writes no native memory stub for platforms that read AGENTS.md natively", () => {
  for (const platform of ["codex", "opencode", "cli-nu"]) {
    const dir = tmpDir();

    withHome(tmpDir(), () =>
      scaffold({ dir, project: "demo", technology: "Go", docSource: null, phases: [], platform }),
    );

    assert.ok(!fs.existsSync(path.join(dir, "CLAUDE.md")), `unexpected CLAUDE.md for ${platform}`);
    assert.ok(!fs.existsSync(path.join(dir, "GEMINI.md")), `unexpected GEMINI.md for ${platform}`);
  }
});

test(
  "init does not throw and signal when the native memory file is not writable",
  { skip: typeof process.getuid === "function" && process.getuid() === 0 },
  () => {
    const dir = tmpDir();
    const claudePath = path.join(dir, "CLAUDE.md");
    fs.writeFileSync(claudePath, "# perso\n");
    fs.chmodSync(claudePath, 0o444);

    try {
      const out = capture(() =>
        withHome(tmpDir(), () =>
          scaffold({ dir, project: "demo", technology: "Fastify", docSource: null, phases: [], platform: "claude" }),
        ),
      );

      assert.strictEqual(fs.readFileSync(claudePath, "utf8"), "# perso\n");
      assert.match(out, /CLAUDE\.md non inscriptible/);
    } finally {
      fs.chmodSync(claudePath, 0o644);
    }
  },
);

test("init keeps the learner's existing bytes intact when appending the import", () => {
  const dir = tmpDir();
  const claudePath = path.join(dir, "CLAUDE.md");
  const original = Buffer.concat([Buffer.from("# Règles "), Buffer.from([0xff, 0xfe]), Buffer.from("\n")]);
  fs.writeFileSync(claudePath, original);

  withHome(tmpDir(), () =>
    scaffold({ dir, project: "demo", technology: "Go", docSource: null, phases: [], platform: "claude" }),
  );

  const after = fs.readFileSync(claudePath);
  assert.ok(after.subarray(0, original.length).equals(original));
  assert.match(after.toString("utf8"), /@AGENTS\.md\s*$/);
});

test("init refuses to write through a CLAUDE.md symlink", () => {
  const dir = tmpDir();
  const outside = path.join(tmpDir(), "outside.md");
  fs.writeFileSync(outside, "hors projet\n");

  try {
    fs.symlinkSync(outside, path.join(dir, "CLAUDE.md"));
  } catch {
    return; // symlinks unavailable on this platform
  }

  withHome(tmpDir(), () =>
    scaffold({ dir, project: "demo", technology: "Go", docSource: null, phases: [], platform: "claude" }),
  );

  assert.strictEqual(fs.readFileSync(outside, "utf8"), "hors projet\n");
});

// -----------------------------------------------------------------------
// Story 05.02 — the protocol template's numbered sections, and the targeted
// synthesis format (§1bis) that init must carry into every scaffolded project.
// Structural assertions only: section ids and their order, never the prose.
// -----------------------------------------------------------------------

const PROTOCOL_TEMPLATE = path.join(__dirname, "..", "templates", "AGENTS-apprentissage.md");

function protocolSection(content, id) {
  const start = content.indexOf(`### ${id}.`);
  if (start === -1) {
    return null;
  }

  const rest = content.slice(start + 1);
  const next = rest.search(/^### /m);
  return next === -1 ? content.slice(start) : content.slice(start, start + 1 + next);
}

test("the protocol template keeps its numbered sections present and in order", () => {
  const content = fs.readFileSync(PROTOCOL_TEMPLATE, "utf8");
  const ids = [...content.matchAll(/^###\s+([^\s.]+)\./gm)].map((match) => match[1]);

  assert.deepStrictEqual(ids, ["1", "1bis", "2", "3", "3bis", "3ter", "3quater", "3quinquies", "4", "5"]);
});

test("§1bis enumerates its five synthesis steps in order, between §1 and §2", () => {
  const content = fs.readFileSync(PROTOCOL_TEMPLATE, "utf8");
  const section = protocolSection(content, "1bis");

  assert.ok(section, "§1bis must exist");
  const steps = [...section.matchAll(/^\d+\.\s+\*\*/gm)].map((match) => Number.parseInt(match[0], 10));
  assert.deepStrictEqual(steps, [1, 2, 3, 4, 5]);
});

test("init copies §1bis verbatim into the generated AGENTS.md", () => {
  const dir = tmpDir();
  scaffold({
    dir,
    project: "demo",
    technology: "Fastify",
    docSource: { type: "local", value: "/nope" },
    phases: [],
  });

  const template = fs.readFileSync(PROTOCOL_TEMPLATE, "utf8").replace(/\{\{technology\}\}/g, "Fastify");
  const agents = fs.readFileSync(path.join(dir, "AGENTS.md"), "utf8");

  assert.ok(protocolSection(template, "1bis"));
  assert.strictEqual(protocolSection(agents, "1bis"), protocolSection(template, "1bis"));
});

// -----------------------------------------------------------------------
// Story 05.03 — the protocol makes the three rules verifiable obligations:
// re-read src/** and cite file:line before scoring (§2), reveal from the code
// the learner actually typed (§3), and name a failure case in every prediction
// question (§1). init must carry them into every scaffolded project.
// -----------------------------------------------------------------------

function protocolRules(content) {
  return {
    failureCase: protocolSection(content, "1"),
    rereadBeforeScoring: protocolSection(content, "2"),
    revealFromTypedCode: protocolSection(content, "3"),
  };
}

test("the protocol requires a failure case, a re-read of src/** with file:line, and a reveal from typed code", () => {
  const rules = protocolRules(fs.readFileSync(PROTOCOL_TEMPLATE, "utf8"));

  assert.match(rules.failureCase, /cas d'échec/i);
  assert.match(rules.failureCase, /entrée invalide|ressource absente/i);

  assert.match(rules.rereadBeforeScoring, /Relire `src\/\*\*` avant de noter/);
  assert.match(rules.rereadBeforeScoring, /`fichier:ligne`/);

  assert.match(rules.revealFromTypedCode, /révélation part du code déjà tapé/i);
  assert.match(rules.revealFromTypedCode, /`fichier:ligne`/);
});

test("init carries the three protocol obligations into the generated AGENTS.md", () => {
  const dir = tmpDir();
  scaffold({
    dir,
    project: "demo",
    technology: "Fastify",
    docSource: { type: "local", value: "/nope" },
    phases: [],
  });

  const template = fs.readFileSync(PROTOCOL_TEMPLATE, "utf8").replace(/\{\{technology\}\}/g, "Fastify");
  const agents = fs.readFileSync(path.join(dir, "AGENTS.md"), "utf8");

  assert.deepStrictEqual(protocolRules(agents), protocolRules(template));
});

// -----------------------------------------------------------------------
// Story 05.04 — chat-first revelation: init wires the guard but no longer
// creates docs/solutions/; the protocol forbids solution-shaped extracts
// before the learner has typed or explained anything.
// -----------------------------------------------------------------------

test("init does not create docs/solutions/", () => {
  const dir = tmpDir();
  const { created } = scaffold({
    dir,
    project: "demo",
    technology: "Fastify",
    docSource: { type: "local", value: "/nope" },
    phases: [],
  });

  assert.ok(!fs.existsSync(path.join(dir, "docs", "solutions")));
  assert.ok(!created.some((file) => file.startsWith("docs/solutions/")));
});

test("the protocol forbids solution-shaped extracts before typing and makes docs/solutions optional", () => {
  const template = fs.readFileSync(PROTOCOL_TEMPLATE, "utf8");
  const section1 = protocolSection(template, "1");
  const section3 = protocolSection(template, "3");

  assert.match(section1, /Aucun extrait de la forme de la solution/);
  assert.match(section1, /exemple « officiel » recopié de la doc/);
  assert.match(section3, /par défaut dans le chat/);
  assert.match(section3, /optionnel, à la demande explicite de l'apprenant/);
  assert.match(section3, /init` ne crée plus ce dossier d'office/);
});
