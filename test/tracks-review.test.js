"use strict";

// `bin/lib/tracks/review.js` — le ledger global des katas de revue.

const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const { tracksPath, defaultReviewTracks, validateReviewTracks, recordReviewKata, reviewSummary } = require("../bin/lib/tracks/review");

function tmpHome() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "ai-learn-review-"));
}

test("the default ledger is valid and unachieved", () => {
  const config = defaultReviewTracks();

  assert.deepStrictEqual(validateReviewTracks(config), []);
  assert.strictEqual(config.tiers["1"].achieved || config.tiers["2"].achieved, false);
});

test("recording a kata twice keeps one line and one evidence", () => {
  const home = tmpHome();
  const args = { home, dir: "/p", kataId: "k1", found: 2, total: 3, falsePositives: 0, tiers: [1] };

  recordReviewKata(args);
  const config = recordReviewKata(args);

  assert.strictEqual(config.katas.length, 1);
  assert.strictEqual(config.tiers["1"].evidence.length, 1);
  assert.deepStrictEqual(reviewSummary({ home }).katas, 1);
});

test("an unreadable review ledger is never overwritten", () => {
  const home = tmpHome();
  fs.mkdirSync(path.dirname(tracksPath({ home })), { recursive: true });
  fs.writeFileSync(tracksPath({ home }), "nope");

  assert.throws(() => recordReviewKata({ home, dir: "/p", kataId: "k", found: 1, total: 1, falsePositives: 0, tiers: [1] }));
  assert.strictEqual(fs.readFileSync(tracksPath({ home }), "utf8"), "nope");
});
