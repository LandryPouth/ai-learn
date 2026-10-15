"use strict";

// `bin/lib/tracks/tests.js` — the global, home-scoped test-mastery ledger
// (story 02.05). Same injected-`home` isolation as test/tracks-git.test.js.

const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const { tmpProject, writeFile } = require("./helpers");
const {
  TIER_IDS,
  tracksPath,
  defaultTestsTracks,
  readOrDefaultTestsTracks,
  validateTestsTracks,
  observePhase,
  syncTestsTrack,
} = require("../bin/lib/tracks/tests");

function tmpHome() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "ai-learn-tests-tracks-"));
}

// A project whose `.ai-learn/runs/` holds the given mutation evidences, oldest
// first — file names sort lexicographically like writeEvidence's timestamps.
function projectWithEvidence(mutations, { sourceHashes = [] } = {}) {
  const dir = tmpProject({ phases: [{ id: 0, name: "P", status: "done" }] });
  mutations.forEach((mutation, i) => {
    const ev = { phaseId: 0, ok: true, sourceHash: sourceHashes[i] || "h", mutation };
    writeFile(dir, `.ai-learn/runs/2026-01-0${i + 1}-0-verify.json`, JSON.stringify(ev));
  });
  return dir;
}

const mut = (overrides = {}) => ({
  required: true, ok: true, mutants: 2, killed: 2, survived: [], killedOperators: ["boolean-literal"], score: 100, ...overrides,
});
const red = () => mut({ ok: false, killed: 1, survived: [{ file: "a.js", line: 1, operator: "boolean-literal" }], score: 50 });
const PASS = { ok: true };
const phase = { id: 0 };

function sync(dir, home) {
  return syncTestsTrack({ dir, phase, verifyEvidence: PASS, home });
}

test("defaultTestsTracks has six tiers, none achieved", () => {
  const config = defaultTestsTracks();
  assert.deepStrictEqual(TIER_IDS, [1, 2, 3, 4, 5, 6]);
  for (const id of TIER_IDS) {
    assert.deepStrictEqual(config.tiers[String(id)], { achieved: false, evidence: [] });
  }
  assert.deepStrictEqual(validateTestsTracks(config), []);
});

test("tracksPath is ~/.ai-learn/tracks/tests.json under the given home", () => {
  const home = tmpHome();
  assert.strictEqual(tracksPath({ home }), path.join(home, ".ai-learn", "tracks", "tests.json"));
});

test("validateTestsTracks rejects an unknown version, a missing tier and a non-object", () => {
  assert.ok(validateTestsTracks(null).length > 0);
  assert.ok(validateTestsTracks({ ...defaultTestsTracks(), version: 2 }).length > 0);
  const missing = defaultTestsTracks();
  delete missing.tiers["3"];
  assert.ok(validateTestsTracks(missing).length > 0);
  const badTier = defaultTestsTracks();
  badTier.tiers["1"].achieved = "yes";
  assert.ok(validateTestsTracks(badTier).length > 0);
});

test("a corrupt ledger falls back to a default one and never throws", () => {
  const home = tmpHome();
  fs.mkdirSync(path.dirname(tracksPath({ home })), { recursive: true });
  fs.writeFileSync(tracksPath({ home }), "{ not json");
  assert.deepStrictEqual(readOrDefaultTestsTracks({ home }), defaultTestsTracks());
  fs.writeFileSync(tracksPath({ home }), JSON.stringify({ version: 99 }));
  assert.deepStrictEqual(readOrDefaultTestsTracks({ home }), defaultTestsTracks());
});

test("tier 1: a killed mutant marks the tier", () => {
  const home = tmpHome();
  sync(projectWithEvidence([mut({ killed: 1, mutants: 2, score: 50, ok: true })]), home);
  assert.strictEqual(readOrDefaultTestsTracks({ home }).tiers["1"].achieved, true);
});

test("tier 2: score 100 with at least one mutant marks the tier, a null score does not", () => {
  const home = tmpHome();
  sync(projectWithEvidence([mut({ mutants: 0, killed: 0, score: null })]), home);
  assert.strictEqual(readOrDefaultTestsTracks({ home }).tiers["2"].achieved, false);

  sync(projectWithEvidence([mut()]), home);
  assert.strictEqual(readOrDefaultTestsTracks({ home }).tiers["2"].achieved, true);
});

test("marque le tier rouge d'abord depuis une transition observée", () => {
  const home = tmpHome();
  sync(projectWithEvidence([red(), red(), mut()]), home);
  assert.strictEqual(readOrDefaultTestsTracks({ home }).tiers["3"].achieved, true);
});

