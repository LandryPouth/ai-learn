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

test("defaultDebugTracks has tiers 1-4, unachieved", () => {
  const config = defaultDebugTracks();
  assert.deepStrictEqual(TIER_IDS, [1, 2, 3, 4]);
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
