#!/usr/bin/env node

"use strict";

// Thin entry point: parses the arguments and dispatches to the bin/lib modules.
// The logic of each command lives in its own module.

// A crash used to reach the user as a raw Node stack trace, which reads as "the
// tool errored internally" with nothing actionable in it. Register before the
// requires so a module that fails to load is covered too.
process.on("uncaughtException", (error) => {
  if (error && error.code === "EPIPE") {
    process.exit(0);
  }

  process.stderr.write(`Error: ${(error && error.message) || error}\n`);
  process.stderr.write(
    "This is an ai-learn bug, not a validation failure. " +
      "Re-run with AI_LEARN_DEBUG=1 for the stack trace, and add a row to docs/DOGFOODING.md.\n",
  );

  if (process.env.AI_LEARN_DEBUG && error && error.stack) {
    process.stderr.write(`${error.stack}\n`);
  }

  process.exit(1);
});

const args = process.argv.slice(2);
const command = args[0] || "help";
const commandArgs = args.slice(1);
const flags = new Set(commandArgs);

function getFlagValue(name, fallback = null) {
  const inline = args.find((arg) => arg.startsWith(`${name}=`));

  if (inline) {
    return inline.slice(name.length + 1);
  }

  const index = args.indexOf(name);

  if (index !== -1 && args[index + 1] && !args[index + 1].startsWith("--")) {
    return args[index + 1];
  }

  return fallback;
}

const path = require("path");
const { log, fail, UsageError } = require("./lib/util");
const { resolveDir } = require("./lib/context");

