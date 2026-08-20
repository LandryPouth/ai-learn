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

    case "check": {
      const { checkCommand } = require("./lib/check");
      const root = resolveDir(getFlagValue("--root"));
      checkCommand({ root });
      break;
    }

    case "help":
    default:
      log(`ai-learn — evidence-based learning tracks

Usage:
  ai-learn init --technology <name> [--project <name>] [--doc-source <path|url>] [--phases '<json>']
  ai-learn status [--dir <dir>]
  ai-learn next [--dir <dir>]
  ai-learn verify <phase-id> [--dir <dir>] [--no-mark]
  ai-learn check [--root <dir>]

Commands:
  init     Scaffold a learning project (progress.json, docs/plans/, checkpoint/, predictions journal)
  status   Show phases and their state in the current project
  next     Show the next phase to work on (and warn on unproven "done" phases)
  verify   Run a phase checkpoint, record executed evidence, mark it done on success
  check    Cross-check progress against reality across learning projects under a root

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
