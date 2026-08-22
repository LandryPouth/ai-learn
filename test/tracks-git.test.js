"use strict";

// `bin/lib/tracks/git.js` — the global, home-scoped git/gh mastery ledger.
// Schema/validation round-trip (M2) plus signal capture + syncGitTrack (M3),
// with an injected `home` throughout so the real `$HOME` is never touched
// (same pattern as test/install.test.js's `tmpHome()`).

const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const {
  TIER_IDS,
  tracksHome,
  tracksPath,
  defaultGitTracks,
  readGitTracks,
  readOrDefaultGitTracks,
  validateGitTracks,
  writeGitTracks,
  captureGitSignals,
  syncGitTrack,
} = require("../bin/lib/tracks/git");

function tmpDir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function tmpHome() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "ai-learn-tracks-"));
}

test("tracksPath is ~/.ai-learn/tracks/git.json under the given home", () => {
  const home = tmpHome();
  assert.strictEqual(tracksHome({ home }), path.join(home, ".ai-learn", "tracks"));
  assert.strictEqual(tracksPath({ home }), path.join(home, ".ai-learn", "tracks", "git.json"));
});

test("defaultGitTracks has all 6 tiers, unachieved, empty evidence", () => {
  const config = defaultGitTracks();
  assert.strictEqual(config.version, 1);
  assert.deepStrictEqual(Object.keys(config.tiers).map(Number).sort(), TIER_IDS);
  for (const tier of TIER_IDS) {
    assert.strictEqual(config.tiers[String(tier)].achieved, false);
    assert.deepStrictEqual(config.tiers[String(tier)].evidence, []);
  }
  assert.deepStrictEqual(config.projects, {});
});

test("readGitTracks reports absent when no ledger exists yet, never touching real $HOME", () => {
  const home = tmpHome();
  const { config, exists } = readGitTracks({ home });
  assert.strictEqual(config, null);
  assert.strictEqual(exists, false);
});

test("writeGitTracks + readGitTracks round-trip", () => {
  const home = tmpHome();
  const config = defaultGitTracks();
  config.tiers["1"].achieved = true;
  config.tiers["1"].evidence.push({ at: "2026-01-01T00:00:00.000Z", project: "/tmp/x", kind: "commit-msg" });

  writeGitTracks(config, { home });
  assert.ok(fs.existsSync(tracksPath({ home })));

  const { config: reread, exists } = readGitTracks({ home });
  assert.strictEqual(exists, true);
  assert.strictEqual(reread.tiers["1"].achieved, true);
  assert.strictEqual(reread.tiers["1"].evidence.length, 1);
});

test("validateGitTracks accepts a well-formed default ledger", () => {
  assert.deepStrictEqual(validateGitTracks(defaultGitTracks()), []);
});

test("validateGitTracks reports structural errors on a corrupt ledger", () => {
  assert.ok(validateGitTracks(null).some((i) => i.level === "error"));
  assert.ok(validateGitTracks({ version: 2, tiers: {} }).some((i) => /version/.test(i.message)));
  assert.ok(validateGitTracks({ version: 1, tiers: "nope" }).some((i) => /tiers must be an object/.test(i.message)));

  const missingTier = defaultGitTracks();
  delete missingTier.tiers["3"];
  assert.ok(validateGitTracks(missingTier).some((i) => /tier 3 entry missing/.test(i.message)));

  const badShape = defaultGitTracks();
  badShape.tiers["2"].achieved = "yes";
  badShape.tiers["4"].evidence = "nope";
  const issues = validateGitTracks(badShape);
  assert.ok(issues.some((i) => /tier 2\.achieved must be a boolean/.test(i.message)));
  assert.ok(issues.some((i) => /tier 4\.evidence must be an array/.test(i.message)));

  assert.ok(validateGitTracks({ version: 1, tiers: defaultGitTracks().tiers, projects: "nope" }).some((i) => /projects must be an object/.test(i.message)));
});

