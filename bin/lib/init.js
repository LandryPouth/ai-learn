"use strict";

// Scaffolds a learning project: progress.json (the ledger), the plan document, the
// prediction journal, and the checkpoint/ + .ai-learn/runs/ directories.
//
// Non-destructive by default: nothing that already exists is overwritten. Re-running
// `init` on an existing project is a no-op for the files it already has.

const fs = require("fs");
const path = require("path");
const { log, fail, writeJson, mkdirp, normalizePortable } = require("./util");
const { progressPath, TOOL_VERSION } = require("./progress");
const { ensureGuardHook } = require("./guard");
const { ensureOpenCodeGuard, usesOpenCode } = require("./platforms/opencode-guard");
const { ensureCommitMsgHook } = require("./git-hooks");
const { ensureNormConfig, ensureNormHook } = require("./norm");
const { ensureMutateConfig } = require("./mutate");
const { ensureTutorConfig } = require("./tutor");
const { ensurePredictionsFile, predictionsPath } = require("./predictions");
const { detectDomainKey } = require("./tracks/domain");
const { PLATFORMS, INSTALLERS } = require("./install");
const { ensureNativeMemoryFile } = require("./platforms/ensure");
const os = require("os");
const { ensureGitignore } = require("./gitignore");

const TEMPLATES_DIR = path.join(__dirname, "..", "..", "templates");

const PERTINENCE_PATH = "docs/plans/pertinence.md";

function templatePath(name) {
  return path.join(TEMPLATES_DIR, name);
}

function defaultProgress({ project, technology, docSource, phases, pertinence }) {
  return {
    version: 1,
    toolVersion: TOOL_VERSION,
    project,
    technology: technology || "",
    docSource: docSource || null,
    phases: Array.isArray(phases) && phases.length > 0 ? phases : [],
    ...(pertinence ? { pertinence } : {}),
  };
}

// Where `init` writes. A `--project` name asked from a non-empty folder of
// another name (a container such as tech-experiments) gets its own `./<name>/`
// — never the container itself. Refuses a path that escapes the cwd, and any
// directory below an existing project (a nested project confuses every
// "nearest progress.json" lookup).
function chooseInitDir({ cwd, explicitDir, project }) {
  let target = path.resolve(cwd);

  if (project && !explicitDir) {
    if (/[\\/]/.test(project) || project === ".." || project === ".") {
      fail(`--project "${project}" invalide : un nom simple, sans / ni .. (le projet reste dans le dossier courant)`);
    }

    const entries = fs.existsSync(target) ? fs.readdirSync(target) : [];

    if (entries.length > 0 && path.basename(target) !== project) {
      target = path.join(target, project);
    }
  }

  const home = path.resolve(os.homedir());

  for (let parent = path.dirname(target); ; parent = path.dirname(parent)) {
    if (parent !== home && fs.existsSync(progressPath(parent))) {
      fail(`init refusé : ${target} est dans le projet ${parent} (progress.json) — un projet imbriqué est interdit`);
    }

    if (parent === home || parent === path.dirname(parent)) {
      break;
    }
  }

  return target;
}

