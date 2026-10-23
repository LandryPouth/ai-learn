"use strict";

// `bin/lib/status.js` — mainly the new git/gh cross-project summary
// (`printGitTracksSummary`), additive and read-only. Injected `home`
// throughout so the real `$HOME` is never touched.

const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const {
  statusCommand,
  buildStatusReport,
  printGitTracksSummary,
  printDomainSummary,
  printNormSummary,
  formatMutationLine,
  mutationSummary,
} = require("../bin/lib/status");
const { verifyCommand } = require("../bin/lib/verify");
const { defaultGitTracks, writeGitTracks } = require("../bin/lib/tracks/git");
const { defaultDomainLedger, writeDomainLedger } = require("../bin/lib/tracks/domain");
const { loadStack } = require("../bin/lib/scan");
const { capture, sampleProgress, tmpProject, writeFile } = require("./helpers");

function tmpHome() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "ai-learn-status-home-"));
}

// A checkpoint that fails when the mutated literal flips — the one mutant
// found (`src/index.js`'s `true`) is killed, so a real `verify` run marks
// the phase done and writes `mutation.ok: true` in its evidence (same
// fixtures as test/verify.test.js).
const STRONG_CHECKPOINT = "node -e \"const { isReady } = require('./src/index.js'); if (isReady() !== true) process.exit(1)\"";

function mutationPhase(overrides = {}) {
  return sampleProgress({
    phases: [
      {
        id: 0,
        name: "Phase zero",
        status: "pending",
        checkpoint: STRONG_CHECKPOINT,
        artifacts: [],
        predictionsRequired: 0,
        mutation: true,
        ...overrides,
      },
    ],
  });
}

function latestEvidenceFile(dir) {
  const runsDirPath = path.join(dir, ".ai-learn", "runs");
  const runFile = fs.readdirSync(runsDirPath).find((f) => f.endsWith("-verify.json"));
  return path.join(runsDirPath, runFile);
}

test("printGitTracksSummary is silent when no ledger exists yet", () => {
  const home = tmpHome();
  const out = capture(() => printGitTracksSummary({ home }));
  assert.strictEqual(out, "");
});

test("printGitTracksSummary reports achieved and missing tiers", () => {
  const home = tmpHome();
  const config = defaultGitTracks();
  config.tiers["1"].achieved = true;
  config.tiers["3"].achieved = true;
  writeGitTracks(config, { home });

  const out = capture(() => printGitTracksSummary({ home }));
  assert.match(out, /Tiers atteints : 1, 3/);
  assert.match(out, /Tiers restants\s+: 2, 4, 5, 6/);
});

test("printGitTracksSummary reports full mastery once every tier is achieved", () => {
  const home = tmpHome();
  const config = defaultGitTracks();
  for (const tier of Object.keys(config.tiers)) {
    config.tiers[tier].achieved = true;
  }
  writeGitTracks(config, { home });

  const out = capture(() => printGitTracksSummary({ home }));
  assert.match(out, /Tous les tiers sont atteints\./);
});

test("statusCommand includes the git/gh summary when a ledger exists for the injected home", () => {
  const dir = tmpProject(sampleProgress());
  const home = tmpHome();
  const config = defaultGitTracks();
  config.tiers["2"].achieved = true;
  writeGitTracks(config, { home });

  const out = capture(() => statusCommand({ dir, home }));
  assert.match(out, /Phases: 0\/1 done/);
  assert.match(out, /Git\/gh — maîtrise cross-projet/);
  assert.match(out, /Tiers atteints : 2/);
});

test("statusCommand omits the git/gh summary entirely when no ledger exists", () => {
  const dir = tmpProject(sampleProgress());
  const home = tmpHome();

  const out = capture(() => statusCommand({ dir, home }));
  assert.doesNotMatch(out, /Git\/gh/);
});

test("printDomainSummary is silent when no ledger exists for the detected stack", () => {
  const dir = tmpProject(sampleProgress()); // no src/ — detected stack is generic
  const home = tmpHome();
  const out = capture(() => printDomainSummary({ dir, home }));
  assert.strictEqual(out, "");
});

