"use strict";

// `bin/lib/status.js` — mainly the new git/gh cross-project summary
// (`printGitTracksSummary`), additive and read-only. Injected `home`
// throughout so the real `$HOME` is never touched.

const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const { statusCommand, printGitTracksSummary, printDomainSummary } = require("../bin/lib/status");
const { defaultGitTracks, writeGitTracks } = require("../bin/lib/tracks/git");
const { defaultDomainLedger, writeDomainLedger } = require("../bin/lib/tracks/domain");
const { loadStack } = require("../bin/lib/scan");
const { capture, sampleProgress, tmpProject, writeFile } = require("./helpers");

function tmpHome() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "ai-learn-status-home-"));
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
