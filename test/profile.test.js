"use strict";

const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");
const { capture, homeEnvOverrides } = require("./helpers");

const { validateProfile, readProfile, setProfile, profilePath } = require("../bin/lib/profile");
const { checkProject } = require("../bin/lib/check");
const { printProfile } = require("../bin/lib/status");

const CLI = path.join(__dirname, "..", "bin", "ai-learn.js");
const VALID = {
  goals: ["Savoir déployer un service"],
  dailyMinutes: 45,
  focus: { now: ["Linux"], later: ["Kubernetes"], avoid: [] },
  projects: [{ name: "exemple", summary: "un service HTTP minimal" }],
};

function tmpHome() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "ai-learn-profile-home-"));
}

function cli(home, args) {
  const result = spawnSync(process.execPath, [CLI, ...args], {
    encoding: "utf8",
    env: { ...process.env, ...homeEnvOverrides(home) },
    cwd: home,
  });
  return { status: result.status, out: result.stdout, err: result.stderr };
}

test("validateProfile accepts a complete profile and empty lists", () => {
  assert.deepStrictEqual(validateProfile(VALID), []);
  assert.deepStrictEqual(
    validateProfile({ goals: [], dailyMinutes: 1, focus: { now: [], later: [], avoid: [] }, projects: [] }),
    [],
  );
});

test("validateProfile names each bad field", () => {
  const bad = (patch) => validateProfile({ ...VALID, ...patch });

  assert.ok(bad({ dailyMinutes: 0 }).some((i) => /dailyMinutes/.test(i)));
  assert.ok(bad({ dailyMinutes: 1.5 }).some((i) => /dailyMinutes/.test(i)));
  assert.ok(bad({ goals: [""] }).some((i) => /goals/.test(i)));
  assert.ok(bad({ goals: Array(21).fill("x") }).some((i) => /goals.*20/.test(i)));
  assert.ok(bad({ surprise: 1 }).some((i) => /surprise/.test(i)));
  assert.ok(bad({ focus: { now: [], later: [], avoid: [], extra: [] } }).some((i) => /focus\.extra/.test(i)));
  assert.ok(bad({ focus: { now: [3], later: [], avoid: [] } }).some((i) => /focus\.now/.test(i)));
  assert.ok(bad({ projects: [{ name: "a" }] }).some((i) => /projects\[0\]\.summary/.test(i)));
  assert.ok(validateProfile(null).length > 0);
});

test("profile --json reports exists false when missing", () => {
  const home = tmpHome();
  const { status, out } = cli(home, ["profile", "--json"]);

  assert.strictEqual(status, 0);
  assert.deepStrictEqual(JSON.parse(out), { exists: false });
});

test("profile set writes a versioned profile", () => {
  const home = tmpHome();
  const { status } = cli(home, ["profile", "set", "--json", JSON.stringify(VALID)]);

  assert.strictEqual(status, 0);
  const written = JSON.parse(fs.readFileSync(profilePath({ home }), "utf8"));
  assert.strictEqual(written.version, 1);
  assert.match(written.updatedAt, /^\d{4}-\d\d-\d\dT/);
  assert.deepStrictEqual(written.goals, VALID.goals);
  assert.strictEqual(written.dailyMinutes, 45);

  const read = JSON.parse(cli(home, ["profile", "--json"]).out);
  assert.strictEqual(read.exists, true);
  assert.strictEqual(read.profile.dailyMinutes, 45);
});

test("profile set refuses invalid fields and leaves the file untouched", () => {
  const home = tmpHome();
  setProfile(VALID, { home });
  const before = fs.readFileSync(profilePath({ home }), "utf8");

  for (const patch of [{ dailyMinutes: 0 }, { inconnu: true }]) {
    const { status, err } = cli(home, ["profile", "set", "--json", JSON.stringify({ ...VALID, ...patch })]);
    assert.strictEqual(status, 1);
    assert.match(err, /dailyMinutes|inconnu/);
  }
  assert.strictEqual(fs.readFileSync(profilePath({ home }), "utf8"), before);

  const notJson = cli(home, ["profile", "set", "--json", "{pas du json"]);
  assert.strictEqual(notJson.status, 1);
  assert.strictEqual(fs.readFileSync(profilePath({ home }), "utf8"), before);
});

test("readProfile distinguishes missing, invalid and valid", () => {
  const home = tmpHome();
  assert.deepStrictEqual(readProfile({ home }), { exists: false, valid: false, profile: null, issues: [] });

  fs.mkdirSync(path.dirname(profilePath({ home })), { recursive: true });
  fs.writeFileSync(profilePath({ home }), "{ cassé");
  const broken = readProfile({ home });
  assert.strictEqual(broken.exists, true);
  assert.strictEqual(broken.valid, false);
  assert.match(broken.issues[0], /JSON/);

  setProfile(VALID, { home });
  assert.strictEqual(readProfile({ home }).valid, true);
});

test("check reports a corrupt profile", () => {
  const home = tmpHome();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ai-learn-profile-proj-"));
  fs.writeFileSync(path.join(dir, "progress.json"), JSON.stringify({ project: "p", technology: "t", phases: [] }));
  fs.mkdirSync(path.dirname(profilePath({ home })), { recursive: true });
  fs.writeFileSync(profilePath({ home }), "{ cassé");

  const { issues } = checkProject(dir, { home });
  const found = issues.errors.find((e) => /profile\.json/.test(e.file));

  assert.ok(found, "an error names profile.json");
  assert.match(found.message, /JSON/);
});

test("status prints the profile line", () => {
  const home = tmpHome();
  assert.strictEqual(capture(() => printProfile({ home })), "");

  setProfile(VALID, { home });
  assert.match(capture(() => printProfile({ home })), /profil : Savoir déployer un service · 45 min\/jour/);
});
