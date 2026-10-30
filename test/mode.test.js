"use strict";

// `bin/lib/mode.js` — the earned-mode gate (story 03.02): `dirigeant` only when
// tiers 1-3 of the global ledger are achieved, `apprenti` always permitted, and
// an absent/corrupt ledger refuses instead of granting access by default.

const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const { UsageError } = require("../bin/lib/util");
const { defaultTestsTracks, tracksPath } = require("../bin/lib/tracks/tests");
const { checkProject } = require("../bin/lib/check");
const { modeCommand, requiredTiersStatus } = require("../bin/lib/mode");
const { capture, homeEnvOverrides, sampleProgress, tmpProject, writeFile } = require("./helpers");

const BIN = path.join(__dirname, "..", "bin", "ai-learn.js");

function tmpHome() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "ai-learn-mode-"));
}

function ledgerFor(achieved = [1, 2, 3], overrides = {}) {
  const config = defaultTestsTracks();

  for (const tier of achieved) {
    config.tiers[String(tier)].achieved = true;
  }

  return { ...config, ...overrides };
}

function writeLedger(home, config) {
  writeFile(home, ".ai-learn/tracks/tests.json", JSON.stringify(config));
}

function projectWithGuard(guard = { version: 1, learnerFiles: ["src/**"] }) {
  const dir = tmpProject(sampleProgress());
  writeFile(dir, ".ai-learn/guard.json", JSON.stringify(guard));
  return dir;
}

function readGuard(dir) {
  return JSON.parse(fs.readFileSync(path.join(dir, ".ai-learn", "guard.json"), "utf8"));
}

const isUsageError = (pattern) => (error) => {
  assert.ok(error instanceof UsageError, `expected a UsageError, got ${error && error.constructor.name}`);
  assert.match(error.message, pattern);
  return true;
};

test("dirigeant is granted when tiers 1-3 are achieved, and the switch is traced", () => {
  const home = tmpHome();
  const dir = projectWithGuard({
    version: 1,
    learnerFiles: ["lib/**"],
    implementationFiles: ["lib/**"],
    blockedCommands: ["git"],
    note: "learner field",
  });
  writeLedger(home, ledgerFor([1, 2, 3]));
  const ledgerBefore = fs.readFileSync(tracksPath({ home }), "utf8");

  capture(() => modeCommand({ dir, target: "dirigeant", home }));

  const guard = readGuard(dir);
  assert.strictEqual(guard.mode, "dirigeant");
  assert.deepStrictEqual(guard.modeTiers, [1, 2, 3]);
  assert.ok(!Number.isNaN(Date.parse(guard.modeChangedAt)), "modeChangedAt must be an ISO date");
  assert.deepStrictEqual(guard.learnerFiles, ["lib/**"], "learner config is preserved");
  assert.deepStrictEqual(guard.implementationFiles, ["lib/**"], "the proof scope is preserved");
  assert.deepStrictEqual(guard.blockedCommands, ["git"]);
  assert.strictEqual(guard.note, "learner field", "unknown learner fields are preserved");
  assert.deepStrictEqual(requiredTiersStatus({ home }).tiers, [1, 2, 3]);
  assert.strictEqual(fs.readFileSync(tracksPath({ home }), "utf8"), ledgerBefore, "the gate never writes the ledger");
});

test("each missing tier refuses and names what would achieve it", () => {
  for (const missingTier of [1, 2, 3]) {
    const home = tmpHome();
    const dir = projectWithGuard();
    writeLedger(home, ledgerFor([1, 2, 3].filter((tier) => tier !== missingTier)));

    assert.throws(
      () => modeCommand({ dir, target: "dirigeant", home }),
      isUsageError(new RegExp(`tier ${missingTier} .* requires`)),
      `tier ${missingTier} must block the switch`,
    );
    assert.strictEqual(readGuard(dir).mode, undefined, "a refused switch must not write the mode");
  }
});

test("an absent ledger refuses — never access by default", () => {
  const home = tmpHome();
  const dir = projectWithGuard();

  assert.throws(() => modeCommand({ dir, target: "dirigeant", home }), isUsageError(/ledger is absent/));
  assert.strictEqual(readGuard(dir).mode, undefined);
});

test("a corrupt ledger refuses", () => {
  const home = tmpHome();
  const dir = projectWithGuard();
  writeFile(home, ".ai-learn/tracks/tests.json", "{ not json");

  assert.throws(() => modeCommand({ dir, target: "dirigeant", home }), isUsageError(/ledger is unreadable/));
  assert.strictEqual(readGuard(dir).mode, undefined);
});

