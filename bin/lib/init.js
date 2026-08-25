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
const { ensureCommitMsgHook } = require("./git-hooks");
const { ensureNormConfig } = require("./norm");
const { detectDomainKey } = require("./tracks/domain");
const { PLATFORMS, INSTALLERS } = require("./install");
const os = require("os");

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

function scaffold({ dir, project, technology, docSource, phases, platform }) {
  const abs = path.resolve(dir);
  const created = [];

  mkdirp(path.join(abs, "docs", "plans"));
  mkdirp(path.join(abs, "checkpoint"));
  mkdirp(path.join(abs, ".ai-learn", "runs"));

  // Scaffolded empty otherwise, with no hint of the expected test strategy —
  // the first `ai-learn verify` would fail on a missing file with nothing
  // pointing toward what to write. This stub orients without prescribing.
  const checkpointReadme = path.join(abs, "checkpoint", "README.md");

  if (!fs.existsSync(checkpointReadme)) {
    fs.writeFileSync(checkpointReadme, fs.readFileSync(templatePath("checkpoint-readme.md"), "utf8"));
    created.push(normalizePortable(path.relative(abs, checkpointReadme)));
  }

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

  // The commit-msg hook (mechanical, Conventional Commits) — silent no-op if
  // `git init` hasn't happened yet, picked up automatically on `ai-learn update`.
  const commitHook = ensureCommitMsgHook(abs);

  if (commitHook.file === "created") {
    created.push(normalizePortable(path.relative(abs, path.join(abs, ".githooks", "commit-msg"))));
  }

  // The clean-code norm config (.ai-learn/norm.json) — auto-created once with
  // the detected stack's concrete thresholds, same precedent as guard.json
  // above. Keyed off the real detected language (same source detectDomainKey
  // uses for the domain ledger), not the free-text --technology flag, which a
  // learner can phrase however they like ("Node CLI", "API web"…).
  let detectedLanguage = null;
  try {
    detectedLanguage = detectDomainKey(abs).stack.language;
  } catch {
    // best-effort — an unreadable/empty tree just falls back to generic defaults
  }

  const normConfig = ensureNormConfig(abs, detectedLanguage);

  if (normConfig.created) {
    created.push(normalizePortable(path.relative(abs, path.join(abs, ".ai-learn", "norm.json"))));
  }

  // The friction journal: the AI logs unexpected tool behavior here as it
  // happens, so it can be sent to the maintainer on request (see
  // docs/DOGFOODING.md). Never overwritten — an existing file may already
  // carry entries.
  const dogfoodFile = path.join(abs, ".ai-learn", "dogfood.md");

  if (!fs.existsSync(dogfoodFile)) {
    fs.mkdirSync(path.dirname(dogfoodFile), { recursive: true });
    fs.writeFileSync(dogfoodFile, fs.readFileSync(templatePath("dogfood.md"), "utf8"));
    created.push(normalizePortable(path.relative(abs, dogfoodFile)));
  }

  // Slash commands: `platform` is resolved by the caller (the CLI entry
  // point), never guessed in here — scaffold() stays a pure function of its
  // explicit inputs, so calling it in tests never has the side effect of
  // touching a real ~/.claude, ~/.codex, etc. based on ambient env vars. The
  // agent invoking init knows which platform it runs on (its own identity)
  // and should pass --platform explicitly — see commands/learn.md.
  if (platform && PLATFORMS[platform]) {
    try {
      const result = INSTALLERS[platform]({ home: os.homedir() });
      log(`  platform ${platform}: commandes /… installées (${result.created.length} fichier(s))`);
    } catch (error) {
      log(`  note    installation des commandes ${platform} a échoué : ${error.message}`);
    }
  } else if (platform) {
    log(`  note    plateforme "${platform}" inconnue — commandes /… non installées (voir \`ai-learn install\`)`);
  }

  return { dir: abs, created, platform: platform || null };
}

module.exports = { scaffold };
