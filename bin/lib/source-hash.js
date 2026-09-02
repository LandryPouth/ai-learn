"use strict";

// The empreinte (fingerprint) of what a phase's proof actually covers: the
// learner's own files (the guard's `learnerFiles` glob) plus the checkpoint
// file itself. `verify` writes it into the evidence; `progress.js#phaseVerdict`
// compares it against a freshly computed one to tell "proven" from "stale".
//
// Kept out of progress.js on purpose: progress.js is a leaf module (no
// internal `require`s, see docs/architecture.md) to avoid a require cycle
// through status.js → tracks/domain.js → scan.js. Computing the hash needs
// scan.js's walkSources and guard.js's learnerFiles matching, so it lives
// here instead, imported by the callers (verify, check, status, next) that
// already sit on the non-leaf side of that boundary.

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { walkSources } = require("./scan");
const { loadGuardConfig, matchesLearnerPath } = require("./guard");
const { normalizePortable } = require("./util");

// Extract the test file path a checkpoint command points at, if any. The
// checkpoint format is a shell command (ex. `node --test checkpoint/phase-1.test.mjs`);
// look for a token that resolves to an existing file relative to the project.
function checkpointFilePath(dir, command) {
  if (typeof command !== "string") {
    return null;
  }

  const tokens = command.split(/\s+/);

  for (const token of tokens) {
    if (!token || token.startsWith("-")) {
      continue;
    }

    const candidate = path.resolve(dir, token);

    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
      return candidate;
    }
  }

  return null;
}

// Sorted, portable, relative paths of every file the hash covers. Sorting on
// the normalized relative path (not directory read order) is what makes the
// digest independent of both OS path separator and filesystem iteration
// order.
function sourceHashScope(dir, { checkpointFile } = {}) {
  const { learnerFiles } = loadGuardConfig(dir);
  const walked = walkSources(dir);

  const rels = walked.files.filter((f) => matchesLearnerPath(f.rel, learnerFiles)).map((f) => f.rel);

  if (checkpointFile) {
    const rel = normalizePortable(path.relative(dir, checkpointFile));

    if (!rels.includes(rel)) {
      rels.push(rel);
    }
  }

  rels.sort();
  return rels;
}

// sha256 over the sorted scope: for each file, "path\n" then its raw bytes.
// Byte-based on purpose — a CRLF/LF difference is a real change to the file,
// not noise to normalize away (see docs/architecture.md, Decisions).
function computeSourceHash(dir, opts = {}) {
  const rels = sourceHashScope(dir, opts);
  const hash = crypto.createHash("sha256");

  for (const rel of rels) {
    hash.update(`${rel}\n`);

    try {
      hash.update(fs.readFileSync(path.join(dir, rel)));
    } catch {
      // Removed between listing and reading — its absence is itself part of
      // what changed; the path is already in the digest.
    }
  }

  return { algo: "sha256", files: rels.length, digest: hash.digest("hex") };
}

module.exports = { checkpointFilePath, computeSourceHash };