test("an unknown ledger version refuses", () => {
  const home = tmpHome();
  const dir = projectWithGuard();
  const config = ledgerFor([1, 2, 3], { version: 99 });
  writeLedger(home, config);

  assert.throws(() => modeCommand({ dir, target: "dirigeant", home }), isUsageError(/unsupported tracks\/tests\.json version/));
  assert.strictEqual(readGuard(dir).mode, undefined);
});

test("mode apprenti is always permitted, even with an absent ledger and no guard.json", () => {
  const home = tmpHome();
  const dir = tmpProject(sampleProgress());

  capture(() => modeCommand({ dir, target: "apprenti", home }));

  const guard = readGuard(dir);
  assert.strictEqual(guard.mode, "apprenti");
  assert.deepStrictEqual(guard.modeTiers, []);
  assert.deepStrictEqual(guard.learnerFiles, ["src/**"]);
});

test("mode apprenti is always permitted, even with a corrupt ledger", () => {
  const home = tmpHome();
  const dir = projectWithGuard({ version: 1, mode: "dirigeant", learnerFiles: ["src/**"] });
  writeFile(home, ".ai-learn/tracks/tests.json", "{ not json");

  capture(() => modeCommand({ dir, target: "apprenti", home }));

  assert.strictEqual(readGuard(dir).mode, "apprenti");
});

test("dirigeant never overwrites a corrupt guard.json", () => {
  const home = tmpHome();
  const dir = tmpProject(sampleProgress());
  writeFile(dir, ".ai-learn/guard.json", "{ not json");
  writeLedger(home, ledgerFor([1, 2, 3]));

  assert.throws(() => modeCommand({ dir, target: "dirigeant", home }), isUsageError(/unreadable or not an object/));
  assert.strictEqual(
    fs.readFileSync(path.join(dir, ".ai-learn", "guard.json"), "utf8"),
    "{ not json",
    "the broken file is left for the learner to repair",
  );
});

test("apprenti recovers a corrupt guard.json — the exit is unconditional", () => {
  const home = tmpHome();
  const dir = tmpProject(sampleProgress());
  writeFile(dir, ".ai-learn/guard.json", "{ not json");

  capture(() => modeCommand({ dir, target: "apprenti", home }));

  assert.strictEqual(readGuard(dir).mode, "apprenti");
});

test("a wiring failure restores the previous guard.json (no half-applied switch)", () => {
  const home = tmpHome();
  const dir = projectWithGuard();
  writeLedger(home, ledgerFor([1, 2, 3]));
  const guardPath = path.join(dir, ".ai-learn", "guard.json");
  const before = fs.readFileSync(guardPath, "utf8");
  // A directory where ensureGuardHook expects to write a file makes the wiring
  // fail after guard.json was written.
  fs.mkdirSync(path.join(dir, ".claude", "settings.json"), { recursive: true });

  assert.throws(() => modeCommand({ dir, target: "dirigeant", home }), isUsageError(/wiring failed/));
  assert.strictEqual(fs.readFileSync(guardPath, "utf8"), before, "the mode is rolled back");
  // The whole generated wiring is rolled back, not just guard.json — otherwise
  // Codex/README would enforce the new mode while the policy says the old one.
  assert.strictEqual(fs.existsSync(path.join(dir, ".codex", "config.toml")), false, "Codex profile rolled back");
  assert.strictEqual(fs.existsSync(path.join(dir, "docs", "solutions", "README.md")), false, "README rolled back");
});

test("a customized Codex config is reported, not silently left on the old mode", () => {
  const home = tmpHome();
  const dir = projectWithGuard();
  writeLedger(home, ledgerFor([1, 2, 3]));
  writeFile(dir, ".codex/config.toml", "# my own config\n");

  const output = capture(() => modeCommand({ dir, target: "dirigeant", home }));

  assert.match(output, /Warning: \.codex\/config\.toml is customized/);
});

test("an unknown mode target refuses cleanly", () => {
  const home = tmpHome();
  const dir = tmpProject(sampleProgress());

  assert.throws(() => modeCommand({ dir, target: "expert", home }), isUsageError(/apprenti.*dirigeant/));
  assert.strictEqual(fs.existsSync(path.join(dir, ".ai-learn", "guard.json")), false);
});

test("check errors when guard.json claims dirigeant without the ledger proof", () => {
  const home = tmpHome();
  const dir = projectWithGuard({ version: 1, mode: "dirigeant" });
  writeLedger(home, ledgerFor([1, 2]));

  const entry = checkProject(dir, { home });

  assert.ok(
    entry.issues.errors.some((error) => /does not prove tiers 1-3/.test(error.message) && /tier 3/.test(error.message)),
    "the divergence between mode and ledger is an error",
  );
});

