"use strict";

// `ai-learn install <platform>` — installs the 3 visible commands
// (commands/learn*.md) as Agent Skills: `<dir>/<name>/SKILL.md` for every
// platform that reads them (Claude Code, OpenCode, Gemini CLI, Codex CLI,
// Antigravity). The scan/propose/check/docs flows ship as plain files in the
// `learn` skill's own `references/` folder (story 10.01), not as skills.
//
// Skills retired by 10.01 (`learn-scan`, `/check`, …) are removed only when
// their SHA-256 matches a rendering ai-learn published (retired.js); a skill
// the learner edited is kept and named, and an unrelated skill is untouched.
//
// Migration is non-destructive and content-based: the old command files this
// tool wrote (Claude commands, Codex prompts, Gemini TOML, OpenCode commands)
// are removed only when their bytes still match what ai-learn generated. A file
// the learner edited is kept and named in the result — never silently deleted.
// `--dry-run` computes the same actions without touching the filesystem.

const fs = require("fs");
const os = require("os");
const path = require("path");
const { log, fail, mkdirp } = require("./util");
const crypto = require("crypto");
const { listCommands, listReferences, listLegacyCommands } = require("./platforms/commands");
const { RETIRED_SKILLS } = require("./platforms/retired");

const COMMANDS_DIR = path.join(__dirname, "..", "..", "commands");
const BIN_SOURCE = path.join(__dirname, "..", "ai-learn.js");

const SKILL_DIRS = {
  claude: (home) => path.join(home, ".claude", "skills"),
  codex: (home) => path.join(home, ".codex", "skills"),
  gemini: (home) => path.join(home, ".gemini", "skills"),
  opencode: (home) => path.join(home, ".config", "opencode", "skills"),
  antigravity: (home) => path.join(home, ".gemini", "antigravity", "skills"),
};

const LEGACY_COMMAND_DIRS = {
  claude: (home) => path.join(home, ".claude", "commands"),
  codex: (home) => path.join(home, ".codex", "prompts"),
  gemini: (home) => path.join(home, ".gemini", "commands", "ai-learn"),
  opencode: (home) => path.join(home, ".config", "opencode", "command", "ai-learn"),
};

const ADAPTERS = {
  claude: "./platforms/claude",
  codex: "./platforms/codex",
  gemini: "./platforms/gemini",
  opencode: "./platforms/opencode",
  antigravity: "./platforms/antigravity",
};

const PLATFORMS = {
  claude: {
    label: "Claude Code",
    guard: "mécanique (hook PreToolUse) — actif",
  },
  codex: {
    label: "Codex CLI",
    guard: "mécanique (bac à sable OS, .codex/config.toml câblé par `init`/`update`) — " +
      "chemins littéraux vérifiés via `codex sandbox` ; les répertoires de test " +
      "existants sont inclus, pas les nouveaux ni les tests colocalisés",
  },
  gemini: {
    label: "Gemini CLI",
    guard: "non câblé — Gemini a un hook BeforeTool, mais le nom exact des champs " +
      "tool_input pour un chemin de fichier n'est pas confirmé ; seuls AGENTS.md et " +
      "les trous non-collables de docs/solutions/ (quand ce dossier est utilisé) protègent les fichiers apprenant (src/** en apprenti, la spécification en dirigeant)",
  },
  opencode: {
    label: "OpenCode",
    guard: "mécanique (plugin .opencode/plugins/ai-learn-guard.js, tool.execute.before) — actif",
  },
  antigravity: {
    label: "Antigravity",
    guard: "non câblé — un système de hooks (hooks.json) existe côté doc publique mais " +
      "n'a pas pu être confirmé sur une install réelle ; seuls AGENTS.md et les trous " +
      "non-collables de docs/solutions/ (quand ce dossier est utilisé) protègent les fichiers apprenant (src/** en apprenti, la spécification en dirigeant)",
  },
};

// Windows blocks unprivileged symlink creation unless Developer Mode is on
// (confirmed empirically: EPERM on a stock Windows 11 without it). Falling
// back to a real copy keeps the Claude binary link working there — at the cost
// of no longer being live-updated by a `git pull` on the source repo.
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

function exists(target) {
  try {
    fs.lstatSync(target);
    return true;
  } catch (error) {
    if (error.code === "ENOENT" || error.code === "ENOTDIR") {
      return false;
    }
    throw error;
  }
}