test("readOrDefaultGitTracks falls back to a fresh default without writing anything", () => {
  const home = tmpHome();
  const config = readOrDefaultGitTracks({ home });
  assert.deepStrictEqual(config, defaultGitTracks());
  assert.ok(!fs.existsSync(tracksPath({ home })), "must not create a file on a read-only call");
});

test("readOrDefaultGitTracks falls back on a corrupt on-disk ledger rather than trusting it", () => {
  const home = tmpHome();
  fs.mkdirSync(tracksHome({ home }), { recursive: true });
  fs.writeFileSync(tracksPath({ home }), JSON.stringify({ version: 2, tiers: {} }));

  const config = readOrDefaultGitTracks({ home });
  assert.deepStrictEqual(config, defaultGitTracks());
});

// --- signal capture (M3) ----------------------------------------------------

function initRepo(dir) {
  spawnSync("git", ["init", "-b", "main"], { cwd: dir });
  spawnSync("git", ["-C", dir, "config", "user.name", "t"]);
  spawnSync("git", ["-C", dir, "config", "user.email", "t@t"]);
}

function git(dir, args) {
  return spawnSync("git", ["-C", dir, ...args], { encoding: "utf8" });
}

function writeAndCommit(dir, file, content, message) {
  fs.writeFileSync(path.join(dir, file), content);
  git(dir, ["add", "."]);
  return git(dir, ["commit", "-m", message]);
}

test("captureGitSignals on a non-git directory returns all-empty signals without throwing", () => {
  const dir = tmpDir("ai-learn-tracks-repo-");
  const signals = captureGitSignals(dir);
  assert.deepStrictEqual(signals.reflog, { amend: false, rebase: false, cherryPick: false });
  assert.strictEqual(signals.stash.count, 0);
  assert.strictEqual(signals.merge, null);
});

test("captureGitSignals detects a real amend via reflog", () => {
  const dir = tmpDir("ai-learn-tracks-repo-");
  initRepo(dir);
  writeAndCommit(dir, "a.txt", "1", "feat: a");
  git(dir, ["commit", "--amend", "-m", "feat: a (amended)"]);

  const signals = captureGitSignals(dir);
  assert.strictEqual(signals.reflog.amend, true);
});

test("captureGitSignals detects a real interactive rebase via reflog", () => {
  const dir = tmpDir("ai-learn-tracks-repo-");
  initRepo(dir);
  writeAndCommit(dir, "base.txt", "0", "feat: base");
  writeAndCommit(dir, "a.txt", "1", "feat: a");
  writeAndCommit(dir, "b.txt", "2", "feat: b");

  const rebase = spawnSync("git", ["-C", dir, "rebase", "-i", "HEAD~2"], {
    encoding: "utf8",
    env: { ...process.env, GIT_SEQUENCE_EDITOR: "true", GIT_EDITOR: "true" },
  });
  assert.strictEqual(rebase.status, 0, rebase.stderr);

  const signals = captureGitSignals(dir);
  assert.strictEqual(signals.reflog.rebase, true);
});

test("captureGitSignals detects a real cherry-pick via reflog", () => {
  const dir = tmpDir("ai-learn-tracks-repo-");
  initRepo(dir);
  writeAndCommit(dir, "a.txt", "1", "feat: a");
  git(dir, ["checkout", "-b", "feature"]);
  writeAndCommit(dir, "b.txt", "2", "feat: b");
  const pickHash = git(dir, ["rev-parse", "HEAD"]).stdout.trim();
  git(dir, ["checkout", "main"]);

  const pick = git(dir, ["cherry-pick", pickHash]);
  assert.strictEqual(pick.status, 0, pick.stderr);

  const signals = captureGitSignals(dir);
  assert.strictEqual(signals.reflog.cherryPick, true);
});

test("captureGitSignals counts real stash entries via refs/stash", () => {
  const dir = tmpDir("ai-learn-tracks-repo-");
  initRepo(dir);
  writeAndCommit(dir, "a.txt", "1", "feat: a");
  fs.writeFileSync(path.join(dir, "a.txt"), "2");
  const stash = git(dir, ["stash", "push"]);
  assert.strictEqual(stash.status, 0, stash.stderr);

  const signals = captureGitSignals(dir);
  assert.strictEqual(signals.stash.count, 1);
});

