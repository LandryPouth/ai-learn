"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

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

module.exports = { tmpProject, writeFile, capture, sampleProgress, homeEnvOverrides, spawnGit };
