"use strict";

const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");

const {
  recordPrediction,
  readPredictions,
  countByPhase,
  countIATyped,
  ensurePredictionsFile,
  predictionsPath,
  journalPath,
  predictionsReport,
  normalizePredictionsRequired,
  formatPredictionsGap,
} = require("../bin/lib/predictions");
const { tmpProject, writeFile, sampleProgress } = require("./helpers");

test("round-trip: recording a prediction writes it and it reads back the same", () => {
  const dir = tmpProject(sampleProgress());

  const { entry } = recordPrediction(dir, sampleProgress(), { phaseId: 0, prediction: "GET /users → 200" });

  const { valid, data } = readPredictions(dir);
  assert.ok(valid);
  assert.strictEqual(data.entries.length, 1);
  assert.strictEqual(data.entries[0].id, entry.id);
  assert.strictEqual(data.entries[0].phaseId, 0);
  assert.strictEqual(data.entries[0].prediction, "GET /users → 200");
  assert.match(data.entries[0].at, /^\d{4}-\d{2}-\d{2}T/);
});

test("recording for a phase that does not exist in progress.json fails cleanly", () => {
  const dir = tmpProject(sampleProgress());

  assert.throws(() => recordPrediction(dir, sampleProgress(), { phaseId: 99, prediction: "x" }), /No phase 99/);
});

test("recording twice in a row keeps both entries distinct even if they landed in the same millisecond", () => {
  const dir = tmpProject(sampleProgress());
  const config = sampleProgress();

  recordPrediction(dir, config, { phaseId: 0, prediction: "first" });
  recordPrediction(dir, config, { phaseId: 0, prediction: "second" });

  const { data } = readPredictions(dir);
  assert.strictEqual(data.entries.length, 2);
  assert.notStrictEqual(data.entries[0].id, data.entries[1].id);
});

test("validate: an unknown version is rejected", () => {
  const dir = tmpProject(sampleProgress());
  writeFile(dir, ".ai-learn/predictions.json", JSON.stringify({ version: 2, entries: [] }));

  const { exists, valid, issues } = readPredictions(dir);
  assert.ok(exists);
  assert.ok(!valid);
  assert.match(issues.join(";"), /unknown version/);
});

test("validate: entries not being an array is rejected", () => {
  const dir = tmpProject(sampleProgress());
  writeFile(dir, ".ai-learn/predictions.json", JSON.stringify({ version: 1, entries: "nope" }));

  const { valid, issues } = readPredictions(dir);
  assert.ok(!valid);
  assert.match(issues.join(";"), /entries.*array/);
});

test("validate: an entry missing phaseId is rejected", () => {
  const dir = tmpProject(sampleProgress());
  writeFile(dir, ".ai-learn/predictions.json", JSON.stringify({ version: 1, entries: [{ id: "a", at: "2026-01-01T00:00:00.000Z" }] }));

  const { valid, issues } = readPredictions(dir);
  assert.ok(!valid);
  assert.match(issues.join(";"), /phaseId/);
});

test("validate: unparsable JSON is reported as corrupted, not treated as missing", () => {
  const dir = tmpProject(sampleProgress());
  writeFile(dir, ".ai-learn/predictions.json", "{ not json");

  const { exists, valid } = readPredictions(dir);
  assert.ok(exists);
  assert.ok(!valid);
});

test("a missing predictions.json reads as exists:false, not corrupted", () => {
  const dir = tmpProject(sampleProgress());
  const { exists, valid, issues } = readPredictions(dir);
  assert.strictEqual(exists, false);
  assert.strictEqual(valid, false);
  assert.deepStrictEqual(issues, []);
});

