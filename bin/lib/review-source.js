"use strict";

// Story 12.04 — the code a `review --from <path>` kata is drawn from: a file or
// folder the learner did not write (a library module, a downloaded source).
// Read only: the tool copies what it changes into `katas/`, never writes here.

const fs = require("fs");
const os = require("os");
const path = require("path");
const { fail, normalizePortable } = require("./util");
const { walkSources, detectTests } = require("./scan");
const { loadGuardConfig, matchesLearnerPath } = require("./guard");

const JS_EXTS = new Set([".js", ".mjs", ".cjs", ".jsx"]);
const TS_EXTS = new Set([".ts", ".tsx", ".mts", ".cts"]);
const MAX_FILES = 20;
const MAX_LINES = 2000;
const MINIFIED_LINE = 500;

function resolveSource(raw, dir, home = os.homedir()) {
  const text = String(raw ?? "").trim();
  const expanded = text === "~" || text.startsWith("~/") ? path.join(home, text.slice(1)) : text;
  const abs = path.resolve(dir, expanded);
  let stat;

  try {
    stat = fs.statSync(abs);
  } catch {
    fail(`--from : ${text || "(vide)"} n'existe pas.`);
  }

  return { abs, isDir: stat.isDirectory() };
}

function supported(file) {
  return (JS_EXTS.has(file.ext) || TS_EXTS.has(file.ext)) && !file.binary && !file.rel.endsWith(".d.ts");
}

// Whole kata size is bounded: a kata stays readable in one sitting.
function readable(file) {
  try {
    const lines = fs.readFileSync(file.abs, "utf8").split("\n");

    return lines.length <= MAX_LINES && lines.every((line) => line.length <= MINIFIED_LINE) ? { ...file, lines: lines.length } : null;
  } catch {
    return null;
  }
}

// At most MAX_FILES files, the longest first, in a stable order.
function selectFiles({ abs, isDir }) {
  const all = isDir ? walkSources(abs).files : [{ rel: path.basename(abs), abs, ext: path.extname(abs).toLowerCase(), binary: false }];
  const tests = new Set(detectTests(all).files.map((file) => file.rel));
  const files = all
    .filter((file) => supported(file) && !tests.has(file.rel))
    .map(readable)
    .filter(Boolean)
    .sort((a, b) => b.lines - a.lines || (a.rel < b.rel ? -1 : 1))
    .slice(0, MAX_FILES);

  if (files.length === 0) {
    fail(`Aucun fichier relisible dans cette source : extensions prises en charge ${[...JS_EXTS, ...TS_EXTS].join(" ")} (hors tests, fichiers minifiés, plus de ${MAX_LINES} lignes, node_modules).`);
  }

  const typed = files.filter((file) => TS_EXTS.has(file.ext)).length;

  return { files, language: typed * 2 > files.length ? "TypeScript" : "JavaScript" };
}

// Code the learner wrote is not "someone else's": no tier 3 for it.
function isLearnerCode(dir, abs) {
  const rel = normalizePortable(path.relative(dir, abs));

  if (rel === "" || rel.split("/")[0] === ".." || path.isAbsolute(rel)) {
    return false;
  }

  const { learnerFiles } = loadGuardConfig(dir);

  return matchesLearnerPath(rel, learnerFiles) || matchesLearnerPath(`${rel}/x`, learnerFiles);
}

// The path as shown in `kata.diff` and `revue.md`: a `:<digits>` in it must not
// read as a `file:line` citation of the review.
function sourceLabel(raw) {
  return String(raw).trim().replace(/:(?=\d)/g, " :");
}

module.exports = { resolveSource, selectFiles, isLearnerCode, sourceLabel, MAX_FILES, MAX_LINES };
