"use strict";

// Scaffolds a learning project: progress.json (the ledger), the plan document, the
// prediction journal, and the checkpoint/ + .ai-learn/runs/ directories.
//
// Non-destructive by default: nothing that already exists is overwritten. Re-running
// `init` on an existing project is a no-op for the files it already has.

const fs = require("fs");
const path = require("path");
const { log, writeJson, mkdirp, normalizePortable } = require("./util");
const { progressPath } = require("./progress");
const { ensureGuardHook } = require("./guard");

const TEMPLATES_DIR = path.join(__dirname, "..", "..", "templates");

function templatePath(name) {
  return path.join(TEMPLATES_DIR, name);
}

function defaultProgress({ project, technology, docSource, phases }) {
  return {
    version: 1,
    project,
    technology: technology || "",
    docSource: docSource || null,
    phases: Array.isArray(phases) && phases.length > 0 ? phases : [],
  };
}

function scaffold({ dir, project, technology, docSource, phases }) {
  const abs = path.resolve(dir);
  const created = [];

  mkdirp(path.join(abs, "docs", "plans"));
  mkdirp(path.join(abs, "checkpoint"));
  mkdirp(path.join(abs, ".ai-learn", "runs"));

  const progressFile = progressPath(abs);

  if (!fs.existsSync(progressFile)) {
    writeJson(progressFile, defaultProgress({ project, technology, docSource, phases }));
    created.push(normalizePortable(path.relative(abs, progressFile)));
  } else {
    log(`  kept    ${normalizePortable(path.relative(abs, progressFile))} (already exists)`);
  }

  const planFile = path.join(abs, "docs", "plans", "plan-apprentissage.md");

  if (!fs.existsSync(planFile)) {
    const plan = fs
      .readFileSync(templatePath("plan-apprentissage.md"), "utf8")
      .replace(/\{\{project\}\}/g, project)
      .replace(/\{\{technology\}\}/g, technology || "votre techno");
    fs.writeFileSync(planFile, plan);
    created.push(normalizePortable(path.relative(abs, planFile)));
  } else {
    log(`  kept    ${normalizePortable(path.relative(abs, planFile))} (already exists)`);
  }

  const journalFile = path.join(abs, "docs", "plans", "predictions.md");

  if (!fs.existsSync(journalFile)) {
    fs.writeFileSync(journalFile, fs.readFileSync(templatePath("predictions.md"), "utf8"));
    created.push(normalizePortable(path.relative(abs, journalFile)));
  } else {
    log(`  kept    ${normalizePortable(path.relative(abs, journalFile))} (already exists)`);
  }

  // The learning protocol travels with the tool: it is written into the project
  // so the rules are next to the code, not in some other repo's AGENTS.md.
  const rulesContent = fs
    .readFileSync(templatePath("AGENTS-apprentissage.md"), "utf8")
    .replace(/\{\{technology\}\}/g, technology || "votre techno");

  const rootAgents = path.join(abs, "AGENTS.md");

  if (!fs.existsSync(rootAgents)) {
    fs.writeFileSync(rootAgents, rulesContent);
    created.push(normalizePortable(path.relative(abs, rootAgents)));
  } else {
    const rulesFile = path.join(abs, "docs", "plans", "mode-apprentissage.md");
    fs.writeFileSync(rulesFile, rulesContent);
    created.push(normalizePortable(path.relative(abs, rulesFile)));
    log("  note    AGENTS.md existe déjà — protocole écrit dans docs/plans/mode-apprentissage.md");
  }

  // The learner-file block: the AI must never write the learner's solution code.
  // Wired mechanically (PreToolUse hook) so it cannot be skipped like prose can.
  const guard = ensureGuardHook(abs);

  for (const file of guard.created) {
    created.push(file);
  }

  return { dir: abs, created };
}

module.exports = { scaffold };
