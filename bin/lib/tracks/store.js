"use strict";

// The single write point for every home-scoped ledger (`~/.ai-learn/tracks/*`,
// `~/.ai-learn/domains/*`). Story 09.01: the maintainer's `npm test` kept
// filling the real ledgers with `/tmp` projects (cleaned by hand on 2026-10-19,
// polluted again twice since) because any test that forgot to pass an isolated
// `home` silently wrote to the real one. A rule that depends on every future
// test remembering an argument fails again, so the guard lives here, in
// production code: under the Node test runner (`NODE_TEST_CONTEXT`, set by
// `node --test` in every test process and inherited by the CLIs it spawns), a
// write aimed at the account's real home refuses and names the file.
//
// The real home is read from `os.userInfo().homedir` — the system account, not
// `HOME`/`USERPROFILE` — so a test that redirects `HOME` to a temp dir passes,
// and one that forgets to fails loudly instead of polluting.

const fs = require("fs");
const os = require("os");
const path = require("path");
const { readJson, writeJson } = require("../util");

function realHome() {
  try {
    return os.userInfo().homedir;
  } catch {
    return null;
  }
}

// Resolves symlinks on the longest existing ancestor, so a stand-in path that
// links into the real home is still recognized as the real home.
function realPath(target) {
  let current = path.resolve(target);
  const rest = [];

  while (true) {
    try {
      return path.join(fs.realpathSync.native(current), ...rest);
    } catch {
      const parent = path.dirname(current);
      if (parent === current) {
        return path.resolve(target);
      }
      rest.unshift(path.basename(current));
      current = parent;
    }
  }
}

function isInside(file, dir) {
  const fold = (p) => (process.platform === "win32" ? p.toLowerCase() : p);
  const relative = path.relative(fold(realPath(dir)), fold(realPath(file)));
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function assertWritable(file, { env = process.env, home = realHome() } = {}) {
  if (!env.NODE_TEST_CONTEXT || !home) {
    return;
  }

  if (isInside(file, path.join(home, ".ai-learn"))) {
    const error = new Error(
      `refus d'écrire le ledger réel ${file} depuis la suite de tests — passez un \`home\` isolé`,
    );
    error.code = "ELEDGER_REAL_HOME";
    error.path = file;
    throw error;
  }
}

// Timestamps change on every sync even when nothing was learned; comparing
// without them is what lets a replayed sync leave the file untouched.
const TIMESTAMP_KEYS = new Set(["at", "updatedAt", "lastSyncedAt"]);

function withoutTimestamps(value) {
  return JSON.stringify(value, (key, inner) => (TIMESTAMP_KEYS.has(key) ? undefined : inner));
}

// One spelling per project across every ledger: a symlinked or differently
// cased path must not count as a second project (tests tier 6 counts projects).
// A vanished folder cannot be resolved and keeps its absolute spelling.
function projectKey(dir) {
  let resolved = path.resolve(dir);
  try {
    resolved = fs.realpathSync.native(resolved);
  } catch {
    // keep the resolved spelling
  }
  return process.platform === "win32" ? resolved.toLowerCase() : resolved;
}

function mergeEntries(a, b) {
  const merged = { ...a };
  for (const [key, value] of Object.entries(b)) {
    const mine = merged[key];
    if (Array.isArray(mine) && Array.isArray(value)) {
      merged[key] = [...new Set([...mine, ...value])].sort();
    } else if (key === "lastSyncedAt" && typeof mine === "string" && typeof value === "string") {
      merged[key] = mine > value ? mine : value;
    } else if (mine === undefined) {
      merged[key] = value;
    }
  }
  return merged;
}

// Rewrites every project spelling of a ledger (`projects` keys, tier
// `evidence[].project`, concept `firstProject`) to its `projectKey`, merging
// entries that turn out to be the same project — ledgers written before the
// key was normalized (Windows casing, symlinks) would otherwise count one
// project twice. Returns how many spellings were folded into another.
function canonicalizeProjects(config) {
  const cache = new Map();
  const key = (project) => {
    if (typeof project !== "string") {
      return project;
    }
    if (!cache.has(project)) {
      cache.set(project, projectKey(project));
    }
    return cache.get(project);
  };
  let merged = 0;

  if (config.projects && typeof config.projects === "object") {
    const projects = {};
    for (const [project, entry] of Object.entries(config.projects)) {
      const canonical = key(project);
      if (projects[canonical]) {
        merged += 1;
        projects[canonical] = mergeEntries(projects[canonical], entry || {});
      } else {
        projects[canonical] = entry;
      }
    }
    config.projects = projects;
  }

  for (const tier of Object.values(config.tiers || {})) {
    if (!tier || !Array.isArray(tier.evidence)) {
      continue;
    }
    const seen = new Set();
    tier.evidence = tier.evidence.filter((e) => {
      if (!e || typeof e !== "object") {
        return true;
      }
      e.project = key(e.project);
      const id = JSON.stringify([e.project, e.phaseId, e.kind]);
      if (seen.has(id)) {
        return false;
      }
      seen.add(id);
      return true;
    });
  }

  for (const concept of Object.values(config.concepts || {})) {
    if (concept && typeof concept === "object" && "firstProject" in concept) {
      concept.firstProject = key(concept.firstProject);
    }
  }

  return merged;
}

// A ledger that exists but cannot be read is never replaced by a fresh one:
// the default a sync starts from would erase the learner's whole progression.
// The learner fixes or removes the file; `ledgers --repair` names it too.
function assertReadable(file, validate) {
  if (!validate || !fs.existsSync(file)) {
    return;
  }

  const current = readJson(file, null);
  const issues = current === null ? [{ message: "JSON illisible" }] : validate(current);

  if (issues.length > 0) {
    const error = new Error(
      `ledger illisible, laissé intact : ${file} (${issues.map((i) => i.message).join("; ")}) — le corriger ou le retirer`,
    );
    error.code = "ELEDGER_UNREADABLE";
    error.path = file;
    throw error;
  }
}

// `before` is the serialized state read from disk (or null when the file did
// not exist). `validate` is the ledger's own validator: an unreadable file on
// disk is refused rather than overwritten. Returns true when the file was
// written.
// `realHomeDir` is injectable only so the test can prove the refusal against a
// stand-in home, never by aiming at the real one.
function writeLedgerFile(file, config, { before = undefined, validate = null, realHomeDir = realHome() } = {}) {
  assertWritable(file, { home: realHomeDir });
  assertReadable(file, validate);

  if (before !== undefined && before !== null && fs.existsSync(file) && before === withoutTimestamps(config)) {
    return false;
  }

  writeJson(file, config);
  return true;
}

module.exports = {
  assertWritable,
  assertReadable,
  writeLedgerFile,
  withoutTimestamps,
  realHome,
  projectKey,
  canonicalizeProjects,
};
