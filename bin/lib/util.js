"use strict";

// Shared helpers: I/O, logging, project discovery. Dependency-free on purpose —
// the whole CLI runs on the Node standard library so it is shareable anywhere.

const fs = require("fs");
const path = require("path");

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

module.exports = { log, fail, UsageError, readJson, writeJson, mkdirp, normalizePortable, findLearningProjects };