function readText(target) {
  try {
    return fs.readFileSync(target, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

// Never write through a symlink or over a directory the learner put at a skill
// path: that would edit a file outside the install target. "foreign" means
// "leave it alone and report it", not an error.
function readSkillTarget(target, skillsDir) {
  try {
    // lstat does not follow the final component, but it does follow parent
    // symlinks: a learner symlink at `skills/<name>` (or at its `references/`)
    // would make us write outside the install target. Refuse every directory
    // between the skills directory and the file.
    for (let dir = path.dirname(target); dir !== skillsDir && dir !== path.dirname(dir); dir = path.dirname(dir)) {
      if (fs.lstatSync(dir).isSymbolicLink()) {
        return { state: "foreign" };
      }
    }

    const stat = fs.lstatSync(target);

    if (!stat.isFile()) {
      return { state: "foreign" };
    }

    return { state: "file", content: fs.readFileSync(target, "utf8") };
  } catch (error) {
    if (error.code === "ENOENT" || error.code === "ENOTDIR") {
      return { state: "absent" };
    }
    throw error;
  }
}

// A skill we wrote starts with either the canonical command heading
// (`# ai-learn: …`) or the alias deprecation note. Anything else at a skill
// path is the learner's own skill: keep it, never overwrite it. This mirrors
// the old installer's alias protection (generic names like `next`/`check`).
function looksLikeOurSkill(content) {
  const match = String(content).match(/^---\r?\n[\s\S]*?\r?\n---\r?\n([\s\S]*)$/);

  if (!match) {
    return false;
  }

  // A CRLF checkout (Windows autocrlf) leaves a blank `\r\n` line before the heading.
  const body = match[1].replace(/^\s+/, "");
  return body.startsWith("# ai-learn:") || body.startsWith("> ⚠ Nom déprécié");
}

// A pre-08.03 Claude command was a symlink into commands/*.md. Recognising the
// link (even a broken pre-04.05 one) is what lets migration remove it instead
// of treating it as a learner file.
function isOurSymlink(target, commandsDir) {
  try {
    if (!fs.lstatSync(target).isSymbolicLink()) {
      return false;
    }

    const link = fs.readlinkSync(target);
    const resolved = path.resolve(path.dirname(target), link);
    // The checkout may have moved or been reinstalled elsewhere since the link
    // was made: a link into any `ai-learn/commands/*.md` is still ours.
    return (
      resolved.startsWith(`${commandsDir}${path.sep}`) ||
      /[\\/]ai-learn[\\/]commands[\\/][^\\/]+\.md$/.test(resolved)
    );
  } catch {
    return false;
  }
}

function removeEmptyDir(dir, dryRun) {
  if (dryRun) {
    return;
  }

  try {
    // A symlinked legacy directory belongs to the learner (dotfiles setups):
    // never rmdir through it.
    if (fs.lstatSync(dir).isSymbolicLink()) {
      return;
    }

    fs.rmdirSync(dir);
  } catch (error) {
    // Cleanup only: a non-empty directory, a symlink, or a Windows permission
    // refusal must never turn a successful install into a crash.
    if (
      error.code !== "ENOENT" &&
      error.code !== "ENOTDIR" &&
      error.code !== "ENOTEMPTY" &&
      error.code !== "EEXIST" &&
      error.code !== "EPERM" &&
      error.code !== "EACCES"
    ) {
      throw error;
    }
  }
}

// A reference file we wrote starts with the flow's own heading. Anything else
// at that path is the learner's: keep it, never overwrite it.
function looksLikeOurReference(content) {
  return String(content).replace(/^\s+/, "").startsWith("# ai-learn:");
}

// What an install writes for one platform: each visible skill's SKILL.md, plus
// the `learn` skill's references/*.md (body only — they are not skills, so no
// frontmatter). The directory comes from the adapter, so a platform prefix
// (`ai-learn-`) applies to references the same way it does to the skill.
function skillFiles(platform) {
  const { renderCommand } = require(ADAPTERS[platform]);
  const files = [];

  for (const command of listCommands(COMMANDS_DIR)) {
    const skill = renderCommand(command);
    files.push({ ...skill, reference: false });

    if (command.name === "learn") {
      for (const reference of listReferences(COMMANDS_DIR)) {
        files.push({
          filename: `${path.dirname(skill.filename)}/references/${reference.name}.md`,
          content: reference.body,
          reference: true,
        });
      }
    }
  }

  return files;
}

function sha256(content) {
  return crypto.createHash("sha256").update(String(content).replace(/\r\n/g, "\n")).digest("hex");
}

// Removes the skills story 10.01 retired, by published fingerprint. Three
// outcomes, none silent: byte-identical to something we published → removed;
// ours but edited → kept and named; not ours at all (a learner's own skill at
// a generic name like `check`) → left alone.
function retireSkills({ home, platform, dryRun, result }) {
  const targetDir = SKILL_DIRS[platform](home);

  for (const [name, fingerprints] of Object.entries(RETIRED_SKILLS[platform] || {})) {
    const dest = path.join(targetDir, name, "SKILL.md");
    const existing = readSkillTarget(dest, targetDir);

    if (existing.state === "absent") {
      continue;
    }
    if (existing.state === "foreign") {
      result.kept.push(dest);
      continue;
    }
    if (!looksLikeOurSkill(existing.content)) {
      continue;
    }
    if (!fingerprints.includes(sha256(existing.content))) {
      result.keptModified.push(dest);
      continue;
    }

    if (!dryRun) {
      try {
        fs.unlinkSync(dest);
      } catch (error) {
        // A locked or read-only file (Windows) is the learner's to resolve:
        // keep it and name it rather than abort the whole install.
        if (error.code !== "EPERM" && error.code !== "EACCES" && error.code !== "EBUSY") {
          throw error;
        }
        result.keptModified.push(dest);
        continue;
      }
      removeEmptyDir(path.dirname(dest), dryRun);
    }
    result.retired.push(dest);
  }
}

function writeSkill({ home, platform, dryRun, result }) {
  const targetDir = SKILL_DIRS[platform](home);

  if (!dryRun) {
    mkdirp(targetDir);
  }

  for (const { filename, content, reference } of skillFiles(platform)) {
    const dest = path.join(targetDir, filename);
    const existing = readSkillTarget(dest, targetDir);

    if (existing.state === "foreign") {
      result.kept.push(dest);
      continue;
    }
    if (existing.content === content) {
      continue;
    }
    const ours = reference ? looksLikeOurReference : looksLikeOurSkill;
    if (existing.content !== undefined && !ours(existing.content)) {
      // A learner's own file at one of our paths: keep it.
      result.kept.push(dest);
      continue;
    }

    if (!dryRun) {
      mkdirp(path.dirname(dest));
      if (existing.content !== undefined) {
        // Rewriting a skill that differs: it may carry learner edits under our
        // header, so keep the previous bytes next to it.
        fs.writeFileSync(`${dest}.bak`, existing.content);
      }
      fs.writeFileSync(dest, content);
    }

    if (existing.content !== undefined) {
      result.backups.push(`${dest}.bak`);
    }
    result.created.push(dest);
  }
}

// The expected bytes of an old generated command. Claude canonical commands
// were symlinks/copies of the source file, so they use the source bytes; every
// other platform's files (including Claude aliases) came from its legacy
// renderer.
function legacyExpected(command, adapter, platform) {
  if (platform === "claude" && !command.aliasOf) {
    return fs.readFileSync(command.filePath, "utf8");
  }

  return adapter.renderLegacyCommand(command).content;
}

function migrateLegacyCommands({ home, platform, dryRun, result }) {
  const legacyDir = LEGACY_COMMAND_DIRS[platform] ? LEGACY_COMMAND_DIRS[platform](home) : null;

  if (!legacyDir) {
    return;
  }

  const adapter = require(ADAPTERS[platform]);

  for (const command of listLegacyCommands(COMMANDS_DIR)) {
    const { filename } = adapter.renderLegacyCommand(command);
    const dest = path.join(legacyDir, filename);

    if (!exists(dest)) {
      continue;
    }

    const stat = fs.lstatSync(dest);

    // A symlink into commands/*.md is ours even if its target was renamed away
    // (the pre-04.05 `next.md` → commands/next.md case). Any other symlink is
    // the learner's: never unlink it.
    if (stat.isSymbolicLink()) {
      if (platform === "claude" && isOurSymlink(dest, COMMANDS_DIR)) {
        if (!dryRun) {
          fs.unlinkSync(dest);
        }
        result.removed.push(dest);
      } else {
        result.kept.push(dest);
      }
      continue;
    }

    if (!stat.isFile()) {
      result.kept.push(dest);
      continue;
    }

    const current = readText(dest);
    if (current === null) {
      continue;
    }

    if (current === legacyExpected(command, adapter, platform)) {
      if (!dryRun) {
        fs.unlinkSync(dest);
      }
      result.removed.push(dest);
    } else {
      // Edited by the learner: keep it and name it in the result.
      result.kept.push(dest);
    }
  }

  removeEmptyDir(legacyDir, dryRun);
}

function newResult() {
  return { created: [], removed: [], kept: [], backups: [], retired: [], keptModified: [] };
}

function installClaude({ home, dryRun = false }) {
  const result = newResult();
  const localBin = path.join(home, ".local", "bin");
  const binLink = path.join(localBin, "ai-learn");

  if (!exists(binLink)) {
    if (!dryRun) {
      mkdirp(localBin);
      linkOrCopy(BIN_SOURCE, binLink);
    }
    result.created.push(binLink);
  }

  writeSkill({ home, platform: "claude", dryRun, result });
  retireSkills({ home, platform: "claude", dryRun, result });
  migrateLegacyCommands({ home, platform: "claude", dryRun, result });
  return result;
}

function installPlatform({ home, platform, dryRun = false }) {
  const result = newResult();

  writeSkill({ home, platform, dryRun, result });
  retireSkills({ home, platform, dryRun, result });
  migrateLegacyCommands({ home, platform, dryRun, result });
  return result;
}

function installCodex({ home, dryRun = false }) {
  return installPlatform({ home, platform: "codex", dryRun });
}

function installGemini({ home, dryRun = false }) {
  return installPlatform({ home, platform: "gemini", dryRun });
}

function installOpencode({ home, dryRun = false }) {
  return installPlatform({ home, platform: "opencode", dryRun });
}

function installAntigravity({ home, dryRun = false }) {
  return installPlatform({ home, platform: "antigravity", dryRun });
}

const INSTALLERS = {
  claude: installClaude,
  codex: installCodex,
  gemini: installGemini,
  opencode: installOpencode,
  antigravity: installAntigravity,
};

function installCommand({ platform, home = os.homedir(), dryRun = false }) {
  if (!platform) {
    log("Plateformes disponibles :\n");

    for (const [key, info] of Object.entries(PLATFORMS)) {
      log(`  ${key.padEnd(8)} ${info.label}`);
      log(`           garde-fou : ${info.guard}`);
    }

    log("\nUsage : ai-learn install <plateforme> [--dry-run]");
    return;
  }

  if (!INSTALLERS[platform]) {
    fail(`unknown platform "${platform}". Available: ${Object.keys(PLATFORMS).join(", ")}`);
  }

  const result = INSTALLERS[platform]({ home, dryRun });
  const prefix = dryRun ? "[dry-run] " : "";

  log(`Installed ai-learn for ${PLATFORMS[platform].label}:`);

  if (result.created.length === 0 && result.removed.length === 0 && result.retired.length === 0) {
    log("  · already installed — nothing new");
  } else {
    for (const file of result.created) {
      log(`  ${prefix}✓ ${file}`);
    }
  }

  if (result.removed.length > 0) {
    log("\nAnciens fichiers de commande retirés :");

    for (const file of result.removed) {
      log(`  ${prefix}− ${file}`);
    }
  }

  if (result.retired.length > 0) {
    log("\nSkills retirés (remplacés par `/learn`, qui route seul vers scan, propose, check et docs) :");

    for (const file of result.retired) {
      log(`  ${prefix}− ${file}`);
    }
  }

  if (result.keptModified.length > 0) {
    log("\nconservé (modifié) — skill retiré que tu as modifié, laissé en place :");

    for (const file of result.keptModified) {
      log(`  = ${file}`);
    }
  }

  if (result.kept.length > 0) {
    log("\nConservés (modifiés ou fichiers utilisateur) :");

    for (const file of result.kept) {
      log(`  = ${file}`);
    }
  }

  if (result.backups.length > 0) {
    log("\nSkills réécrits — ancienne version sauvegardée :");

    for (const file of result.backups) {
      log(`  ${prefix}↺ ${file}`);
    }
  }

  log(`\nGarde-fou (blocage des fichiers apprenant) : ${PLATFORMS[platform].guard}`);

  return result;
}

module.exports = {
  installCommand,
  PLATFORMS,
  INSTALLERS,
  linkOrCopy,
  SKILL_DIRS,
  LEGACY_COMMAND_DIRS,
};