test("printDomainSummary reports partial coverage, keyed by the real detected stack", () => {
  const dir = tmpProject(sampleProgress());
  writeFile(dir, "src/index.js", 'app.get("/x", async (req, res) => { await Promise.resolve(); res.json({}); });\n');
  const home = tmpHome();

  const bank = loadStack("javascript").concepts;
  const config = defaultDomainLedger("javascript");
  config.concepts[bank[0].id] = { achieved: true, tier: bank[0].tier, firstProject: dir, evidenceDate: "2026-01-01T00:00:00.000Z" };
  writeDomainLedger(config, { home });

  const out = capture(() => printDomainSummary({ dir, home }));
  assert.match(out, /Maîtrise de domaine \(javascript\)/);
  assert.match(out, new RegExp(`1/${bank.length} concept\\(s\\)`));
});

test("printDomainSummary reports Expert once every bank concept is achieved", () => {
  const dir = tmpProject(sampleProgress());
  writeFile(dir, "src/index.js", 'app.get("/x", async (req, res) => { await Promise.resolve(); res.json({}); });\n');
  const home = tmpHome();

  const bank = loadStack("javascript").concepts;
  const config = defaultDomainLedger("javascript");
  for (const concept of bank) {
    config.concepts[concept.id] = { achieved: true, tier: concept.tier, firstProject: dir, evidenceDate: "2026-01-01T00:00:00.000Z" };
  }
  writeDomainLedger(config, { home });

  const out = capture(() => printDomainSummary({ dir, home }));
  assert.match(out, /Statut : Expert/);
});

test("printNormSummary is silent when there is no violation", () => {
  const dir = tmpProject(sampleProgress());
  writeFile(dir, "src/index.js", "function fine() {\n  return 1;\n}\n");

  const out = capture(() => printNormSummary({ dir }));
  assert.strictEqual(out, "");
});

test("printNormSummary reports a violation count when the norm is broken", () => {
  const dir = tmpProject(sampleProgress());
  writeFile(dir, ".ai-learn/norm.json", JSON.stringify({ version: 1, maxFunctionLines: 3 }));
  writeFile(
    dir,
    "src/index.js",
    "function tooLong() {\n  const a = 1;\n  const b = 2;\n  const c = 3;\n  return a + b + c;\n}\n",
  );

  const out = capture(() => printNormSummary({ dir }));
  assert.match(out, /Norme \(clean code\) : 1 violation\(s\)/);
});

test("statusCommand includes the norm summary when a violation exists, even without ever running `ai-learn norm` first", () => {
  const dir = tmpProject(sampleProgress());
  const home = tmpHome();
  writeFile(dir, ".ai-learn/norm.json", JSON.stringify({ version: 1, maxFunctionLines: 3 }));
  writeFile(
    dir,
    "src/index.js",
    "function tooLong() {\n  const a = 1;\n  const b = 2;\n  const c = 3;\n  return a + b + c;\n}\n",
  );

  const out = capture(() => statusCommand({ dir, home }));
  assert.match(out, /Norme \(clean code\) : 1 violation\(s\)/);
});

test("status displays the stale state for a phase whose proof no longer covers the code (shared verdict function)", () => {
  const dir = tmpProject(sampleProgress());
  writeFile(dir, "src/index.js", "console.log('hi');\n");

  capture(() => verifyCommand({ dir, phaseId: 0 }));
  writeFile(dir, "src/index.js", "console.log('changed');\n");

  const home = tmpHome();
  const out = capture(() => statusCommand({ dir, home }));
  assert.match(out, /⚠ Phase 0 — Phase zero.*périmé/);
});

// Found in review (story 01.01): the stale label named the state but not
// what to do about it, unlike check.js/next.js which both name the exact
// command — spec.md's UX Note requires a périmé state to say what to do.
test("status's stale label names the bulk verify command to re-prove stale phases", () => {
  const dir = tmpProject(sampleProgress());
  writeFile(dir, "src/index.js", "console.log('hi');\n");

  capture(() => verifyCommand({ dir, phaseId: 0 }));
  writeFile(dir, "src/index.js", "console.log('changed');\n");

  const home = tmpHome();
  const out = capture(() => statusCommand({ dir, home }));
  assert.match(out, /ai-learn verify --stale/);
  assert.doesNotMatch(out, /ai-learn verify \d/);
});