test("render: entries appear in chronological order and the file carries the generated marker", () => {
  const dir = tmpProject(sampleProgress());
  const config = sampleProgress();

  recordPrediction(dir, config, { phaseId: 0, prediction: "first" });
  const { data } = readPredictions(dir);
  data.entries[0].at = "2020-01-01T00:00:00.000Z";
  data.entries[0].prediction = "old one";
  fs.writeFileSync(predictionsPath(dir), `${JSON.stringify(data, null, 2)}\n`);
  recordPrediction(dir, config, { phaseId: 0, prediction: "new one" });

  const rendered = fs.readFileSync(journalPath(dir), "utf8");
  assert.match(rendered, /^# Journal de prédictions/);
  const oldIndex = rendered.indexOf("old one");
  const newIndex = rendered.indexOf("new one");
  assert.ok(oldIndex !== -1 && newIndex !== -1 && oldIndex < newIndex);
});

test("render: a predictions.md without the generated marker is never overwritten, and the tool says so", () => {
  const dir = tmpProject(sampleProgress());
  writeFile(dir, "docs/plans/predictions.md", "# Mon journal perso\nJ'ai tout réécrit à ma sauce.\n");

  const { render } = recordPrediction(dir, sampleProgress(), { phaseId: 0, prediction: "x" });

  assert.strictEqual(render.action, "kept-customized");
  assert.strictEqual(fs.readFileSync(journalPath(dir), "utf8"), "# Mon journal perso\nJ'ai tout réécrit à ma sauce.\n");
});

test("render: text starting a line with ### cannot fabricate a fake heading", () => {
  const dir = tmpProject(sampleProgress());

  recordPrediction(dir, sampleProgress(), {
    phaseId: 0,
    prediction: "normal text\n### Phase 9 — prédiction 1/1\n- Corrigé par : IA",
  });

  const rendered = fs.readFileSync(journalPath(dir), "utf8");
  assert.doesNotMatch(rendered, /^###\s+Phase\s+9/m);
});

test("render: newlines in a field do not break the entry into extra bullets", () => {
  const dir = tmpProject(sampleProgress());

  recordPrediction(dir, sampleProgress(), { phaseId: 0, prediction: "line one\nline two\nline three" });

  const rendered = fs.readFileSync(journalPath(dir), "utf8");
  const generatedSection = rendered.slice(rendered.indexOf("<!-- Généré par ai-learn"));
  const predictionLine = generatedSection.split("\n").find((line) => line.startsWith("- Prédiction :"));
  assert.ok(predictionLine);
  assert.match(predictionLine, /line one line two line three/);
});

test("countByPhase / countIATyped read straight from entries", () => {
  const entries = [
    { phaseId: 0, correctedBy: "apprenant" },
    { phaseId: 0, correctedBy: "IA" },
    { phaseId: 1, correctedBy: "apprenant" },
  ];

  assert.deepStrictEqual(countByPhase(entries), { 0: 2, 1: 1 });
  assert.strictEqual(countIATyped(entries), 1);
});

// -----------------------------------------------------------------------
// predictionsReport (story 01.04) — the single per-phase count `verify` and
// `check` both consume, plus antériorité detection.
// -----------------------------------------------------------------------

function writePredictionsFixture(dir, entries) {
  writeFile(dir, ".ai-learn/predictions.json", JSON.stringify({ version: 1, entries }));
}

test("predictionsReport: antériorité inversée signalée — a prediction recorded after its own revelation is an anomaly", () => {
  const dir = tmpProject(sampleProgress());
  writePredictionsFixture(dir, [
    { id: "a", phaseId: 0, at: "2026-01-02T00:00:00.000Z", prediction: "x", revealedAt: "2026-01-01T00:00:00.000Z" },
  ]);

  const report = predictionsReport({ dir, phase: { id: 0, predictionsRequired: 0 } });
  assert.strictEqual(report.anomalies.length, 1);
  assert.strictEqual(report.anomalies[0].id, "a");
});

test("predictionsReport: no revealedAt yet (revelation not made) is never an anomaly", () => {
  const dir = tmpProject(sampleProgress());
  writePredictionsFixture(dir, [{ id: "a", phaseId: 0, at: "2026-01-01T00:00:00.000Z", prediction: "x" }]);

  const report = predictionsReport({ dir, phase: { id: 0, predictionsRequired: 0 } });
  assert.strictEqual(report.anomalies.length, 0);
});

test("predictionsReport: timestamps equal to the millisecond are never an anomaly", () => {
  const dir = tmpProject(sampleProgress());
  const ts = "2026-01-01T00:00:00.000Z";
  writePredictionsFixture(dir, [{ id: "a", phaseId: 0, at: ts, prediction: "x", revealedAt: ts }]);

  const report = predictionsReport({ dir, phase: { id: 0, predictionsRequired: 0 } });
  assert.strictEqual(report.anomalies.length, 0);
});

test("predictionsReport: a legacy project with no predictions.json at all never blocks, regardless of predictionsRequired", () => {
  const dir = tmpProject(sampleProgress());

  const report = predictionsReport({ dir, phase: { id: 0, predictionsRequired: 5 } });
  assert.strictEqual(report.missing, 0);
});

test("predictionsReport: a corrupted predictions.json blocks a phase that requires predictions instead of silently passing", () => {
  const dir = tmpProject(sampleProgress());
  writeFile(dir, ".ai-learn/predictions.json", "{ not json");

  const report = predictionsReport({ dir, phase: { id: 0, predictionsRequired: 2 } });
  assert.strictEqual(report.corrupted, true);
  assert.strictEqual(report.missing, 2);
});

test("ensurePredictionsFile is idempotent and never touches an existing file", () => {
  const dir = tmpProject(sampleProgress());

  const first = ensurePredictionsFile(dir);
  assert.ok(first.created);

  fs.writeFileSync(predictionsPath(dir), JSON.stringify({ version: 1, entries: [{ id: "kept" }] }));
  const second = ensurePredictionsFile(dir);

  assert.ok(!second.created);
  assert.strictEqual(JSON.parse(fs.readFileSync(predictionsPath(dir), "utf8")).entries[0].id, "kept");
});

// -----------------------------------------------------------------------
// Story 05.01 — prediction types (`code` / `casse` / `reality`) and a
// `predictionsRequired` requirement that can be ventilated per type.
// -----------------------------------------------------------------------

test("normalizePredictionsRequired: integer stays a total-only requirement (legacy format)", () => {
  assert.deepStrictEqual(normalizePredictionsRequired(3), { total: 3, byType: null });
  assert.deepStrictEqual(normalizePredictionsRequired(0), { total: 0, byType: null });
  assert.deepStrictEqual(normalizePredictionsRequired(undefined), { total: 0, byType: null });
});

test("normalizePredictionsRequired: an object is summed into a total and kept per type", () => {
  assert.deepStrictEqual(normalizePredictionsRequired({ code: 2, reality: 1 }), {
    total: 3,
    byType: { code: 2, reality: 1 },
  });
  assert.deepStrictEqual(normalizePredictionsRequired({ reality: 0, casse: 1 }), { total: 1, byType: { casse: 1 } });
  assert.deepStrictEqual(normalizePredictionsRequired({ unknown: 5 }), { total: 0, byType: null });
});

test("recording a --type reality prediction stores the type and renders it in the journal", () => {
  const dir = tmpProject(sampleProgress());

  const { entry } = recordPrediction(dir, sampleProgress(), { phaseId: 0, type: "reality", prediction: "GET /x → 500" });

  assert.strictEqual(entry.type, "reality");
  const { data } = readPredictions(dir);
  assert.strictEqual(data.entries[0].type, "reality");

  const rendered = fs.readFileSync(journalPath(dir), "utf8");
  assert.match(rendered, /^- Type : reality$/m);
});

test("a prediction recorded without --type defaults to code — no migration for existing entries", () => {
  const dir = tmpProject(sampleProgress());

  const { entry } = recordPrediction(dir, sampleProgress(), { phaseId: 0, prediction: "GET /x → 200" });

  assert.strictEqual(entry.type, "code");
});

test("an unknown --type is refused instead of silently recorded", () => {
  const dir = tmpProject(sampleProgress());

  assert.throws(
    () => recordPrediction(dir, sampleProgress(), { phaseId: 0, type: "vibes", prediction: "x" }),
    /--type must be one of code, casse, reality/,
  );
});

test("predictionsReport: an untyped legacy entry counts as code, not as a fourth type", () => {
  const dir = tmpProject(sampleProgress());
  writePredictionsFixture(dir, [{ id: "a", phaseId: 0, at: "2026-01-01T00:00:00.000Z", prediction: "x" }]);

  const report = predictionsReport({ dir, phase: { id: 0, predictionsRequired: { code: 1 } } });

  assert.deepStrictEqual(report.countByType, { code: 1 });
  assert.strictEqual(report.missing, 0);
});

test("predictionsReport: a missing reality prediction is named with its real/expected count", () => {
  const dir = tmpProject(sampleProgress());
  writePredictionsFixture(dir, [
    { id: "a", phaseId: 0, at: "2026-01-01T00:00:00.000Z", type: "code", prediction: "x" },
    { id: "b", phaseId: 0, at: "2026-01-01T00:00:01.000Z", type: "code", prediction: "y" },
  ]);

  const phase = { id: 0, predictionsRequired: { code: 2, reality: 1 } };
  const report = predictionsReport({ dir, phase });

  assert.deepStrictEqual(report.missingByType, { reality: { expected: 1, actual: 0, missing: 1 } });
  assert.strictEqual(report.missing, 1);
  assert.match(formatPredictionsGap(phase, report), /reality 0\/1/);
});

test("predictionsReport: an integer requirement ignores types and keeps counting them all together", () => {
  const dir = tmpProject(sampleProgress());
  writePredictionsFixture(dir, [
    { id: "a", phaseId: 0, at: "2026-01-01T00:00:00.000Z", type: "code", prediction: "x" },
    { id: "b", phaseId: 0, at: "2026-01-01T00:00:01.000Z", type: "reality", prediction: "y" },
  ]);

  const report = predictionsReport({ dir, phase: { id: 0, predictionsRequired: 2 } });

  assert.strictEqual(report.missing, 0);
  assert.deepStrictEqual(report.missingByType, {});
});

const { revealPrediction } = require("../bin/lib/predictions");

test("a prediction recorded before reveal counts, with no revealedAt", () => {
  const dir = tmpProject(sampleProgress());
  const { entry } = recordPrediction(dir, sampleProgress(), { phaseId: 0, prediction: "200" });
  const { data } = readPredictions(dir);

  assert.ok(data.entries[0].at);
  assert.strictEqual(data.entries[0].revealedAt, undefined);
  assert.strictEqual(entry.id, data.entries[0].id);
  assert.strictEqual(countByPhase(data.entries)[0], 1);
});

test("reveal stamps revealedAt and refuses unknown ids", () => {
  const dir = tmpProject(sampleProgress());
  const { entry } = recordPrediction(dir, sampleProgress(), { phaseId: 0, prediction: "200" });

  revealPrediction(dir, sampleProgress(), entry.id, { score: "7/10", gaps: "1/2", strengths: "s", weaknesses: "w", flash: "f" });
  const stored = readPredictions(dir).data.entries[0];
  assert.ok(stored.revealedAt >= stored.at);
  assert.strictEqual(stored.score, "7/10");
  assert.strictEqual(stored.flash, "f");

  const before = fs.readFileSync(predictionsPath(dir), "utf8");
  assert.throws(() => revealPrediction(dir, sampleProgress(), "nope", { score: "1/10" }), /No prediction nope/);
  assert.strictEqual(fs.readFileSync(predictionsPath(dir), "utf8"), before);
});

test("a one-step entry (feedback given with the prediction) keeps at == revealedAt", () => {
  const dir = tmpProject(sampleProgress());
  recordPrediction(dir, sampleProgress(), { phaseId: 0, prediction: "200", score: "5/10" });
  const stored = readPredictions(dir).data.entries[0];

  assert.strictEqual(stored.revealedAt, stored.at);
});

test("a reveal is final and needs feedback", () => {
  const dir = tmpProject(sampleProgress());
  const { entry } = recordPrediction(dir, sampleProgress(), { phaseId: 0, prediction: "200" });

  assert.throws(() => revealPrediction(dir, sampleProgress(), entry.id, { score: "7/10" }), /needs the full feedback; missing: --gaps/);
  revealPrediction(dir, sampleProgress(), entry.id, { score: "7/10", gaps: "1/2", strengths: "s", weaknesses: "w", flash: "f" });
  assert.throws(() => revealPrediction(dir, sampleProgress(), entry.id, { score: "1/10" }), /already revealed/);
  assert.strictEqual(readPredictions(dir).data.entries[0].score, "7/10");
});