test("captureGitSignals corroborates a real, resolved merge conflict", () => {
  const dir = tmpDir("ai-learn-tracks-repo-");
  initRepo(dir);
  writeAndCommit(dir, "a.txt", "base", "feat: base");
  git(dir, ["checkout", "-b", "feature"]);
  writeAndCommit(dir, "a.txt", "feature-line", "feat: feature change");
  git(dir, ["checkout", "main"]);
  writeAndCommit(dir, "a.txt", "main-line", "feat: main change");

  const merge = git(dir, ["merge", "feature", "-m", "merge feature"]);
  assert.notStrictEqual(merge.status, 0, "expected a real conflict");

  fs.writeFileSync(path.join(dir, "a.txt"), "resolved");
  git(dir, ["add", "."]);
  const commit = git(dir, ["commit", "-m", "merge feature"]);
  assert.strictEqual(commit.status, 0, commit.stderr);

  const signals = captureGitSignals(dir);
  assert.ok(signals.merge);
  assert.strictEqual(signals.merge.hash, git(dir, ["rev-parse", "HEAD"]).stdout.trim());
});

// --- syncGitTrack (M3) -------------------------------------------------------

test("syncGitTrack marks only the phase's declared gitTier achieved, on a real pass", () => {
  const home = tmpHome();
  const dir = tmpDir("ai-learn-tracks-repo-");
  initRepo(dir);
  writeAndCommit(dir, "a.txt", "1", "feat: a");

  const phase = { id: 0, name: "Commits propres", gitTier: 1 };
  const result = syncGitTrack({ dir, phase, verifyEvidence: { ok: true }, home });

  assert.deepStrictEqual(result.touchedTiers, [1]);

  const { config } = readGitTracks({ home });
  assert.strictEqual(config.tiers["1"].achieved, true);
  assert.strictEqual(config.tiers["1"].evidence.length, 1);
  assert.strictEqual(config.tiers["1"].evidence[0].project, dir);
  for (const tier of TIER_IDS.filter((t) => t !== 1)) {
    assert.strictEqual(config.tiers[String(tier)].achieved, false);
  }
});

test("syncGitTrack records ambient signals as evidence without marking them achieved", () => {
  const home = tmpHome();
  const dir = tmpDir("ai-learn-tracks-repo-");
  initRepo(dir);
  writeAndCommit(dir, "a.txt", "1", "feat: a");
  fs.writeFileSync(path.join(dir, "a.txt"), "2");
  git(dir, ["stash", "push"]);

  const phase = { id: 0, name: "Untagged phase" }; // no gitTier
  syncGitTrack({ dir, phase, verifyEvidence: { ok: true }, home });

  const { config } = readGitTracks({ home });
  assert.strictEqual(config.tiers["2"].achieved, false, "ambient stash evidence must not self-certify mastery");
  assert.strictEqual(config.tiers["2"].evidence.length, 1);
});

test("syncGitTrack is a no-op when the checkpoint did not really pass", () => {
  const home = tmpHome();
  const dir = tmpDir("ai-learn-tracks-repo-");
  initRepo(dir);

  const phase = { id: 0, name: "P", gitTier: 1 };
  const result = syncGitTrack({ dir, phase, verifyEvidence: { ok: false }, home });

  assert.strictEqual(result, null);
  assert.strictEqual(readGitTracks({ home }).exists, false);
});

test("syncGitTrack on a non-git project writes empty-signal evidence without crashing", () => {
  const home = tmpHome();
  const dir = tmpDir("ai-learn-tracks-repo-");

  const phase = { id: 0, name: "P", gitTier: 1 };
  const result = syncGitTrack({ dir, phase, verifyEvidence: { ok: true }, home });

  assert.deepStrictEqual(result.touchedTiers, [1]);
});