test("status marks a stale phase in ledger order without reordering the following phase", () => {
  const dir = tmpProject(
    sampleProgress({
      phases: [
        { id: 0, name: "Zero", status: "done", checkpoint: "node -e \"\"", artifacts: [], predictionsRequired: 0 },
        { id: 1, name: "One", status: "pending", checkpoint: "node -e \"\"", artifacts: [], predictionsRequired: 0 },
      ],
    }),
  );
  writeFile(dir, "src/index.js", "console.log('hi');\n");

  capture(() => verifyCommand({ dir, phaseId: 0 }));
  writeFile(dir, "src/index.js", "console.log('changed');\n");

  const home = tmpHome();
  const out = capture(() => statusCommand({ dir, home }));

  assert.match(out, /⚠ Phase 0 — Zero.*périmé/);
  assert.ok(out.indexOf("Phase 0") < out.indexOf("Phase 1"));
});

test("statusCommand includes the domain summary alongside the git/gh one", () => {
  const dir = tmpProject(sampleProgress());
  writeFile(dir, "src/index.js", 'app.get("/x", async (req, res) => { await Promise.resolve(); res.json({}); });\n');
  const home = tmpHome();

  const bank = loadStack("javascript").concepts;
  const config = defaultDomainLedger("javascript");
  config.concepts[bank[0].id] = { achieved: true, tier: bank[0].tier, firstProject: dir, evidenceDate: "2026-01-01T00:00:00.000Z" };
  writeDomainLedger(config, { home });

  const out = capture(() => statusCommand({ dir, home }));
  assert.match(out, /Maîtrise de domaine \(javascript\)/);
});

// Non-regression: the text renderer must be byte-identical to before --json
// existed (story 01.05, plan.md's "sortie texte inchangée").
test("the text output is unchanged when --json is not passed", () => {
  const dir = tmpProject(sampleProgress());
  const home = tmpHome();

  const out = capture(() => statusCommand({ dir, home }));

  assert.match(out, /^Project: demo · Node\n/);
  assert.match(out, /Phases: 0\/1 done/);
  assert.doesNotMatch(out, /[{}[\]]/); // no stray JSON leaking into the text path
});

test("status --json expose le verdict par phase", () => {
  const dir = tmpProject(sampleProgress());
  writeFile(dir, "src/index.js", "console.log('hi');\n");
  capture(() => verifyCommand({ dir, phaseId: 0 }));

  const out = capture(() => statusCommand({ dir, json: true }));
  const parsed = JSON.parse(out);

  assert.strictEqual(parsed.version, 1);
  assert.strictEqual(parsed.phases.length, 1);
  assert.strictEqual(parsed.phases[0].verdict, "proven");
  assert.notStrictEqual(process.exitCode, 1);
});

test("status --json marks a stale phase, same as the text label", () => {
  const dir = tmpProject(sampleProgress());
  writeFile(dir, "src/index.js", "console.log('hi');\n");
  capture(() => verifyCommand({ dir, phaseId: 0 }));
  writeFile(dir, "src/index.js", "console.log('changed');\n");

  const out = capture(() => statusCommand({ dir, json: true }));
  const parsed = JSON.parse(out);

  assert.strictEqual(parsed.phases[0].verdict, "stale");
});

test("status --json on a missing progress.json is a JSON error object, not a crash, and exits 1 like text mode", () => {
  const empty = fs.mkdtempSync(path.join(os.tmpdir(), "ai-learn-status-empty-"));

  const out = capture(() => statusCommand({ dir: empty, json: true }));
  const parsed = JSON.parse(out);

  assert.strictEqual(parsed.version, 1);
  assert.match(parsed.error, /No progress\.json/);
  assert.strictEqual(process.exitCode, 1);
  process.exitCode = 0;
});

test("buildStatusReport normalizes the dir path", () => {
  const dir = tmpProject(sampleProgress());
  const report = buildStatusReport(dir);
  assert.doesNotMatch(report.dir, /\\/);
});

