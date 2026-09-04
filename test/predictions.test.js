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

test("ensurePredictionsFile is idempotent and never touches an existing file", () => {
  const dir = tmpProject(sampleProgress());

  const first = ensurePredictionsFile(dir);
  assert.ok(first.created);

  fs.writeFileSync(predictionsPath(dir), JSON.stringify({ version: 1, entries: [{ id: "kept" }] }));
  const second = ensurePredictionsFile(dir);

  assert.ok(!second.created);
  assert.strictEqual(JSON.parse(fs.readFileSync(predictionsPath(dir), "utf8")).entries[0].id, "kept");
});