test("ne marque pas rouge d'abord sans échec préalable", () => {
  const home = tmpHome();
  sync(projectWithEvidence([mut()]), home);
  assert.strictEqual(readOrDefaultTestsTracks({ home }).tiers["3"].achieved, false);
});

test("rouge d'abord ignores a failure that comes after the success", () => {
  assert.strictEqual(observePhase([mut(), red()])[3], null);
});

test("tier 4: two distinct killed operators mark the tier, one repeated does not", () => {
  const home = tmpHome();
  sync(projectWithEvidence([mut(), mut()]), home);
  assert.strictEqual(readOrDefaultTestsTracks({ home }).tiers["4"].achieved, false);

  sync(projectWithEvidence([mut({ killedOperators: ["comparison-operator"] })]), home);
  assert.strictEqual(readOrDefaultTestsTracks({ home }).tiers["4"].achieved, false);
  assert.deepStrictEqual(readOrDefaultTestsTracks({ home }).tiers["4"].evidence, []);
});

test("tier 4: operators from two phases of one project accumulate", () => {
  const home = tmpHome();
  const dir = projectWithEvidence([mut()]);
  sync(dir, home);
  writeFile(dir, ".ai-learn/runs/2026-02-01-1-verify.json", JSON.stringify({ phaseId: 1, ok: true, mutation: mut({ killedOperators: ["comparison-operator"] }) }));
  syncTestsTrack({ dir, phase: { id: 1 }, verifyEvidence: PASS, home });
  assert.strictEqual(readOrDefaultTestsTracks({ home }).tiers["4"].achieved, true);
});

test("tier 5: a 100 % phase re-proven at 100 % on changed code marks the tier", () => {
  const home = tmpHome();
  sync(projectWithEvidence([mut(), mut()], { sourceHashes: ["a", "a"] }), home);
  assert.strictEqual(readOrDefaultTestsTracks({ home }).tiers["5"].achieved, false);

  sync(projectWithEvidence([mut(), mut()], { sourceHashes: ["a", "b"] }), home);
  assert.strictEqual(readOrDefaultTestsTracks({ home }).tiers["5"].achieved, true);
});

test("deux projets distincts sont listés séparément (tier 6: tier 2 in two projects, not one)", () => {
  const home = tmpHome();
  const first = projectWithEvidence([mut()]);
  sync(first, home);
  assert.strictEqual(readOrDefaultTestsTracks({ home }).tiers["6"].achieved, false);

  const second = projectWithEvidence([mut()]);
  sync(second, home);
  const config = readOrDefaultTestsTracks({ home });
  assert.strictEqual(config.tiers["6"].achieved, true);
  assert.deepStrictEqual(Object.keys(config.projects).sort(), [first, second].sort());
});

test("un tier acquis reste acquis", () => {
  const home = tmpHome();
  const dir = projectWithEvidence([mut()]);
  sync(dir, home);
  assert.strictEqual(readOrDefaultTestsTracks({ home }).tiers["2"].achieved, true);

  // Evidence cleaned up between two verifies — the ledger must not regress.
  fs.rmSync(path.join(dir, ".ai-learn"), { recursive: true, force: true });
  sync(dir, home);
  assert.strictEqual(readOrDefaultTestsTracks({ home }).tiers["2"].achieved, true);
});

test("a phase with no mutation evidence feeds no tier", () => {
  const home = tmpHome();
  const dir = projectWithEvidence([{ required: false, ok: true, mutants: 0, killed: 0, survived: [], score: null }]);
  sync(dir, home);
  const config = readOrDefaultTestsTracks({ home });
  assert.ok(TIER_IDS.every((id) => config.tiers[String(id)].achieved === false));
});

test("syncTestsTrack does nothing when the verify did not pass", () => {
  const home = tmpHome();
  const dir = projectWithEvidence([mut()]);
  assert.strictEqual(syncTestsTrack({ dir, phase, verifyEvidence: { ok: false }, home }), null);
  assert.strictEqual(fs.existsSync(tracksPath({ home })), false);
});

test("tier 5: a missing sourceHash on the first perfect evidence never counts as a code change", () => {
  assert.strictEqual(observePhase([{ ...evOf(mut()), sourceHash: undefined }, evOf(mut(), "b")])[5], null);
});

function evOf(mutation, sourceHash = "a") {
  return { phaseId: 0, ok: true, sourceHash, mutation };
}
