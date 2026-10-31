"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

// Story 09.01 — every test process runs with its own throwaway home. About 90
// calls (verify, check, next, status) reached `os.homedir()` without an
// injected `home` and filled the real `~/.ai-learn` ledgers with `/tmp`
// projects. Redirecting HOME/USERPROFILE once, where every test file starts,
// covers today's calls and tomorrow's; the production safety net in
// bin/lib/tracks/store.js still refuses the real home for any test that does
// not load this file. CLIs spawned with `process.env` inherit it too.
const ISOLATED_HOME = fs.mkdtempSync(path.join(os.tmpdir(), "ai-learn-home-"));
process.env.HOME = ISOLATED_HOME;
process.env.USERPROFILE = ISOLATED_HOME;

// `npm test` runs under `node --test`, which sets NODE_TEST_CONTEXT; a nested
// `node --test` checkpoint then reports differently (no TAP, failures exit 0).
// Tests that run a real `node --test` checkpoint must drop it.
function withoutNodeTestContext(fn) {
  const saved = process.env.NODE_TEST_CONTEXT;
  delete process.env.NODE_TEST_CONTEXT;

  try {
    return fn();
  } finally {
    if (saved !== undefined) {
      process.env.NODE_TEST_CONTEXT = saved;
    }
  }
}

function tmpProject(progress) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ai-learn-test-"));
  fs.writeFileSync(path.join(dir, "progress.json"), `${JSON.stringify(progress, null, 2)}\n`);
  return dir;
}

function writeFile(dir, relPath, content) {
  const full = path.join(dir, relPath);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content);
  return full;
}

function capture(fn) {
  const writes = [];
  const original = process.stdout.write;

  process.stdout.write = (chunk, ...rest) => {
    writes.push(String(chunk));
    return true;
  };

  try {
    fn();
  } finally {
    process.stdout.write = original;
  }

  return writes.join("");
}

// os.homedir() reads USERPROFILE on Windows, not HOME — a test env override
// that sets only HOME silently fails to isolate the CLI there and it falls
// through to the real machine home directory. Set both everywhere a test
// redirects home, whether via a child-process env or an in-process mutation.
function homeEnvOverrides(home, extra = {}) {
  return { HOME: home, USERPROFILE: home, ...extra };
}

// Fixture git repos build their own history in a tmpDir, isolated from the
// real repo via `-C`/`cwd` — but git also hands a hook's own process
// GIT_DIR/GIT_WORK_TREE/GIT_INDEX_FILE/GIT_COMMON_DIR pointing at the real
// repo, and `-C`/`cwd` don't override an already-set GIT_DIR. Running these
// fixtures from inside `.githooks/pre-push` (itself an `npm test` call)
// inherited that env and wrote fixture commits into the real repo instead of
// tmpDir (see docs/DOGFOODING.md). Stripping the four GIT_* vars here is the
// isolation `-C`/`cwd` alone can't provide.
function spawnGit(args, opts = {}) {
  const env = { ...process.env, ...opts.env };
  delete env.GIT_DIR;
  delete env.GIT_WORK_TREE;
  delete env.GIT_INDEX_FILE;
  delete env.GIT_COMMON_DIR;

  return spawnSync("git", args, { ...opts, env });
}

function sampleProgress(overrides = {}) {
  return {
    version: 1,
    project: "demo",
    technology: "Node",
    docSource: null,
    phases: [
      { id: 0, name: "Phase zero", status: "pending", checkpoint: "node -e \"process.exit(0)\"", artifacts: [], predictionsRequired: 0 },
    ],
    ...overrides,
  };
}

// Run `fn` with os.homedir() pointed at an isolated directory, then restore the
// environment. Same HOME + USERPROFILE pair as homeEnvOverrides, for in-process
// calls that reach os.homedir() (platform installers, `check`'s platform
// detection) without going through a child process.
function withHome(home, fn) {
  const original = { HOME: process.env.HOME, USERPROFILE: process.env.USERPROFILE };
  process.env.HOME = home;
  process.env.USERPROFILE = home;

  try {
    return fn();
  } finally {
    process.env.HOME = original.HOME;
    process.env.USERPROFILE = original.USERPROFILE;
  }
}

// Story 09.06 — a revisit lock as `ai-learn revisit` leaves it once the code is
// removed, for tests that exercise `verify --revisit` on its own.
function activeRevisitLock(dir, phaseId, extra = {}) {
  const backup = path.join(dir, ".ai-learn", "revisit", String(phaseId));
  fs.mkdirSync(backup, { recursive: true });
  fs.writeFileSync(path.join(backup, "manifest.json"), "[]\n");
  fs.writeFileSync(
    path.join(dir, ".ai-learn", "revisit.lock.json"),
    `${JSON.stringify({ phaseId, startedAt: new Date().toISOString(), state: "active", files: [], ...extra })}\n`,
  );
}

// Story 10.07 — a finished track owes its bilan (`check` errors without one).
// Tests whose subject is something else fill it so they stay about that subject.
function writeCompleteBilan(dir) {
  const sections = ["Encore fragile", "Erreurs marquantes", "Compromis d'architecture", "Réutilisable dans mes projets"]
    .map((title) => `## ${title}\n\nRéponse.\n`)
    .join("\n");

  writeFile(dir, "docs/bilan.md", `# Bilan\n\n${sections}\n## Recommandation\n\nlabo\n`);
}

module.exports = { writeCompleteBilan, activeRevisitLock, ISOLATED_HOME, tmpProject, writeFile, capture, sampleProgress, homeEnvOverrides, withHome, spawnGit, withoutNodeTestContext };
