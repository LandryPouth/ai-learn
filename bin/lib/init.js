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

  return { dir: abs, created };
}

module.exports = { scaffold };