function main() {
  if (command === "version" || args.includes("--version") || args.includes("-v")) {
    log(require("../package.json").version);
    return;
  }

  const dir = resolveDir(getFlagValue("--dir"));

  // Mechanical platform self-heal, on every command but the hot-path guard
  // hook: a learner resuming on a different platform than it was `init`ed on
  // never depends on an agent remembering a documented step — see
  // lib/platforms/ensure.js for the honest limits (Claude Code auto-detects;
  // others need --platform).
  if (command !== "guard") {
    const { ensurePlatformCommands } = require("./lib/platforms/ensure");
    ensurePlatformCommands(getFlagValue("--platform", null));
  }

  switch (command) {
    case "init": {
      const { scaffold } = require("./lib/init");
      const project = getFlagValue("--project", null) || path.basename(dir);
      const technology = getFlagValue("--technology", null);
      const docSourceRaw = getFlagValue("--doc-source", null);
      const phasesRaw = getFlagValue("--phases", null);
      let phases = [];

      if (phasesRaw) {
        try {
          phases = JSON.parse(phasesRaw);
        } catch {
          fail(`--phases must be valid JSON (an array of phase objects), got: ${phasesRaw}`);
        }
      }

      if (!technology) {
        fail("init requires --technology <name>, ex: ai-learn init --technology Rust");
      }

      const docSource = docSourceRaw
        ? docSourceRaw.startsWith("http")
          ? { type: "remote", value: docSourceRaw }
          : { type: "local", value: docSourceRaw }
        : null;
      const { detectPlatform } = require("./lib/platforms/detect");
      const platform = getFlagValue("--platform", null) || detectPlatform();

      const { created } = scaffold({ dir, project, technology, docSource, phases, platform });
      log(`Initialized learning project "${project}" in ${dir}`);

      for (const file of created) {
        log(`  created ${file}`);
      }
      break;
    }

    case "status": {
      const { statusCommand } = require("./lib/status");
      statusCommand({ dir });
      break;
    }

    case "next": {
      const { nextCommand } = require("./lib/next");
      nextCommand({ dir });
      break;
    }

    case "verify": {
      const { verifyCommand } = require("./lib/verify");
      const phaseId = Number.parseInt(commandArgs.find((arg) => !arg.startsWith("--")) || "", 10);

      if (!Number.isFinite(phaseId)) {
        fail("verify requires a phase id, ex: ai-learn verify 0");
      }

      verifyCommand({ dir, phaseId, noMark: flags.has("--no-mark") });
      break;
    }

    case "scan": {
      const { scanCommand } = require("./lib/scan");
      scanCommand({ dir });
      break;
    }

    case "propose": {
      const { proposeCommand, validateCommand } = require("./lib/propose");
      const stack = getFlagValue("--stack", null);
      const levelRaw = getFlagValue("--level", null);
      const level = levelRaw ? Number.parseInt(levelRaw, 10) : null;
      const limitRaw = getFlagValue("--limit", null);
      const limit = limitRaw ? Number.parseInt(limitRaw, 10) : 5;
      const validateFile = getFlagValue("--validate", null);

      if (validateFile) {
        validateCommand({ file: validateFile, dir });
      } else {
        proposeCommand({ dir, stack, level, limit });
      }
      break;
    }

    case "check": {
      const { checkCommand } = require("./lib/check");
      const root = resolveDir(getFlagValue("--root"));
      checkCommand({ root });
      break;
    }

    case "docs": {
      const { docsCommand } = require("./lib/docs");
      docsCommand({ dir, args: commandArgs });
      break;
    }

    case "traps": {
      const { trapsCommand } = require("./lib/traps");
      trapsCommand({ dir });
      break;
    }

    case "guard": {
      // PreToolUse hook (hot path): refuses the AI any write into the learner's
      // solution files. Reads the hook JSON on stdin, responds allow/deny.
      const { guardCommand } = require("./lib/guard");
      guardCommand({ inputFile: getFlagValue("--input", null) });
      break;
    }

    case "update": {
      const { updateCommand } = require("./lib/update");
      const platform = getFlagValue("--platform", null);
      updateCommand({ root: resolveDir(getFlagValue("--root")), platform });
      break;
    }

    case "upgrade": {
      const { upgradeCommand } = require("./lib/upgrade");
      upgradeCommand();
      break;
    }

    case "install": {
      const { installCommand } = require("./lib/install");
      const platform = commandArgs.find((arg) => !arg.startsWith("--")) || null;
      const home = getFlagValue("--home", null);
      installCommand({ platform, ...(home ? { home } : {}) });
      break;
    }

    case "help":
    default:
      log(`ai-learn — evidence-based learning tracks

Usage:
  ai-learn version | --version | -v
  ai-learn init --technology <name> [--project <name>] [--doc-source <path|url>] [--phases '<json>']
             [--platform <claude|codex|gemini|opencode|antigravity>]
  ai-learn status [--dir <dir>]
  ai-learn next [--dir <dir>]
  ai-learn scan [--dir <dir>]
  ai-learn propose [--dir <dir>] [--stack <c|javascript|typescript|python|go|rust>] [--level <1-5>] [--limit <n>]
             propose --validate <project.json>
  ai-learn verify <phase-id> [--dir <dir>] [--no-mark]
  ai-learn check [--root <dir>]
  ai-learn docs <add|list|remove|update> [--dir <dir>] [--online] [--regen] [--path <subdir>]
             docs presets: build-your-own-x, developer-roadmap, conventional-commits, gh-manual
  ai-learn traps [--dir <dir>]
  ai-learn guard [--input <file>]   (PreToolUse hook — interne, pas un usage manuel)
  ai-learn update [--root <dir>] [--platform <claude|codex|gemini|opencode|antigravity>]
  ai-learn upgrade
  ai-learn install [claude|codex|gemini|opencode|antigravity] [--home <dir>]

--platform is accepted by EVERY command (not just init/update): before
dispatch, ai-learn mechanically installs that platform's /… commands if
missing — a learner resuming on a different platform than the project was
init'ed on self-heals on its very next command, no separate step to
remember. Claude Code also self-heals with no flag at all (CLAUDECODE=1,
the one verified auto-detect signal) — see bin/lib/platforms/ensure.js.

Commands:
  init     Scaffold a learning project (progress.json, docs/plans/, checkpoint/, predictions journal).
           --platform installs that platform's /… commands immediately (the agent knows its own
           identity — pass it explicitly; falls back to detecting Claude Code only, the sole
           verified signal — see bin/lib/platforms/detect.js)
  status   Show phases and their state in the current project
  next     Show the next phase to work on (and warn on unproven "done" phases)
  scan     Analyze an existing project: where you are + deepening directions (non-regression)
  propose  Suggest projects to build when you don't know what to do; every stage
           backed by a verifiable resource; --validate refuses an invented
           project with an unsourced stage
  verify   Run a phase checkpoint, record executed evidence, mark it done on success
  check    Cross-check progress against reality across learning projects under a root
  docs     Bring reference docs into the project (docs/sources/) and record their
           provenance; --online records URLs only, --regen recreates a
           non-clonable source locally from a verified origin (anti-hallucination);
           a local file (ex. a PDF book) is embedded whole and the AI distills
           only what the plan needs into an essentiel.md citing pages
  traps    Extract the friction bank (warning callouts) from the embedded docs —
           each trap cited file:line, probed by the protocol, never invented
  guard    PreToolUse hook: refuses the AI any write into the learner's solution
           files (src/** by default, .ai-learn/guard.json). Wired by init/update —
           the learner types that code, the AI cannot
  update   Propagate the protocol template + traps bank to every learning project
           under --root (non-destructive: only generated AGENTS.md is overwritten)
  upgrade  Update the ai-learn tool itself to the latest version (npm reinstall from
           GitHub). Refuses to run on a dev checkout (git clone) — use git pull there.
           Does not touch already-scaffolded projects; run update --root for that
  install  Install the 7 slash commands (and, for claude, the ai-learn
           binary on PATH) for a platform: claude (mechanical guard) or
           codex (commands only — no pre-write hook available there).
           No argument lists supported platforms and their guard status.

Every verdict is executed proof: verify runs the checkpoint itself and only
"done" means the evidence says so — not the word of an agent.`);
      break;
  }
}

try {
  main();
} catch (error) {
  if (error instanceof UsageError) {
    process.stderr.write(`Error: ${error.message}\n`);
    process.exit(1);
  }
  throw error; // a real bug — let the uncaughtException handler name it
}
