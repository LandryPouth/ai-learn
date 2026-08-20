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
  const dir = resolveDir(getFlagValue("--dir"));

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
        fail("init requires --technology <name>, ex: ai-learn init --technology Fastify");
      }

      const docSource = docSourceRaw
        ? docSourceRaw.startsWith("http")
          ? { type: "remote", value: docSourceRaw }
          : { type: "local", value: docSourceRaw }
        : null;

      const { created } = scaffold({ dir, project, technology, docSource, phases });
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
        validateCommand({ file: validateFile });
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
      updateCommand({ root: resolveDir(getFlagValue("--root")) });
      break;
    }

    case "help":
    default:
      log(`ai-learn — evidence-based learning tracks

Usage:
  ai-learn init --technology <name> [--project <name>] [--doc-source <path|url>] [--phases '<json>']
  ai-learn status [--dir <dir>]
  ai-learn next [--dir <dir>]
  ai-learn scan [--dir <dir>]
  ai-learn propose [--dir <dir>] [--stack <c|javascript|python|go>] [--level <1-5>] [--limit <n>]
             propose --validate <project.json>
  ai-learn verify <phase-id> [--dir <dir>] [--no-mark]
  ai-learn check [--root <dir>]
  ai-learn docs <add|list|remove|update> [--dir <dir>] [--online] [--regen] [--path <subdir>]
             docs presets: build-your-own-x, developer-roadmap
  ai-learn traps [--dir <dir>]
  ai-learn guard [--input <file>]   (PreToolUse hook — interne, pas un usage manuel)
  ai-learn update [--root <dir>]

Commands:
  init     Scaffold a learning project (progress.json, docs/plans/, checkpoint/, predictions journal)
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
