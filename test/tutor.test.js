"use strict";

const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const {
  ASSISTANCE_LEVELS,
  PROOF_LEVELS,
  tutorConfigPath,
  defaultTutorConfig,
  validateTutorConfig,
  readTutorConfig,
  ensureTutorConfig,
  masteryLevel,
} = require("../bin/lib/tutor");

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "ai-learn-tutor-"));
}

test("the tutor defaults are explicit and stable", () => {
  assert.deepStrictEqual(defaultTutorConfig(), { version: 1, assistance: "indices", proof: "explication" });
  assert.deepStrictEqual(ASSISTANCE_LEVELS, ["libre", "indices", "strict"]);
  assert.deepStrictEqual(PROOF_LEVELS, ["tests", "explication", "transfert"]);
});

test("validateTutorConfig accepts the documented values", () => {
  assert.deepStrictEqual(validateTutorConfig({ version: 1, assistance: "strict", proof: "transfert" }), []);
});

test("validateTutorConfig names an unknown assistance or proof value", () => {
  const issues = validateTutorConfig({ version: 1, assistance: "moyen", proof: "magie" });

  assert.ok(issues.some((issue) => /unknown assistance "moyen"/.test(issue)));
  assert.ok(issues.some((issue) => /unknown proof "magie"/.test(issue)));
});

test("ensureTutorConfig writes the defaults once and never rewrites a customized file", () => {
  const dir = tmpDir();
  assert.deepStrictEqual(ensureTutorConfig(dir), { created: true });
  assert.deepStrictEqual(readTutorConfig(dir).config, defaultTutorConfig());

  const custom = { version: 1, assistance: "strict", proof: "transfert" };
  fs.writeFileSync(tutorConfigPath(dir), `${JSON.stringify(custom, null, 2)}\n`);

  assert.deepStrictEqual(ensureTutorConfig(dir), { created: false });
  assert.deepStrictEqual(readTutorConfig(dir).config, custom);
});

test("readTutorConfig treats a missing file as defaults and a corrupted one as invalid", () => {
  const dir = tmpDir();
  const missing = readTutorConfig(dir);

  assert.strictEqual(missing.exists, false);
  assert.deepStrictEqual(missing.config, defaultTutorConfig());
  assert.deepStrictEqual(missing.issues, []);

  fs.mkdirSync(path.dirname(tutorConfigPath(dir)), { recursive: true });
  fs.writeFileSync(tutorConfigPath(dir), "{not json");
  const corrupted = readTutorConfig(dir);

  assert.strictEqual(corrupted.exists, true);
  assert.strictEqual(corrupted.valid, false);
  assert.ok(corrupted.issues.some((issue) => /not valid JSON/.test(issue)));
});

test("masteryLevel keeps tests and mastery distinct: transfert needs a real prediction", () => {
  assert.strictEqual(masteryLevel("tests", { checkpointOk: true, transfertCount: 0 }), "tests");
  assert.strictEqual(masteryLevel("explication", { checkpointOk: true, transfertCount: 0 }), "explication");
  assert.strictEqual(masteryLevel("transfert", { checkpointOk: true, transfertCount: 0 }), null);
  assert.strictEqual(masteryLevel("transfert", { checkpointOk: true, transfertCount: 1 }), "transfert");
  assert.strictEqual(masteryLevel("transfert", { checkpointOk: false, transfertCount: 1 }), null);
});