// ---------------------------------------------------------------------------
// formatMutationLine / mutationSummary (story 02.04) — pure-calc unit tests,
// same discipline as mutate.js#mutationReport's own unit tests: exercise the
// formatting/shape logic directly, independent of the real mutation engine.
// ---------------------------------------------------------------------------

test("formatMutationLine renders the score, killed and total mutants for a measured phase", () => {
  const phase = { mutation: true };
  const ev = { mutation: { required: true, ok: false, mutants: 5, killed: 4, survived: [{}], score: 80 } };

  assert.strictEqual(formatMutationLine(phase, ev), "mutation : 80 % (4 tués / 5)");
});

test("formatMutationLine reports \"aucun site mutable\" when the measured evidence found zero sites", () => {
  const phase = { mutation: true };
  const ev = { mutation: { required: true, ok: true, mutants: 0, killed: 0, survived: [], score: null } };

  assert.strictEqual(formatMutationLine(phase, ev), "mutation : aucun site mutable");
});

test("formatMutationLine is null for a phase without phase.mutation, even with a mutation evidence present", () => {
  const ev = { mutation: { required: true, ok: true, mutants: 1, killed: 1, survived: [], score: 100 } };
  assert.strictEqual(formatMutationLine({ mutation: undefined }, ev), null);
  assert.strictEqual(formatMutationLine({ mutation: false }, ev), null);
});

test("formatMutationLine is null when there is no evidence at all (phase never verified)", () => {
  assert.strictEqual(formatMutationLine({ mutation: true }, null), null);
});

test("formatMutationLine is null for evidence written before this story (ev.mutation absent, retro-compat)", () => {
  assert.strictEqual(formatMutationLine({ mutation: true }, { ok: true }), null);
});

test("formatMutationLine is null when the evidence's mutation section was never required (predates phase.mutation)", () => {
  const ev = { mutation: { required: false, ok: true, mutants: 0, killed: 0, survived: [], score: null } };
  assert.strictEqual(formatMutationLine({ mutation: true }, ev), null);
});

test("mutationSummary is null for a phase without phase.mutation", () => {
  assert.strictEqual(mutationSummary({ mutation: false }, null), null);
});

test("mutationSummary reshapes the measured evidence into the stable --json schema", () => {
  const phase = { mutation: true };
  const ev = { mutation: { required: true, ok: false, mutants: 5, killed: 4, survived: [{}], score: 80 } };

  assert.deepStrictEqual(mutationSummary(phase, ev), { required: true, score: 80, killed: 4, mutants: 5 });
});

test("mutationSummary returns a stable unmeasured shape (never half-filled) when mutation is required but never measured", () => {
  assert.deepStrictEqual(mutationSummary({ mutation: true }, null), { required: true, score: null, killed: 0, mutants: 0 });
});

// ---------------------------------------------------------------------------
// Integration — real `verify` evidence read back through `status`.
// ---------------------------------------------------------------------------

test("status displays the mutation score line for a phase proven by a real verify run", () => {
  const dir = tmpProject(mutationPhase());
  writeFile(dir, "src/index.js", "function isReady() {\n  return true;\n}\nmodule.exports = { isReady };\n");
  capture(() => verifyCommand({ dir, phaseId: 0 }));

  const home = tmpHome();
  const out = capture(() => statusCommand({ dir, home }));

  assert.match(out, /mutation : 100 % \(1 tués \/ 1\)/);
});

test("status shows \"aucun site mutable\" when the phase's scope has no mutable site", () => {
  const dir = tmpProject(mutationPhase({ checkpoint: 'node -e "process.exit(0)"' }));
  writeFile(dir, "src/index.js", "module.exports = { x: 1 };\n");
  capture(() => verifyCommand({ dir, phaseId: 0 }));

  const home = tmpHome();
  const out = capture(() => statusCommand({ dir, home }));

  assert.match(out, /mutation : aucun site mutable/);
});

test("status shows no mutation line for a phase without phase.mutation", () => {
  const dir = tmpProject(sampleProgress());
  writeFile(dir, "src/index.js", "console.log('hi');\n");
  capture(() => verifyCommand({ dir, phaseId: 0 }));

  const home = tmpHome();
  const out = capture(() => statusCommand({ dir, home }));

  assert.doesNotMatch(out, /mutation :/);
});

