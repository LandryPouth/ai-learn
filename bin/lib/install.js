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
    guard: "mécanique (bac à sable OS, .codex/config.toml câblé par `init`/`update`) — " +
      "vérifié via `codex sandbox`, pas encore en session interactive réelle",
  },
  gemini: {
    label: "Gemini CLI",
    guard: "non câblé — Gemini a un hook BeforeTool, mais le nom exact des champs " +
      "tool_input pour un chemin de fichier n'est pas confirmé ; seuls AGENTS.md et " +
      "les trous non-collables de docs/solutions/ protègent src/**",
  },
  opencode: {
    label: "OpenCode",
    guard: "non câblé — nécessiterait un plugin TS event-driven, pas encore écrit ; " +
      "seuls AGENTS.md et les trous non-collables de docs/solutions/ protègent src/**",
  },
  antigravity: {
    label: "Antigravity",
    guard: "non câblé — un système de hooks (hooks.json) existe côté doc publique mais " +
      "n'a pas pu être confirmé sur une install réelle ; seuls AGENTS.md et les trous " +
      "non-collables de docs/solutions/ protègent src/**",
  },
};

// Windows blocks unprivileged symlink creation unless Developer Mode is on
// (confirmed empirically: EPERM on a stock Windows 11 without it). Falling
// back to a real copy keeps `install claude` working there — at the cost of
// no longer being live-updated by a `git pull` on the source repo, same
// trade-off as every other platform's generated files.
function linkOrCopy(src, dest) {
  try {
    fs.symlinkSync(src, dest);
  } catch (error) {
    if (error && (error.code === "EPERM" || error.code === "EACCES" || error.code === "ENOSYS")) {
      fs.copyFileSync(src, dest);
      return;
    }
    throw error;
  }
}

function installClaude({ home }) {
  const localBin = path.join(home, ".local", "bin");
  const claudeCommands = path.join(home, ".claude", "commands");
  mkdirp(localBin);
  mkdirp(claudeCommands);

  const created = [];
  const binLink = path.join(localBin, "ai-learn");

  if (!fs.existsSync(binLink)) {
    linkOrCopy(BIN_SOURCE, binLink);
    created.push(binLink);
  }

  for (const file of listCommandFiles(COMMANDS_DIR)) {
    const dest = path.join(claudeCommands, path.basename(file));

    if (!fs.existsSync(dest)) {
      linkOrCopy(file, dest);
      created.push(dest);
    }
  }

  return { created };
}

// Shared shape for the "parse commands/*.md, render per-platform, write to a
// fixed directory" installers (codex, gemini, opencode, antigravity) — only
// the target directory and the adapter module differ. `filename` may itself
// contain a subdirectory (antigravity's flat skills/<name>/SKILL.md layout),
// so the destination's parent is always mkdirp'd, not just targetDir.
function installRendered({ targetDir, adapterModule }) {
  const { renderCommand } = require(adapterModule);
  mkdirp(targetDir);

  const created = [];

  for (const file of listCommandFiles(COMMANDS_DIR)) {
    const parsed = parseCommandFile(file);
    const { filename, content } = renderCommand(parsed);
    const dest = path.join(targetDir, filename);
    mkdirp(path.dirname(dest));
    fs.writeFileSync(dest, content);
    created.push(dest);
  }

  return { created };
}

function installCodex({ home }) {
  return installRendered({ targetDir: path.join(home, ".codex", "prompts"), adapterModule: "./platforms/codex" });
}

function installGemini({ home }) {
  // Namespaced under ai-learn/ so commands show up as /ai-learn:<name> and
  // never collide with the user's own top-level commands.
  return installRendered({
    targetDir: path.join(home, ".gemini", "commands", "ai-learn"),
    adapterModule: "./platforms/gemini",
  });
}

function installOpencode({ home }) {
  return installRendered({
    targetDir: path.join(home, ".config", "opencode", "command", "ai-learn"),
    adapterModule: "./platforms/opencode",
  });
}

function installAntigravity({ home }) {
  // Confirmed on-disk (not documented): Antigravity reads flat skill
  // directories from ~/.gemini/antigravity/skills/, sharing Gemini CLI's
  // skill mechanism — see platforms/antigravity.js for the evidence.
  return installRendered({
    targetDir: path.join(home, ".gemini", "antigravity", "skills"),
    adapterModule: "./platforms/antigravity",
  });
}

const INSTALLERS = {
  claude: installClaude,
  codex: installCodex,
  gemini: installGemini,
  opencode: installOpencode,
  antigravity: installAntigravity,
};

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

module.exports = { installCommand, PLATFORMS, INSTALLERS, linkOrCopy };