function scaffold({ dir, project, technology, docSource, phases, platform, pertinenceFile }) {
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

  if (ensureGitignore(abs) === "created") {
    created.push(".gitignore");
  }

  // The relevance analysis (story 10.06) is written by the agent; the engine
  // only guarantees it exists next to the plan and is referenced.
  const progressFile = progressPath(abs);
  const isNewProject = !fs.existsSync(progressFile);
  let pertinence = null;

  if (pertinenceFile) {
    if (!fs.existsSync(pertinenceFile)) {
      fail(`--pertinence : fichier introuvable : ${pertinenceFile}`);
    }

    // An existing project keeps its progress.json untouched, so copying here
    // would leave an unreferenced file: skip it and say so.
    if (isNewProject) {
      pertinence = PERTINENCE_PATH;
      const dest = path.join(abs, PERTINENCE_PATH);

      if (path.resolve(pertinenceFile) !== dest) {
        fs.copyFileSync(pertinenceFile, dest);
      }

      created.push(PERTINENCE_PATH);
    } else {
      log(`  ignoré --pertinence (le projet existe déjà)`);
    }
  }

  if (isNewProject) {
    writeJson(progressFile, defaultProgress({ project, technology, docSource, phases, pertinence }));
    created.push(normalizePortable(path.relative(abs, progressFile)));
  } else {
    log(`  conservé ${normalizePortable(path.relative(abs, progressFile))} (existe déjà)`);
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
    log(`  conservé ${normalizePortable(path.relative(abs, planFile))} (existe déjà)`);
  }

  const journalFile = path.join(abs, "docs", "plans", "predictions.md");

  if (!fs.existsSync(journalFile)) {
    fs.writeFileSync(journalFile, fs.readFileSync(templatePath("predictions.md"), "utf8"));
    created.push(normalizePortable(path.relative(abs, journalFile)));
  } else {
    log(`  conservé ${normalizePortable(path.relative(abs, journalFile))} (existe déjà)`);
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

  // A generalist session only loads the protocol if the platform's native
  // memory file imports AGENTS.md — Claude Code reads CLAUDE.md, Gemini reads
  // GEMINI.md; Codex/OpenCode already read AGENTS.md itself (story 04.01).
  // Append-only and best-effort: an existing, customized file keeps its lines.
  const nativeMemory = ensureNativeMemoryFile(abs, platform);

  if (nativeMemory) {
    if (nativeMemory.action === "created") {
      created.push(normalizePortable(path.relative(abs, path.join(abs, nativeMemory.file))));
    } else if (nativeMemory.action === "appended") {
      log(`  note    ${nativeMemory.file}: import @AGENTS.md ajouté (contenu conservé)`);
    } else if (nativeMemory.action === "failed") {
      log(`  note    ${nativeMemory.file} non inscriptible — import @AGENTS.md non ajouté`);
    }
  }

  // The learner-file block: the AI must never write the learner's solution code.
  // Wired mechanically (PreToolUse hook) so it cannot be skipped like prose can.
  // Chat-first revelation (story 05.04): the guard wiring does not create
  // docs/solutions/ — it appears at the first written reveal.
  const guard = ensureGuardHook(abs);

  for (const file of guard.created) {
    created.push(file);
  }

  // OpenCode's guard plugin (story 08.01). Written only when the project uses
  // OpenCode or the caller explicitly says so — never create .opencode/ for a
  // learner who does not use it.
  if (usesOpenCode(abs) || platform === "opencode") {
    const openCodeGuard = ensureOpenCodeGuard(abs, { force: platform === "opencode" });

    if (openCodeGuard.status === "created") {
      created.push(normalizePortable(path.relative(abs, openCodeGuard.path)));
    } else if (openCodeGuard.status === "upgraded") {
      log(`  note    .opencode/plugins/ai-learn-guard.js régénéré`);
    } else if (openCodeGuard.status === "skipped" && openCodeGuard.path) {
      log(`  note    .opencode/plugins/ai-learn-guard.js personnalisé — laissé intact`);
    }
  }

  // The consultative norm hook (story 07.03): claude-code only, since it is
  // the sole platform with a PostToolUse hook. Any other platform wires
  // nothing and relies on the documented fallback in AGENTS.md §3quater.
  if (platform === "claude") {
    const normHook = ensureNormHook(abs);

    for (const file of normHook.created) {
      if (!created.includes(file)) {
        created.push(file);
      }
    }
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

  // The mutation testing config (.ai-learn/mutate.json) — auto-created once
  // with the detected stack's active operators, same precedent as
  // norm.json above (story 02.02).
  const mutateConfig = ensureMutateConfig(abs, detectedLanguage);

  if (mutateConfig.created) {
    created.push(normalizePortable(path.relative(abs, path.join(abs, ".ai-learn", "mutate.json"))));
  }

  // The tutor profile (story 05.05) — assistance level and required proof,
  // written once with explicit defaults and never rewritten afterwards.
  const tutorConfig = ensureTutorConfig(abs);

  if (tutorConfig.created) {
    created.push(normalizePortable(path.relative(abs, path.join(abs, ".ai-learn", "tutor.json"))));
  }

  // The prediction journal's source of truth (story 01.03) — created empty so
  // a brand-new project starts on predictions.json from its very first
  // prediction; docs/plans/predictions.md stays the template until then.
  const predictionsData = ensurePredictionsFile(abs);

  if (predictionsData.created) {
    created.push(normalizePortable(path.relative(abs, predictionsPath(abs))));
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
      log(`  platform ${platform}: skills installés (${result.created.length} fichier(s))`);
    } catch (error) {
      log(`  note    installation des skills ${platform} a échoué : ${error.message}`);
    }
  } else if (platform) {
    log(`  note    plateforme "${platform}" inconnue — skills non installés (voir \`ai-learn install\`)`);
  }

  return { dir: abs, created, platform: platform || null };
}

module.exports = { scaffold, chooseInitDir };
