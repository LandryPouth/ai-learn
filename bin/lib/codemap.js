"use strict";

// Story 12.02 — a code map (`docs/carte-du-code*.md`) is proof only if every
// `file:line` it cites resolves under a declared `Racine :`. The tool proves the
// citations exist, never that they are relevant to the mechanism described.

const fs = require("fs");
const path = require("path");
const { normalizePortable } = require("./util");
const { allFileLines, resolveReadingRoot, checkFileLineUnderRoot } = require("./citation");

const CODEMAP_RE = /^docs\/carte-du-code[^/]*\.md$/;
const ROOT_LINE_RE = /^[ \t]*Racine[ \t]*:[ \t]*(.+?)[ \t]*$/gimu;
const MIN_CITATIONS = 3;
// `registry.npmjs.org:443` looks like `file:line` but is a host and a port.
const HOST_SUFFIX_RE = /\.(?:com|org|net|io|dev|local|localhost|internal|app|test)$/i;

function isHostPort(citation) {
  const file = citation.slice(0, citation.lastIndexOf(":"));
  return !file.includes("/") && HOST_SUFFIX_RE.test(file);
}

// A citation resolves against the first root that holds the file; a map that
// cites itself proves nothing was read.
function resolves(roots, citation, selfPath) {
  for (const root of roots) {
    const result = checkFileLineUnderRoot(root, citation);

    if (result.ok) {
      return path.resolve(root, result.file) !== selfPath;
    }

    if (!/introuvable/.test(result.reason)) {
      return false;
    }
  }

  return false;
}

function isCodeMap(artifact) {
  return CODEMAP_RE.test(normalizePortable(String(artifact)));
}

function declaredRoots(content) {
  return [...content.matchAll(ROOT_LINE_RE)].map((match) => match[1].replace(/^`|`$/g, "").trim());
}

// Never throws: an unreadable map is reported as `unreadable`.
function codeMapState(dir, artifact, home) {
  const file = normalizePortable(artifact);
  let content;

  try {
    content = fs.readFileSync(path.join(dir, artifact), "utf8");
  } catch {
    return { file, reason: "unreadable", roots: [], rootsMissing: [], valid: [], invalid: [] };
  }

  const roots = declaredRoots(content);
  const resolved = roots.map((raw) => ({ raw, abs: resolveReadingRoot(raw, dir, home) }));
  const present = resolved.filter((root) => root.abs).map((root) => root.abs);
  const rootsMissing = resolved.filter((root) => !root.abs).map((root) => root.raw);
  const state = { file, roots, rootsMissing, valid: [], invalid: [] };

  if (roots.length === 0) {
    return { ...state, reason: "no-root" };
  }

  if (present.length === 0) {
    return { ...state, reason: "root-absent" };
  }

  const selfPath = path.resolve(dir, artifact);

  for (const citation of allFileLines(content).filter((candidate) => !isHostPort(candidate))) {
    (resolves(present, citation, selfPath) ? state.valid : state.invalid).push(citation);
  }

  if (state.invalid.length > 0) {
    // A citation may live in a root absent from this machine: not provably wrong.
    return { ...state, reason: rootsMissing.length > 0 ? "unverified" : "invalid-citation" };
  }

  return { ...state, reason: state.valid.length < MIN_CITATIONS ? "too-few" : "valid" };
}

function codeMapIssue(state, phase) {
  const who = `phase ${phase.id} ("${phase.name}") code map ${state.file}`;

  switch (state.reason) {
    case "unreadable":
      return `${who} is unreadable`;
    case "no-root":
      return `${who}: racine non déclarée — add a line "Racine : <chemin de la source lue>"`;
    case "root-absent":
      return `${who}: racine absente de cette machine (${state.rootsMissing.join(", ")}) — citations non vérifiées ici`;
    case "too-few":
      return `${who} cites ${state.valid.length} real citation(s) — au moins ${MIN_CITATIONS} citations réelles sont attendues`;
    case "invalid-citation":
      return `${who} cites ${state.invalid.length} citation(s) that do not resolve under its root: ${state.invalid.join(", ")}`;
    case "unverified":
      return `${who}: citations non vérifiées ici (racine absente : ${state.rootsMissing.join(", ")}) — ${state.invalid.join(", ")}`;
    default:
      return null;
  }
}

// Errors only for a done phase with the root reachable; everything else warns.
function checkCodeMaps(dir, phase, issues, report, home) {
  for (const artifact of (phase.artifacts || []).filter(isCodeMap)) {
    if (!fs.existsSync(path.join(dir, artifact))) {
      continue;
    }

    const state = codeMapState(dir, artifact, home);
    const message = codeMapIssue(state, phase);

    report.push({ phaseId: phase.id, ...state });

    if (message) {
      const fatal = phase.status === "done" && !["root-absent", "unverified"].includes(state.reason);
      (fatal ? issues.errors : issues.warnings).push({ file: state.file, message });
    }
  }
}

module.exports = { isCodeMap, codeMapState, checkCodeMaps, MIN_CITATIONS };
