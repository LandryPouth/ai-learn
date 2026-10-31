"use strict";

const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const { updateCommand } = require("../bin/lib/update");
const { tmpProject, writeFile, capture, withHome, sampleProgress } = require("./helpers");
const { verifyCommand } = require("../bin/lib/verify");
const { projectKey } = require("../bin/lib/ledgers");
const { tracksPath: testsLedgerPath } = require("../bin/lib/tracks/tests");

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

  // Story 09.07: `update` only adds `toolVersion` — the phases are untouched.
  assert.deepStrictEqual(
    { ...JSON.parse(fs.readFileSync(path.join(dir, "progress.json"), "utf8")), toolVersion: undefined },
    { ...JSON.parse(before), toolVersion: undefined },
  );
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

test("update wires the learner-file guard (hook, policy, solutions README refresh)", () => {
  const dir = tmpProject(project());
  fs.mkdirSync(path.join(dir, "docs", "solutions"), { recursive: true });

  capture(() => updateCommand({ root: dir }));

  const settings = JSON.parse(fs.readFileSync(path.join(dir, ".claude", "settings.json"), "utf8"));
  assert.ok(
    settings.hooks.PreToolUse.flatMap((entry) => entry.hooks || []).some((h) => /ai-learn\.js["']?\s+guard/.test(h.command)),
  );
  assert.ok(fs.existsSync(path.join(dir, ".ai-learn", "guard.json")));
  assert.ok(fs.existsSync(path.join(dir, "docs", "solutions", "README.md")));

  // Idempotent: a second update wires nothing new and keeps progress.json intact.
  const before = fs.readFileSync(path.join(dir, ".claude", "settings.json"), "utf8");
  capture(() => updateCommand({ root: dir }));
  assert.strictEqual(fs.readFileSync(path.join(dir, ".claude", "settings.json"), "utf8"), before);
});

test("update wires the consultative norm hook and documents the no-hook fallback", () => {
  const dir = tmpProject(project());

  capture(() => updateCommand({ root: dir }));

  const settings = JSON.parse(fs.readFileSync(path.join(dir, ".claude", "settings.json"), "utf8"));
  const ours = (settings.hooks.PostToolUse || []).find((entry) =>
    /ai-learn\.js\\?"? norm --hook/.test(JSON.stringify(entry)),
  );
  assert.ok(ours, "a PostToolUse norm hook is wired");
  assert.match(ours.matcher, /Write/);
  assert.match(fs.readFileSync(path.join(dir, "AGENTS.md"), "utf8"), /après chaque brique/);

  // Idempotent: a second update adds nothing and keeps settings.json intact.
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

test("update creates .ai-learn/mutate.json once and never rewrites a learner's edits", () => {
  const dir = tmpProject(project());

  capture(() => updateCommand({ root: dir }));

  const mutateConfigPath = path.join(dir, ".ai-learn", "mutate.json");
  assert.ok(fs.existsSync(mutateConfigPath));

  fs.writeFileSync(mutateConfigPath, JSON.stringify({ version: 1, mutators: ["boolean-literal"], maxMutantsPerRun: 5, ignore: [] }));
  capture(() => updateCommand({ root: dir }));

  const stillCustom = JSON.parse(fs.readFileSync(mutateConfigPath, "utf8"));
  assert.strictEqual(stillCustom.maxMutantsPerRun, 5);
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
  const original = { HOME: process.env.HOME, USERPROFILE: process.env.USERPROFILE };
  // os.homedir() reads USERPROFILE on Windows, not HOME — set both so this
  // isolates on every platform.
  process.env.HOME = home;
  process.env.USERPROFILE = home;

  try {
    capture(() => updateCommand({ root: dir, platform: "codex" }));
    assert.ok(fs.existsSync(path.join(home, ".codex", "skills", "ai-learn-learn-next", "SKILL.md")));
  } finally {
    process.env.HOME = original.HOME;
    process.env.USERPROFILE = original.USERPROFILE;
  }
});

test("update --platform migrates a pre-04.05 install to skills, without any alias skill", () => {
  const dir = tmpProject(project());
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "ai-learn-update-migration-"));
  const original = { HOME: process.env.HOME, USERPROFILE: process.env.USERPROFILE };
  // A project scaffolded before story 04.05: only the old codex prompt exists,
  // carrying the old canonical body. Its bytes predate the current legacy
  // renderer, so install.js conservatively keeps it (it cannot prove it is
  // ours). Since story 10.01 no alias skill is installed at all.
  writeFile(home, ".codex/prompts/ai-learn-next.md", "---\ndescription: \"Prochaine phase à faire\"\n---\n\nExécute `ai-learn next`.\n");
  process.env.HOME = home;
  process.env.USERPROFILE = home;

  try {
    capture(() => updateCommand({ root: dir, platform: "codex" }));

    const skills = path.join(home, ".codex", "skills");
    assert.ok(fs.existsSync(path.join(skills, "ai-learn-learn-next", "SKILL.md")), "the new name is installed");

    assert.ok(!fs.existsSync(path.join(skills, "ai-learn-next")), "the deprecated alias is gone");

    assert.ok(fs.existsSync(path.join(home, ".codex", "prompts", "ai-learn-next.md")), "an unrecognised old file is kept, never silently deleted");
  } finally {
    process.env.HOME = original.HOME;
    process.env.USERPROFILE = original.USERPROFILE;
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

test("update backfills a missing CLAUDE.md without touching a customized AGENTS.md", () => {
  const dir = tmpProject(project());
  const agentsPath = writeFile(dir, "AGENTS.md", "# Custom AGENTS\nMY OWN RULES\n");

  const out = capture(() => updateCommand({ root: dir, platform: "claude" }));

  assert.strictEqual(fs.readFileSync(agentsPath, "utf8"), "# Custom AGENTS\nMY OWN RULES\n");

  const claudePath = path.join(dir, "CLAUDE.md");
  assert.ok(fs.existsSync(claudePath));
  assert.match(fs.readFileSync(claudePath, "utf8"), /^\s*@AGENTS\.md\s*$/m);
  assert.match(out, /native memory: CLAUDE\.md created/);
});

test("update appends only the missing import to a customized CLAUDE.md, idempotently", () => {
  const dir = tmpProject(project());
  const claudePath = writeFile(dir, "CLAUDE.md", "# Mes règles\n- déjà là\n");

  capture(() => updateCommand({ root: dir, platform: "claude" }));
  capture(() => updateCommand({ root: dir, platform: "claude" }));

  const content = fs.readFileSync(claudePath, "utf8");
  assert.ok(content.startsWith("# Mes règles\n- déjà là\n"));
  assert.strictEqual((content.match(/^\s*@AGENTS\.md\s*$/gm) || []).length, 1);
});

test("update writes no native memory stub for a platform that reads AGENTS.md natively", () => {
  const dir = tmpProject(project());

  withHome(fs.mkdtempSync(path.join(os.tmpdir(), "ai-learn-update-home-")), () =>
    capture(() => updateCommand({ root: dir, platform: "codex" })),
  );

  assert.ok(!fs.existsSync(path.join(dir, "CLAUDE.md")));
  assert.ok(!fs.existsSync(path.join(dir, "GEMINI.md")));
});

test("update never deletes an existing docs/solutions reveal", () => {
  const dir = tmpProject(project());
  writeFile(dir, "docs/solutions/routes.md", "# Routes\n\nconst handler = ...;\n");

  capture(() => updateCommand({ root: dir }));

  assert.strictEqual(
    fs.readFileSync(path.join(dir, "docs", "solutions", "routes.md"), "utf8"),
    "# Routes\n\nconst handler = ...;\n",
  );
});

test("update does not create docs/solutions/ on a project that has none", () => {
  const dir = tmpProject(project());

  capture(() => updateCommand({ root: dir }));

  assert.ok(!fs.existsSync(path.join(dir, "docs", "solutions")));
});

// Story 09.01 — update catches up a proven project that no ledger knows (its
// verify ran where the ledgers could not be written), once.
function provenElsewhere() {
  const dir = tmpProject(sampleProgress());
  const elsewhere = fs.mkdtempSync(path.join(os.tmpdir(), "ai-learn-update-elsewhere-"));
  capture(() => verifyCommand({ dir, phaseId: 0, home: elsewhere }));
  return dir;
}

test("update replays a proven project missing from the ledgers, then leaves it alone", () => {
  const dir = provenElsewhere();
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "ai-learn-update-home-"));

  const first = capture(() => updateCommand({ root: dir, home }));
  assert.match(first, /ledgers: 1 preuve\(s\) rejouée\(s\)/);
  assert.ok(JSON.parse(fs.readFileSync(testsLedgerPath({ home }), "utf8")).projects[projectKey(dir)]);

  const second = capture(() => updateCommand({ root: dir, home }));
  assert.match(second, /ledgers: à jour/);
});

test("update never overwrites an unreadable ledger and says so", () => {
  const dir = provenElsewhere();
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "ai-learn-update-home-"));
  writeFile(home, ".ai-learn/tracks/tests.json", "{ not json");

  const out = capture(() => updateCommand({ root: dir, home }));

  assert.strictEqual(fs.readFileSync(testsLedgerPath({ home }), "utf8"), "{ not json");
  assert.match(out, /ledger illisible, laissé intact : tracks\/tests\.json/);
});

function setHook(dir, event, command) {
  const file = path.join(dir, ".claude", "settings.json");
  const settings = JSON.parse(fs.readFileSync(file, "utf8"));
  const entry = settings.hooks[event].find((e) => e.hooks.some((h) => /ai-learn\.js/.test(h.command)));
  entry.hooks.find((h) => /ai-learn\.js/.test(h.command)).command = command;
  fs.writeFileSync(file, JSON.stringify(settings));
}

function hookCommands(dir, event) {
  const settings = JSON.parse(fs.readFileSync(path.join(dir, ".claude", "settings.json"), "utf8"));
  return settings.hooks[event].flatMap((e) => e.hooks).map((h) => h.command);
}

test("update repoints a dead hook to the current tool", () => {
  const dir = tmpProject(project());
  capture(() => updateCommand({ root: dir }));
  const dead = path.join(dir, "gone", "ai-learn.js");
  setHook(dir, "PreToolUse", `node "${dead}" guard`);
  setHook(dir, "PostToolUse", `node "${dead}" norm --hook`);

  capture(() => updateCommand({ root: dir }));

  const tool = path.join(__dirname, "..", "bin", "ai-learn.js");
  assert.ok(hookCommands(dir, "PreToolUse").includes(`node "${tool}" guard`));
  assert.ok(hookCommands(dir, "PostToolUse").includes(`node "${tool}" norm --hook`));
  assert.ok(!JSON.stringify(hookCommands(dir, "PreToolUse")).includes("gone"));
});

test("update keeps a hook pointing at another live install", () => {
  const dir = tmpProject(project());
  capture(() => updateCommand({ root: dir }));
  const other = path.join(dir, "other-install", "ai-learn.js");
  writeFile(dir, "other-install/ai-learn.js", "");
  setHook(dir, "PreToolUse", `node "${other}" guard`);
  setHook(dir, "PostToolUse", `node "${other}" norm --hook`);

  capture(() => updateCommand({ root: dir }));

  assert.ok(hookCommands(dir, "PreToolUse").includes(`node "${other}" guard`));
  assert.ok(hookCommands(dir, "PostToolUse").includes(`node "${other}" norm --hook`));
});

test("update re-quotes a live unquoted norm hook without repointing it", () => {
  const dir = tmpProject(project());
  capture(() => updateCommand({ root: dir }));
  const other = path.join(dir, "other install", "ai-learn.js");
  writeFile(dir, "other install/ai-learn.js", "");
  setHook(dir, "PostToolUse", `node ${other} norm --hook`);

  capture(() => updateCommand({ root: dir }));

  assert.ok(hookCommands(dir, "PostToolUse").includes(`node "${other}" norm --hook`));
});

test("update completes gitignore without touching custom lines", () => {
  const { ensureGitignore } = require("../bin/lib/gitignore");
  const dir = fs.mkdtempSync(path.join(require("os").tmpdir(), "ai-learn-gi-"));
  const file = path.join(dir, ".gitignore");
  fs.writeFileSync(file, "mon-secret.txt\r\nnode_modules/\r\n");
  assert.strictEqual(ensureGitignore(dir), "updated");
  const text = fs.readFileSync(file, "utf8");
  assert.ok(text.startsWith("mon-secret.txt\r\nnode_modules/\r\n"));
  assert.strictEqual(text.match(/node_modules\//g).length, 1);
  assert.match(text, /\.env\r\n/);
  assert.strictEqual(ensureGitignore(dir), "unchanged");
});

test("ensureGitignore keeps CRLF line endings", () => {
  const { ensureGitignore } = require("../bin/lib/gitignore");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ai-learn-crlf-"));
  const file = path.join(dir, ".gitignore");
  fs.writeFileSync(file, "perso\r\n");
  ensureGitignore(dir);
  const text = fs.readFileSync(file, "utf8");
  assert.match(text, /node_modules\/\r\n/);
  assert.doesNotMatch(text.replace(/\r\n/g, ""), /\n/);
});

test("update adds Read to the norm hook matcher", () => {
  const dir = tmpProject(project());
  capture(() => updateCommand({ root: dir }));
  const settingsPath = path.join(dir, ".claude", "settings.json");
  const settings = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
  const ours = settings.hooks.PostToolUse.find((e) => /norm --hook/.test(JSON.stringify(e)));
  ours.matcher = "Write|Edit|MultiEdit";
  settings.hooks.PostToolUse.push({ matcher: "Bash", hooks: [{ type: "command", command: "other-post" }] });
  fs.writeFileSync(settingsPath, JSON.stringify(settings));

  capture(() => updateCommand({ root: dir }));

  const after = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
  assert.strictEqual(after.hooks.PostToolUse.find((e) => /norm --hook/.test(JSON.stringify(e))).matcher, "Write|Edit|MultiEdit|Read");
  assert.ok(after.hooks.PostToolUse.some((e) => e.matcher === "Bash"));
});
