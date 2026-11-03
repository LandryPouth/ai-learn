"use strict";

// `bin/lib/tracks/debug.js` — le ledger global des incidents de code, calqué sur
// `tracks/git.js`. `home` injecté partout : le vrai `$HOME` n'est jamais touché.

const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const { TIER_IDS, tracksPath, defaultDebugTracks, readOrDefaultDebugTracks, validateDebugTracks, recordDebugTiers } = require("../bin/lib/tracks/debug");

function tmpHome() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "ai-learn-debug-"));
}

test("tracksPath is ~/.ai-learn/tracks/debug.json", () => {
  const home = tmpHome();
  assert.strictEqual(tracksPath({ home }), path.join(home, ".ai-learn", "tracks", "debug.json"));
});

test("defaultDebugTracks has tiers 1-5, unachieved", () => {
  const config = defaultDebugTracks();
  assert.deepStrictEqual(TIER_IDS, [1, 2, 3, 4, 5]);
  assert.deepStrictEqual(validateDebugTracks(config), []);
  assert.ok(TIER_IDS.every((tier) => config.tiers[String(tier)].achieved === false));
});

test("recordDebugTiers marks the tiers once and keeps one evidence per incident and tier", () => {
  const home = tmpHome();
  const args = { home, dir: "/tmp/p", incidentId: "i1", tiers: [1, 2], detail: "src/a.js" };

  recordDebugTiers(args);
  recordDebugTiers(args);

  const config = readOrDefaultDebugTracks({ home });
  assert.strictEqual(config.tiers["1"].achieved, true);
  assert.strictEqual(config.tiers["2"].achieved, true);
  assert.strictEqual(config.tiers["3"].achieved, false);
  assert.strictEqual(config.tiers["1"].evidence.length, 1);
});

test("validateDebugTracks reports a malformed ledger", () => {
  assert.ok(validateDebugTracks({ version: 1, tiers: { 1: {} } }).length > 0);
  assert.ok(validateDebugTracks(null).length > 0);
});

// Story 11.01 — secondOpinion statistic.
const { recordSecondOpinion } = require("../bin/lib/tracks/debug");

test("second opinion is counted once per incident", () => {
  const home = tmpHome();
  const args = { home, incidentId: "i1", learner: "exact", ai: "manqué" };

  recordSecondOpinion(args);
  recordSecondOpinion(args);
  recordSecondOpinion({ home, incidentId: "i2", learner: "fichier", ai: "exact" });

  const { secondOpinion } = readOrDefaultDebugTracks({ home });
  assert.strictEqual(secondOpinion.incidents, 2);
  assert.strictEqual(secondOpinion.learner.exact, 1);
  assert.strictEqual(secondOpinion.ai.manque, 1);
  assert.strictEqual(secondOpinion.learnerExactAiMissed, 1);
  assert.deepStrictEqual(validateDebugTracks(secondOpinion ? readOrDefaultDebugTracks({ home }) : {}), []);
});

test("a ledger without secondOpinion stays valid", () => {
  assert.deepStrictEqual(validateDebugTracks(defaultDebugTracks()), []);
  assert.ok(validateDebugTracks({ ...defaultDebugTracks(), secondOpinion: { incidents: "x" } }).length > 0);
});

test("a ledger without tier 5 stays valid", () => {
  const config = defaultDebugTracks();
  delete config.tiers["5"];

  assert.deepStrictEqual(validateDebugTracks(config), []);
});
