"use strict";

// `ai-learn install <platform>` — replaces the single-purpose
// scripts/install-claude.sh with a generic entry point that stays inside the
// zero-dependency CLI. Each platform gets the same 7 commands (commands/*.md,
// the canonical source) re-rendered into its native format; Claude Code keeps
// symlinking the source files directly since its format IS the source format.

const fs = require("fs");
const os = require("os");
const path = require("path");
const { log, fail, mkdirp } = require("./util");
const { parseCommandFile, listCommandFiles } = require("./platforms/commands");

const COMMANDS_DIR = path.join(__dirname, "..", "..", "commands");
const BIN_SOURCE = path.join(__dirname, "..", "ai-learn.js");

const PLATFORMS = {
  claude: {
    label: "Claude Code",
    guard: "mécanique (hook PreToolUse) — actif",
  },
  codex: {
    label: "Codex CLI",
    guard: "dégradé — pas de hook pré-écriture disponible côté Codex ; " +
      "seuls AGENTS.md et les trous non-collables de docs/solutions/ protègent src/**",
  },
};

function installClaude({ home }) {
  const localBin = path.join(home, ".local", "bin");
  const claudeCommands = path.join(home, ".claude", "commands");
  mkdirp(localBin);
  mkdirp(claudeCommands);

  const created = [];
  const binLink = path.join(localBin, "ai-learn");

  if (!fs.existsSync(binLink)) {
    fs.symlinkSync(BIN_SOURCE, binLink);
    created.push(binLink);
  }

  for (const file of listCommandFiles(COMMANDS_DIR)) {
    const dest = path.join(claudeCommands, path.basename(file));

    if (!fs.existsSync(dest)) {
      fs.symlinkSync(file, dest);
      created.push(dest);
    }
  }

  return { created };
}

function installCodex({ home }) {
  const { renderCommand } = require("./platforms/codex");
  const promptsDir = path.join(home, ".codex", "prompts");
  mkdirp(promptsDir);

  const created = [];

  for (const file of listCommandFiles(COMMANDS_DIR)) {
    const parsed = parseCommandFile(file);
    const { filename, content } = renderCommand(parsed);
    fs.writeFileSync(path.join(promptsDir, filename), content);
    created.push(path.join(promptsDir, filename));
  }

  return { created };
}

const INSTALLERS = { claude: installClaude, codex: installCodex };

function installCommand({ platform, home = os.homedir() }) {
  if (!platform) {
    log("Plateformes disponibles :\n");

    for (const [key, info] of Object.entries(PLATFORMS)) {
      log(`  ${key.padEnd(8)} ${info.label}`);
      log(`           garde-fou : ${info.guard}`);
    }

    log("\nUsage : ai-learn install <plateforme>");
    return;
  }

  if (!INSTALLERS[platform]) {
    fail(`unknown platform "${platform}". Available: ${Object.keys(PLATFORMS).join(", ")}`);
  }

  const result = INSTALLERS[platform]({ home });

  log(`Installed ai-learn for ${PLATFORMS[platform].label}:`);

  if (result.created.length === 0) {
    log("  · already installed — nothing new");
  } else {
    for (const file of result.created) {
      log(`  ✓ ${file}`);
    }
  }

  log(`\nGarde-fou (blocage src/**) : ${PLATFORMS[platform].guard}`);
}

module.exports = { installCommand, PLATFORMS };
