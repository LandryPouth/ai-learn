"use strict";

// The checkpoint is the phase's contract (story 09.02). Two heuristics `check`
// raises about it — warnings only, never a verdict: an evolution of the
// contract is legitimate, the tool makes it visible and lets the learner own it.
//
// - green obtained by editing the test: a red proof followed by a green one
//   whose learner files are identical while the checkpoint changed;
// - a checkpoint file that never mentions the learner's code.
//
// Evidence written before the split hashes existed carries neither field and
// raises nothing.

const fs = require("fs");
const { allEvidenceForPhase } = require("./progress");
const { loadGuardConfig } = require("./guard");

// `src/**` → `src/`; a pattern with no literal root (`**/*.js`) yields nothing.
function patternRoot(pattern) {
  const literal = String(pattern).split(/[*?[{]/)[0];

  return literal.replace(/^\.\//, "");
}

// A contract change the learner acknowledged after the green proof (progress.json
// → phase.contractChanges[] = { at, why }) silences the warning.
function acknowledgedAfter(phase, provenAt) {
  const changes = Array.isArray(phase.contractChanges) ? phase.contractChanges : [];

  return changes.some((c) => c && typeof c.at === "string" && Date.parse(c.at) >= Date.parse(provenAt));
}

function greenByTestWarning(dir, phase) {
  const runs = allEvidenceForPhase(dir, phase.id).filter((ev) => !ev.revisit);
  const last = runs.map((ev) => ev.ok).lastIndexOf(true);

  if (last < 0) {
    return null;
  }

  // Walk back over the consecutive greens (a plain re-run must not erase the
  // finding) to the first green after a red.
  let first = last;

  while (first > 0 && runs[first - 1].ok === true) {
    first -= 1;
  }

  if (first === 0) {
    return null;
  }

  const red = runs[first - 1];
  const green = runs[first];
  const latest = runs[last];

  if (![red, green, latest].every((ev) => ev.learnerHash && ev.checkpointHash)) {
    return null;
  }

  const sameCode = green.learnerHash.digest === red.learnerHash.digest && latest.learnerHash.digest === red.learnerHash.digest;
  const testChanged = green.checkpointHash.digest !== red.checkpointHash.digest;

  if (!sameCode || !testChanged || acknowledgedAfter(phase, green.generatedAt)) {
    return null;
  }

  return `phase ${phase.id} : passée au vert en modifiant le test, pas le code (${String(green.generatedAt).slice(0, 10)})`;
}

function untouchedCodeWarning(dir, phase, checkpointFile) {
  if (!checkpointFile) {
    return null;
  }

  const roots = loadGuardConfig(dir).learnerFiles.map(patternRoot).filter(Boolean);

  if (roots.length === 0) {
    return null;
  }

  const text = fs.readFileSync(checkpointFile, "utf8").replace(/\\/g, "/");

  if (roots.some((root) => text.includes(root))) {
    return null;
  }

  return `phase ${phase.id} : le checkpoint ${phase.checkpoint} ne mentionne aucun fichier de l'apprenant (${roots.join(", ")}) — il ne teste peut-être pas votre code`;
}

function contractWarnings({ dir, phase, checkpointFile }) {
  if (!phase || phase.status !== "done") {
    return [];
  }

  return [greenByTestWarning(dir, phase), untouchedCodeWarning(dir, phase, checkpointFile)].filter(Boolean);
}

module.exports = { contractWarnings };
