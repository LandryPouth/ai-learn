"use strict";

// The tutor profile (story 05.05): `.ai-learn/tutor.json` declares how much
// assistance the AI gives (`assistance`) and what proof unlocks a phase
// (`proof`). The assistance level is a protocol promise the tool cannot
// enforce — only the proof is mechanical. Absent file = current behaviour
// (`indices` + `explication`), so existing projects are untouched.

const fs = require("fs");
const path = require("path");
const { writeJson } = require("./util");

const VERSION = 1;
const ASSISTANCE_LEVELS = ["libre", "indices", "strict"];
const PROOF_LEVELS = ["tests", "explication", "transfert"];
const DEFAULT_ASSISTANCE = "indices";
const DEFAULT_PROOF = "explication";

function tutorConfigPath(dir) {
  return path.join(dir, ".ai-learn", "tutor.json");
}

function defaultTutorConfig() {
  return { version: VERSION, assistance: DEFAULT_ASSISTANCE, proof: DEFAULT_PROOF };
}

function validateTutorConfig(data) {
  const issues = [];

  if (!data || typeof data !== "object" || Array.isArray(data)) {
    issues.push("tutor.json must be a JSON object");
    return issues;
  }

  if (data.version !== VERSION) {
    issues.push(`unknown version ${JSON.stringify(data.version)} (expected ${VERSION})`);
  }

  if (!ASSISTANCE_LEVELS.includes(data.assistance)) {
    issues.push(`unknown assistance ${JSON.stringify(data.assistance)} (expected one of ${ASSISTANCE_LEVELS.join(", ")})`);
  }

  if (!PROOF_LEVELS.includes(data.proof)) {
    issues.push(`unknown proof ${JSON.stringify(data.proof)} (expected one of ${PROOF_LEVELS.join(", ")})`);
  }

  return issues;
}

// Three states like predictions: missing (defaults, no issue), invalid (issues
// for `check`), valid (the active profile). A missing file never blocks.
function readTutorConfig(dir) {
  const filePath = tutorConfigPath(dir);

  if (!fs.existsSync(filePath)) {
    return { exists: false, valid: false, config: defaultTutorConfig(), issues: [] };
  }

  let data;

  try {
    data = JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    return {
      exists: true,
      valid: false,
      config: defaultTutorConfig(),
      issues: [`tutor.json is not valid JSON: ${error.message}`],
    };
  }

  const issues = validateTutorConfig(data);

  if (issues.length > 0) {
    return { exists: true, valid: false, config: defaultTutorConfig(), issues };
  }

  return { exists: true, valid: true, config: data, issues: [] };
}

// Auto-created once by init, same pattern as guard.json/norm.json/mutate.json:
// the defaults are written explicitly so the learner can discover and edit
// them, and an existing file is never rewritten.
function ensureTutorConfig(dir) {
  const filePath = tutorConfigPath(dir);

  if (fs.existsSync(filePath)) {
    return { created: false };
  }

  writeJson(filePath, defaultTutorConfig());
  return { created: true };
}

// The proof ladder: `tests` is the mechanical checkpoint, `explication` is the
// protocol promise, `transfert` additionally needs a real `transfert`
// prediction for the phase. `mastery` is null when the configured level was
// not reached — the exact "tests verts, transfert raté" gap the evidence
// must keep visible (two distinct proofs, never merged).
function masteryLevel(proof, { checkpointOk, transfertCount }) {
  if (!checkpointOk) {
    return null;
  }

  if (proof === "transfert") {
    return transfertCount > 0 ? "transfert" : null;
  }

  if (proof === "explication") {
    return "explication";
  }

  return "tests";
}

module.exports = {
  VERSION,
  ASSISTANCE_LEVELS,
  PROOF_LEVELS,
  DEFAULT_ASSISTANCE,
  DEFAULT_PROOF,
  tutorConfigPath,
  defaultTutorConfig,
  validateTutorConfig,
  readTutorConfig,
  ensureTutorConfig,
  masteryLevel,
};