test("check errors when guard.json claims dirigeant and the ledger is absent", () => {
  const home = tmpHome();
  const dir = projectWithGuard({ version: 1, mode: "dirigeant" });

  const entry = checkProject(dir, { home });

  assert.ok(entry.issues.errors.some((error) => /ledger is absent/.test(error.message)));
});

test("check reports no mode/ledger error when the ledger backs dirigeant", () => {
  const home = tmpHome();
  const dir = projectWithGuard({ version: 1, mode: "dirigeant" });
  writeLedger(home, ledgerFor([1, 2, 3]));

  const entry = checkProject(dir, { home });

  assert.ok(!entry.issues.errors.some((error) => /does not prove tiers 1-3/.test(error.message)));
});

test("check never requires the ledger in apprenti mode", () => {
  const home = tmpHome();
  const dir = projectWithGuard({ version: 1, mode: "apprenti" });

  const entry = checkProject(dir, { home });

  assert.ok(!entry.issues.errors.some((error) => /does not prove tiers 1-3/.test(error.message)));
});

test("the CLI refuses dirigeant end to end, naming the missing tier", () => {
  const home = tmpHome();
  const dir = projectWithGuard();
  writeLedger(home, ledgerFor([1, 2]));

  const result = spawnSync(process.execPath, [BIN, "mode", "dirigeant", "--dir", dir], {
    encoding: "utf8",
    env: { ...process.env, ...homeEnvOverrides(home, { CLAUDECODE: "" }) },
  });

  assert.strictEqual(result.status, 1);
  assert.match(result.stderr, /tier 3/);
  assert.doesNotMatch(result.stderr, /at Object/);
  assert.strictEqual(readGuard(dir).mode, undefined);
});

test("--platform before the target does not swallow it", () => {
  const home = tmpHome();
  const dir = projectWithGuard({ version: 1, mode: "dirigeant" });

  const result = spawnSync(process.execPath, [BIN, "mode", "--platform", "claude", "apprenti", "--dir", dir], {
    encoding: "utf8",
    env: { ...process.env, ...homeEnvOverrides(home, { CLAUDECODE: "" }) },
  });

  assert.strictEqual(result.status, 0, result.stderr);
  assert.strictEqual(readGuard(dir).mode, "apprenti");
});

test("the CLI grants dirigeant end to end and wires the mode", () => {
  const home = tmpHome();
  const dir = projectWithGuard();
  writeLedger(home, ledgerFor([1, 2, 3]));

  const result = spawnSync(process.execPath, [BIN, "mode", "dirigeant", "--dir", dir], {
    encoding: "utf8",
    env: { ...process.env, ...homeEnvOverrides(home, { CLAUDECODE: "" }) },
  });

  assert.strictEqual(result.status, 0);
  assert.match(result.stdout, /Mode dirigeant/);
  assert.strictEqual(readGuard(dir).mode, "dirigeant");
  assert.ok(fs.existsSync(path.join(dir, ".claude", "settings.json")), "the guard hook is re-wired");
  const codex = fs.readFileSync(path.join(dir, ".codex", "config.toml"), "utf8");
  assert.match(codex, /ai-learn-guard/);
  assert.match(codex, /"test" = "deny"/, "the Codex profile follows the inverted mode");
});

// Story 09.01 — tiers earned only by projects that no longer exist (the test
// suite's /tmp projects) no longer open dirigeant once the ledger is repaired.
test("dirigeant refuses after a repair leaves no real evidence", () => {
  const { repairLedgers } = require("../bin/lib/ledgers");
  const home = tmpHome();
  const dir = projectWithGuard();
  const gone = path.join(os.tmpdir(), "ai-learn-vanished-project-does-not-exist");
  const ledger = ledgerFor([1, 2, 3]);

  for (const tier of [1, 2, 3]) {
    ledger.tiers[String(tier)].evidence.push({ project: gone, phaseId: 0, kind: "mutation-observed" });
  }
  ledger.projects[gone] = { tiersAchieved: [1, 2, 3] };
  writeLedger(home, ledger);
  assert.strictEqual(requiredTiersStatus({ home }).ok, true, "before the repair, the polluted ledger opens dirigeant");

  repairLedgers({ home });

  assert.throws(() => modeCommand({ dir, target: "dirigeant", home }), isUsageError(/tier/i));
  assert.strictEqual(readGuard(dir).mode, undefined);
});
