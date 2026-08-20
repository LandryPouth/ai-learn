"use strict";

// `ai-learn check [--root <dir>]` — the scanner. Walks a root (default cwd) for
// learning projects and cross-checks each progress.json against what actually
// exists: a phase marked `done` must carry a passing verify evidence and its
// declared artifacts; a phase with evidence but not marked done is drift. This is
// the command that makes "the AI skipped the rule" visible.

const fs = require("fs");
const path = require("path");
const { log, findLearningProjects } = require("./util");
const { readProgress, validateProgress, runsDir, progressPath } = require("./progress");
const { latestEvidenceForPhase } = require("./status");

function checkProject(dir) {
  const issues = { errors: [], warnings: [] };
  const { config, exists } = readProgress(dir);

  if (!exists) {
    return null;
  }

  if (!config) {
    issues.errors.push({ file: "progress.json", message: "unreadable or invalid JSON" });
    return { dir, config: null, issues };
  }

  for (const issue of validateProgress(config)) {
    (issue.level === "error" ? issues.errors : issues.warnings).push(issue);
  }

  // A doc source the ledger declares should exist. A local path that vanished is
  // worth knowing — the plan's citations point at it.
  if (config.docSource && config.docSource.type === "local") {
    const expanded = config.docSource.value.replace(/^~/, process.env.HOME || "");

    if (!fs.existsSync(expanded)) {
      issues.warnings.push({
        file: "progress.json",
        message: `declared doc source does not exist: ${config.docSource.value}`,
      });
    }
  }

  // Prediction journal: phases that require predictions must have a journal, and
  // ideally enough entries to cover the phases already done.
  const required = (config.phases || []).reduce(
    (sum, phase) => sum + (Number.isFinite(phase.predictionsRequired) ? phase.predictionsRequired : 0),
    0,
  );
  const journalPath = path.join(dir, "docs", "plans", "predictions.md");
  const journalExists = fs.existsSync(journalPath);
  const journalCount = journalExists ? countJournalEntries(journalPath) : 0;

  if (required > 0 && !journalExists) {
    issues.warnings.push({
      file: "docs/plans/predictions.md",
      message: `predictions.md missing; ${required} prediction(s) required across phases`,
    });
  } else if (journalCount < required) {
    issues.warnings.push({
      file: "docs/plans/predictions.md",
      message: `${journalCount}/${required} recorded predictions; ${required - journalCount} missing`,
    });
  }

  for (const phase of config.phases || []) {
    const relative = (artifact) => normalizeRelative(dir, artifact);

    if (phase.status === "done") {
      if (!phase.checkpoint) {
        issues.warnings.push({
          file: "progress.json",
          message: `phase ${phase.id} ("${phase.name}") is done but has no checkpoint — it cannot be proven`,
        });
      } else {
        const ev = latestEvidenceForPhase(dir, phase.id);

        if (!ev) {
          issues.errors.push({
            file: "progress.json",
            message: `phase ${phase.id} ("${phase.name}") is marked done but has no passing evidence. Run \`ai-learn verify ${phase.id}\`.`,
          });
        }
      }

      for (const artifact of phase.artifacts || []) {
        if (!fs.existsSync(path.join(dir, artifact))) {
          issues.errors.push({ file: relative(artifact), message: `phase ${phase.id} requires artifact ${relative(artifact)}` });
        }
      }
    } else {
      const ev = latestEvidenceForPhase(dir, phase.id);

      if (ev) {
        issues.warnings.push({
          file: "progress.json",
          message: `phase ${phase.id} has passing evidence but is not marked done (stale or reverted?)`,
        });
      }
    }
  }

  return { dir, config, issues };
}

// Evidence journal format: one `### Phase <N> — prédiction <k>/<total>` heading per
// recorded prediction. Structural count only — honesty is the learner's.
function countJournalEntries(journalPath) {
  const content = fs.readFileSync(journalPath, "utf8");
  return (content.match(/^###\s+Phase\s+\d+\s+—\s+prédiction/i) || []).length;
}

function normalizeRelative(dir, value) {
  return path.relative(dir, path.resolve(dir, value)).replace(/\\/g, "/");
}

function printProjectReport(entry) {
  const { config, issues } = entry;

  log(`\n${path.basename(entry.dir)}`);

  if (!config) {
    log("  ✗ progress.json invalid");
    return;
  }

  const done = config.phases.filter((phase) => phase.status === "done").length;
  log(`  ${done}/${config.phases.length} phases done`);

  for (const error of issues.errors) {
    log(`  ✗ ${error.file ? `${error.file}: ` : ""}${error.message}`);
  }

  for (const warning of issues.warnings) {
    log(`  ⚠ ${warning.file ? `${warning.file}: ` : ""}${warning.message}`);
  }
}

function checkCommand({ root }) {
  const projects = findLearningProjects(root);

  if (projects.length === 0) {
    log(`No learning projects (no progress.json) under ${root}.`);
    return;
  }

  log(`Checking ${projects.length} learning project(s) under ${root}:`);

  let errors = 0;
  let warnings = 0;

  for (const project of projects) {
    const entry = checkProject(project);

    if (entry) {
      printProjectReport(entry);
      errors += entry.issues.errors.length;
      warnings += entry.issues.warnings.length;
    }
  }

  log(`\n${errors} error(s), ${warnings} warning(s).`);

  if (errors > 0) {
    log("✗ check FAILED");
    process.exitCode = 1;
  } else {
    log("✓ check passed");
  }
}

module.exports = { checkCommand, checkProject, countJournalEntries };
