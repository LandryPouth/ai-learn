"use strict";

// The learning ledger: progress.json is the single source of truth for a learning
// project. It is data, not prose — committed, inspectable, and cross-checked by
// `ai-learn check` against what actually exists on disk.

const fs = require("fs");
const path = require("path");
const { readJson, writeJson } = require("./util");

const PHASE_STATUSES = ["pending", "in_progress", "done"];

function progressPath(dir) {
  return path.join(dir, "progress.json");
}

function runsDir(dir) {
  return path.join(dir, ".ai-learn", "runs");
}

function readProgress(dir) {
  const filePath = progressPath(dir);

  if (!fs.existsSync(filePath)) {
    return { config: null, exists: false };
  }

  return { config: readJson(filePath, null), exists: true };
}

// Structural validation of the ledger. Errors block a check; warnings do not.
function validateProgress(config) {
  const issues = [];

  if (!config || typeof config !== "object") {
    issues.push({ level: "error", message: "progress.json is not a valid object" });
    return issues;
  }

  if (config.version !== 1) {
    issues.push({ level: "error", message: `unsupported progress.json version ${config.version}` });
  }

  if (!Array.isArray(config.phases)) {
    issues.push({ level: "error", message: "progress.json.phases must be an array" });
    return issues;
  }

  const ids = new Set();

  for (const phase of config.phases) {
    if (!phase || typeof phase !== "object") {
      issues.push({ level: "error", message: "a phase entry is not an object" });
      continue;
    }

    if (typeof phase.id !== "number") {
      issues.push({ level: "error", message: "a phase has no numeric id" });
    } else if (ids.has(phase.id)) {
      issues.push({ level: "error", message: `duplicate phase id ${phase.id}` });
    } else {
      ids.add(phase.id);
    }

    if (typeof phase.name !== "string" || !phase.name) {
      issues.push({ level: "error", message: `phase ${phase.id} has no name` });
    }

    if (!PHASE_STATUSES.includes(phase.status)) {
      issues.push({ level: "error", message: `phase ${phase.id} has invalid status "${phase.status}"` });
    }

    if (phase.status === "done" && typeof phase.checkpoint !== "string") {
      issues.push({ level: "warning", message: `phase ${phase.id} is done but has no checkpoint — it cannot be proven` });
    }
  }

  return issues;
}

function findPhase(config, id) {
  return (config && Array.isArray(config.phases) && config.phases.find((p) => p && p.id === id)) || null;
}

function setPhaseStatus(dir, id, status) {
  const { config, exists } = readProgress(dir);

  if (!exists || !config) {
    return false;
  }

  const phase = findPhase(config, id);

  if (!phase) {
    return false;
  }

  phase.status = status;
  writeJson(progressPath(dir), config);
  return true;
}

module.exports = {
  PHASE_STATUSES,
  progressPath,
  runsDir,
  readProgress,
  validateProgress,
  findPhase,
  setPhaseStatus,
};