test("status shows no mutation line for a phase never yet verified (pending, mutation required)", () => {
  const dir = tmpProject(mutationPhase());

  const home = tmpHome();
  const out = capture(() => statusCommand({ dir, home }));

  assert.doesNotMatch(out, /mutation :/);
});

test("status shows no mutation line for retro-compat evidence written before this story", () => {
  const dir = tmpProject(sampleProgress());
  writeFile(dir, "src/index.js", "console.log('hi');\n");
  capture(() => verifyCommand({ dir, phaseId: 0 }));

  // Simulate a learner turning on `mutation: true` after the fact, on a
  // phase whose only passing evidence predates story 02.03 (no `mutation`
  // key at all) — never treated as an error nor as a misleading 0%.
  const { config } = require("../bin/lib/progress").readProgress(dir);
  config.phases[0].mutation = true;
  fs.writeFileSync(path.join(dir, "progress.json"), `${JSON.stringify(config, null, 2)}\n`);

  const evidencePath = latestEvidenceFile(dir);
  const evidence = JSON.parse(fs.readFileSync(evidencePath, "utf8"));
  delete evidence.mutation;
  fs.writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`);

  const home = tmpHome();
  const out = capture(() => statusCommand({ dir, home }));

  assert.doesNotMatch(out, /mutation :/);
});

test("status --json includes the mutation summary, matching the evidence exactly", () => {
  const dir = tmpProject(mutationPhase());
  writeFile(dir, "src/index.js", "function isReady() {\n  return true;\n}\nmodule.exports = { isReady };\n");
  capture(() => verifyCommand({ dir, phaseId: 0 }));

  const out = capture(() => statusCommand({ dir, json: true }));
  const parsed = JSON.parse(out);

  assert.deepStrictEqual(parsed.phases[0].mutation, { required: true, score: 100, killed: 1, mutants: 1 });
});

test("status --json has mutation: null for a phase without phase.mutation", () => {
  const dir = tmpProject(sampleProgress());
  writeFile(dir, "src/index.js", "console.log('hi');\n");
  capture(() => verifyCommand({ dir, phaseId: 0 }));

  const out = capture(() => statusCommand({ dir, json: true }));
  const parsed = JSON.parse(out);

  assert.strictEqual(parsed.phases[0].mutation, null);
});

// -----------------------------------------------------------------------
// Dirigeant review summary (story 03.03).
// -----------------------------------------------------------------------

test("status counts the missing dirigeant reviews of done phases", () => {
  const progress = sampleProgress();
  progress.phases[0].status = "done";
  const dir = tmpProject(progress);
  writeFile(dir, ".ai-learn/guard.json", JSON.stringify({ version: 1, mode: "dirigeant" }));
  writeFile(dir, "src/index.js", "const one = 1;\nconst two = 2;\n");

  const out = capture(() => statusCommand({ dir, home: tmpHome() }));
  assert.match(out, /Revues \(mode dirigeant\) : 0\/1 valide\(s\) — 1 à revoir : docs\/reviews\/phase-zero\.md \(manquante\)/);
});

test("status names the reason when a dirigeant review is invalid", () => {
  const progress = sampleProgress();
  progress.phases[0].status = "done";
  const dir = tmpProject(progress);
  writeFile(dir, ".ai-learn/guard.json", JSON.stringify({ version: 1, mode: "dirigeant" }));
  writeFile(dir, "docs/reviews/phase-zero.md", "Décision : accepter.\n");

  const out = capture(() => statusCommand({ dir, home: tmpHome() }));
  assert.match(out, /0\/1 valide\(s\) — 1 à revoir : docs\/reviews\/phase-zero\.md \(sans file:line réel\)/);
});

test("status does not print the review summary in apprenti (non-regression)", () => {
  const progress = sampleProgress();
  progress.phases[0].status = "done";
  const dir = tmpProject(progress);

  const out = capture(() => statusCommand({ dir, home: tmpHome() }));
  assert.doesNotMatch(out, /Revues \(mode dirigeant\)/);
});
