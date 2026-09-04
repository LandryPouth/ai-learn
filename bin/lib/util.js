"use strict";

// Shared helpers: I/O, logging, project discovery. Dependency-free on purpose —
// the whole CLI runs on the Node standard library so it is shareable anywhere.

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

function log(message = "") {
  process.stdout.write(`${message}\n`);
}

// A user-facing error (wrong flags, missing ledger, unknown phase). Thrown rather
// than calling process.exit so the library is testable; the CLI entry converts it
// into a clean "Error: …" + exit 1. Anything else is a bug and reaches the
// uncaughtException handler instead.
class UsageError extends Error {}

function fail(message) {
  throw new UsageError(message);
}

function readJson(filePath, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function mkdirp(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
  return dirPath;
}

function normalizePortable(value) {
  return value.replace(/\\/g, "/");
}

// A directory is a learning project when it carries a progress.json. Discovery is
// shallow-recursive and skips the usual noise (git, deps, the evidence dir) and
// dot-directories, so `ai-learn check --root tech-experiments` finds every
// learning track without tripping over tooling.
function findLearningProjects(rootDir) {
  const projects = [];

  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name.startsWith(".")) {
        continue;
      }
      if (entry.name === "node_modules") {
        continue;
      }
      const full = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        if (fs.existsSync(path.join(full, "progress.json"))) {
          projects.push(full);
        } else {
          walk(full);
        }
      }
    }
  };

  if (fs.existsSync(path.join(rootDir, "progress.json"))) {
    return [rootDir];
  }

  walk(rootDir);
  return projects;
}

// A caller below always names its target directory explicitly (`-C dir`,
// `init dir`, or `cwd: dir`), but git — and `gh`, which resolves "the current
// repo" via the same git plumbing — also honor a hook's own process GIT_DIR
// (and GIT_WORK_TREE/GIT_INDEX_FILE/GIT_COMMON_DIR) pointing at whatever repo
// is currently mid-operation. `-C`/`cwd` don't override an already-set
// GIT_DIR, so an inherited one silently redirects a command meant for `dir`
// onto that other repo instead. Reproduced live, twice: `.githooks/pre-push`
// runs `npm test`, which inherits this env — the test fixtures and `docs.js`'s
// real sparse-clone path wrote into the actual project repo (collapsing its
// sparse-checkout to whatever `--path` a docs-source test happened to use),
// and separately `gh pr list --author=@me` returned the real repo's PRs
// instead of a tmp fixture's empty history (see docs/DOGFOODING.md).
// Stripping the four GIT_* vars here is the isolation `-C`/`cwd` alone can't
// provide, for either binary.
function gitIsolatedEnv(extra = {}) {
  const env = { ...process.env, ...extra };
  delete env.GIT_DIR;
  delete env.GIT_WORK_TREE;
  delete env.GIT_INDEX_FILE;
  delete env.GIT_COMMON_DIR;
  return env;
}

function spawnGit(args, opts = {}) {
  return spawnSync("git", args, { ...opts, env: gitIsolatedEnv(opts.env) });
}

module.exports = {
  log,
  fail,
  UsageError,
  readJson,
  writeJson,
  mkdirp,
  normalizePortable,
  findLearningProjects,
  spawnGit,
  gitIsolatedEnv,
};
