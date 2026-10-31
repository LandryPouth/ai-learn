"use strict";

// `bin/lib/tracks/platform.js` — the global platform ledger (story 10.03).
// Injected `home` throughout so the real `$HOME` is never touched.

const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const {
  TIER_IDS,
  tracksPath,
  readPlatformTracks,
  missingPlatformTiers,
  syncPlatformTrack,
} = require("../bin/lib/tracks/platform");
const { readGitTracks } = require("../bin/lib/tracks/git");
const { syncEvidence, repairLedgers } = require("../bin/lib/ledgers");
const { verifyCommand } = require("../bin/lib/verify");
const { capture, sampleProgress, tmpProject } = require("./helpers");

function tmpHome() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "ai-learn-platform-home-"));
}

const phase = { id: 0, name: "Index prouvé par EXPLAIN", platformTier: 3 };

test("a verified tagged phase achieves its tier", () => {
  const home = tmpHome();
  syncPlatformTrack({ dir: "/p/one", phase, verifyEvidence: { ok: true }, home });

  const { config } = readPlatformTracks({ home });
  assert.deepStrictEqual(TIER_IDS, [1, 2, 3, 4, 5, 6, 7]);
  assert.strictEqual(config.tiers["3"].achieved, true);
  assert.strictEqual(config.tiers["3"].evidence[0].project, "/p/one");
  assert.strictEqual(config.tiers["3"].evidence[0].phaseId, 0);
  assert.strictEqual(config.tiers["2"].achieved, false);
  assert.deepStrictEqual(missingPlatformTiers({ home }), [1, 2, 4, 5, 6, 7]);
});

test("a failed verify leaves the ledger untouched", () => {
  const home = tmpHome();
  assert.strictEqual(syncPlatformTrack({ dir: "/p/one", phase, verifyEvidence: { ok: false }, home }), null);
  assert.strictEqual(fs.existsSync(tracksPath({ home })), false);

  syncPlatformTrack({ dir: "/p/one", phase, verifyEvidence: { ok: true }, home });
  const before = fs.readFileSync(tracksPath({ home }), "utf8");
  syncPlatformTrack({ dir: "/p/two", phase: { ...phase, platformTier: 5 }, verifyEvidence: { ok: false }, home });
  assert.strictEqual(fs.readFileSync(tracksPath({ home }), "utf8"), before);
});

test("an untagged or out-of-range phase never achieves a tier", () => {
  const home = tmpHome();

  for (const tagged of [{ id: 0, name: "p" }, { id: 0, name: "p", platformTier: 9 }, { id: 0, name: "p", platformTier: "3" }]) {
    assert.strictEqual(syncPlatformTrack({ dir: "/p", phase: tagged, verifyEvidence: { ok: true }, home }), null);
  }
  assert.strictEqual(fs.existsSync(tracksPath({ home })), false);
});

test("re-verifying confirms the evidence instead of piling it up", () => {
  const home = tmpHome();
  syncPlatformTrack({ dir: "/p/one", phase, verifyEvidence: { ok: true }, home });
  syncPlatformTrack({ dir: "/p/one", phase, verifyEvidence: { ok: true }, home });

  assert.strictEqual(readPlatformTracks({ home }).config.tiers["3"].evidence.length, 1);
});

test("a corrupt ledger is never overwritten", () => {
  const home = tmpHome();
  fs.mkdirSync(path.dirname(tracksPath({ home })), { recursive: true });
  fs.writeFileSync(tracksPath({ home }), "{ cassé");

  assert.throws(() => syncPlatformTrack({ dir: "/p", phase, verifyEvidence: { ok: true }, home }), { code: "ELEDGER_UNREADABLE" });
  assert.strictEqual(fs.readFileSync(tracksPath({ home }), "utf8"), "{ cassé");
  assert.strictEqual(missingPlatformTiers({ home }), null);
});

test("a phase tagged gitTier and platformTier advances both ledgers", () => {
  const home = tmpHome();
  const both = { id: 0, name: "Pipeline", gitTier: 5, platformTier: 5 };
  syncEvidence({ dir: "/p/one", phase: both, evidence: { ok: true }, home });

  assert.strictEqual(readGitTracks({ home }).config.tiers["5"].achieved, true);
  assert.strictEqual(readPlatformTracks({ home }).config.tiers["5"].achieved, true);
});

test("ledgers --repair lowers a tier whose project vanished", () => {
  const home = tmpHome();
  syncPlatformTrack({ dir: "/p/gone", phase, verifyEvidence: { ok: true }, home });
  repairLedgers({ home, gone: () => true });

  assert.strictEqual(readPlatformTracks({ home }).config.tiers["3"].achieved, false);
});

test("verify of a tagged phase with a green checkpoint marks the tier; a red one does not", () => {
  const green = tmpProject(sampleProgress());
  const greenProgress = JSON.parse(fs.readFileSync(path.join(green, "progress.json"), "utf8"));
  greenProgress.phases[0].platformTier = 3;
  fs.writeFileSync(path.join(green, "progress.json"), JSON.stringify(greenProgress));
  const home = tmpHome();
  capture(() => verifyCommand({ dir: green, phaseId: 0, home }));
  assert.strictEqual(readPlatformTracks({ home }).config.tiers["3"].achieved, true);

  const red = tmpProject(sampleProgress());
  const redProgress = JSON.parse(fs.readFileSync(path.join(red, "progress.json"), "utf8"));
  redProgress.phases[0].platformTier = 3;
  redProgress.phases[0].checkpoint = "node -e \"process.exit(1)\"";
  fs.writeFileSync(path.join(red, "progress.json"), JSON.stringify(redProgress));
  const redHome = tmpHome();
  capture(() => verifyCommand({ dir: red, phaseId: 0, home: redHome }));
  process.exitCode = 0;
  assert.strictEqual(fs.existsSync(tracksPath({ home: redHome })), false);
});
