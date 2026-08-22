"use strict";

// `bin/lib/tracks/domain.js` — the global, home-scoped domain mastery ledger.
// Schema round-trip, real-code concept sync (reusing scan.js's own detection
// engine), and coverage/"Expert" summary — with an injected `home` throughout
// so the real `$HOME` is never touched.

const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const {
  domainsHome,
  slugifyTechnology,
  domainPath,
  defaultDomainLedger,
  readDomainLedger,
  readOrDefaultDomainLedger,
  validateDomainLedger,
  writeDomainLedger,
  detectDomainKey,
  syncDomainLedger,
  domainSummary,
} = require("../bin/lib/tracks/domain");
const { writeFile } = require("./helpers");

function tmpHome() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "ai-learn-domain-home-"));
}

function tmpDir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

test("slugifyTechnology normalizes free text into a stable slug", () => {
  assert.strictEqual(slugifyTechnology("JavaScript"), "javascript");
  assert.strictEqual(slugifyTechnology("Node.js API"), "node-js-api");
  assert.strictEqual(slugifyTechnology(""), "generic");
  assert.strictEqual(slugifyTechnology(null), "generic");
});

test("domainPath is ~/.ai-learn/domains/<slug>.json under the given home", () => {
  const home = tmpHome();
  assert.strictEqual(domainsHome({ home }), path.join(home, ".ai-learn", "domains"));
  assert.strictEqual(domainPath({ technology: "JavaScript", home }), path.join(home, ".ai-learn", "domains", "javascript.json"));
});

test("defaultDomainLedger has the expected empty shape", () => {
  const config = defaultDomainLedger("javascript");
  assert.strictEqual(config.version, 1);
  assert.strictEqual(config.technology, "javascript");
  assert.deepStrictEqual(config.concepts, {});
  assert.deepStrictEqual(config.directionsCompleted, []);
  assert.deepStrictEqual(config.projects, {});
});

test("writeDomainLedger + readDomainLedger round-trip", () => {
  const home = tmpHome();
  const config = defaultDomainLedger("javascript");
  config.concepts["js-routes"] = { achieved: true, tier: 2, firstProject: "/x", evidenceDate: "2026-01-01T00:00:00.000Z" };

  writeDomainLedger(config, { home });
  const { config: reread, exists } = readDomainLedger({ technology: "javascript", home });
  assert.strictEqual(exists, true);
  assert.strictEqual(reread.concepts["js-routes"].achieved, true);
});

test("validateDomainLedger accepts a well-formed default and reports structural errors on a corrupt one", () => {
  assert.deepStrictEqual(validateDomainLedger(defaultDomainLedger("javascript")), []);
  assert.ok(validateDomainLedger(null).some((i) => i.level === "error"));
  assert.ok(validateDomainLedger({ version: 2 }).some((i) => /version/.test(i.message)));
  assert.ok(validateDomainLedger({ version: 1, concepts: "nope" }).some((i) => /\.concepts must be an object/.test(i.message)));
  assert.ok(
    validateDomainLedger({ version: 1, concepts: {}, directionsCompleted: "nope", projects: {} }).some((i) =>
      /\.directionsCompleted must be an array/.test(i.message),
    ),
  );
});

test("readOrDefaultDomainLedger falls back without writing, and on a corrupt on-disk ledger", () => {
  const home = tmpHome();
  const fresh = readOrDefaultDomainLedger({ technology: "javascript", home });
  assert.deepStrictEqual(fresh, defaultDomainLedger("javascript"));
  assert.ok(!fs.existsSync(domainPath({ technology: "javascript", home })));

  fs.mkdirSync(domainsHome({ home }), { recursive: true });
  fs.writeFileSync(domainPath({ technology: "javascript", home }), JSON.stringify({ version: 2 }));
  assert.deepStrictEqual(readOrDefaultDomainLedger({ technology: "javascript", home }), defaultDomainLedger("javascript"));
});

test("detectDomainKey resolves the real stack key from code, not from a label", () => {
  const dir = tmpDir("ai-learn-domain-repo-");
  writeFile(dir, "src/index.js", 'const app = require("express")();\napp.get("/x", () => {});\napp.listen(3000);\n');

  const { key } = detectDomainKey(dir);
  assert.strictEqual(key, "javascript");
});

test("syncDomainLedger merges concepts detected from real code, never regressing an achieved one", () => {
  const home = tmpHome();
  const dir = tmpDir("ai-learn-domain-repo-");
  writeFile(
    dir,
    "src/index.js",
    'const app = require("express")();\napp.get("/x", async (req, res) => { await Promise.resolve(); res.json({}); });\napp.listen(3000);\n',
  );

  const result = syncDomainLedger({ dir, verifyEvidence: { ok: true }, home });
  assert.strictEqual(result.key, "javascript");
  assert.ok(result.touched.includes("js-routes"));
  assert.ok(result.touched.includes("js-async"));

  const { config } = readDomainLedger({ technology: "javascript", home });
  assert.strictEqual(config.concepts["js-routes"].achieved, true);
  const firstEvidenceDate = config.concepts["js-routes"].evidenceDate;

  // A second sync of the same project must not touch an already-achieved
  // concept's firstProject/evidenceDate (never regressed, never rewritten).
  const second = syncDomainLedger({ dir, verifyEvidence: { ok: true }, home });
  assert.ok(!second.touched.includes("js-routes"), "an already-achieved concept must not re-touch");
  const { config: reread } = readDomainLedger({ technology: "javascript", home });
  assert.strictEqual(reread.concepts["js-routes"].evidenceDate, firstEvidenceDate);
});

test("syncDomainLedger is a no-op when the checkpoint did not really pass", () => {
  const home = tmpHome();
  const dir = tmpDir("ai-learn-domain-repo-");
  writeFile(dir, "src/index.js", 'app.get("/x", () => {});\n');

  const result = syncDomainLedger({ dir, verifyEvidence: { ok: false }, home });
  assert.strictEqual(result, null);
  assert.strictEqual(readDomainLedger({ technology: "javascript", home }).exists, false);
});

test("domainSummary reports concept coverage and Expert status for a stack with a concept bank", () => {
  const home = tmpHome();
  const config = defaultDomainLedger("javascript");
  const { loadStack } = require("../bin/lib/scan");
  const bank = loadStack("javascript").concepts;

  for (const concept of bank) {
    config.concepts[concept.id] = { achieved: true, tier: concept.tier, firstProject: "/x", evidenceDate: "2026-01-01T00:00:00.000Z" };
  }
  writeDomainLedger(config, { home });

  const summary = domainSummary({ technology: "javascript", home });
  assert.strictEqual(summary.metric, "concepts");
  assert.strictEqual(summary.achieved, bank.length);
  assert.strictEqual(summary.total, bank.length);
  assert.strictEqual(summary.expert, true);
  assert.deepStrictEqual(summary.missing, []);
});

test("domainSummary falls back to directionsCompleted for a stack with no concept bank (generic)", () => {
  const home = tmpHome();
  const config = defaultDomainLedger("generic");
  writeDomainLedger(config, { home });

  const summary = domainSummary({ technology: "generic", home });
  assert.strictEqual(summary.metric, "directions");
  assert.strictEqual(summary.achieved, 0);
  assert.ok(summary.total > 0, "generic.js has a non-empty directions+recipes bank");
  assert.strictEqual(summary.expert, false);
});

test("domainSummary returns null when no ledger exists yet", () => {
  const home = tmpHome();
  assert.strictEqual(domainSummary({ technology: "javascript", home }), null);
});
