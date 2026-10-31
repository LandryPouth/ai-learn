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

  // Commands that act on one project find it from any subfolder; an explicit
  // --dir (or init/update, which choose their own target) is taken as given.
  const FROM_SUBDIR = ["status", "next", "verify", "predict", "norm", "mutate", "traps", "docs"];
  const explicitDir = getFlagValue("--dir");
  const dir =
    !explicitDir && FROM_SUBDIR.includes(command)
      ? require("./lib/progress").findProjectDir(resolveDir(null))
      : resolveDir(explicitDir);

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
      const { scaffold, chooseInitDir } = require("./lib/init");
      const projectFlag = getFlagValue("--project", null);
      const target = chooseInitDir({ cwd: dir, explicitDir: Boolean(explicitDir), project: projectFlag });
      const project = projectFlag || path.basename(target);
      log(`Dossier du projet : ${target}`);
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
        fail("init exige --technology <nom>, ex : ai-learn init --technology Rust");
      }

      const docSource = docSourceRaw
        ? docSourceRaw.startsWith("http")
          ? { type: "remote", value: docSourceRaw }
          : { type: "local", value: docSourceRaw }
        : null;
      const { detectPlatform } = require("./lib/platforms/detect");
      const platform = getFlagValue("--platform", null) || detectPlatform();

      const { created } = scaffold({ dir: target, project, technology, docSource, phases, platform });
      log(`Projet d'apprentissage "${project}" initialisé dans ${target}`);

      for (const file of created) {
        log(`  créé ${file}`);
      }
      break;
    }

    case "status": {
      const { statusCommand } = require("./lib/status");
      statusCommand({ dir, json: flags.has("--json") });
      break;
    }

    case "next": {
      const { nextCommand } = require("./lib/next");
      nextCommand({ dir, json: flags.has("--json") });
      break;
    }

    case "verify": {
      const { verifyCommand, staleCommand } = require("./lib/verify");

      if (flags.has("--stale")) {
        staleCommand({ dir });
        break;
      }

      const { parseArgs } = require("./lib/args");
      const { positionals } = parseArgs(commandArgs, { valueFlags: ["--dir"] });
      const phaseId = Number.parseInt(positionals[0] || "", 10);

      if (!Number.isFinite(phaseId)) {
        fail("verify requires a phase id or --stale, ex: ai-learn verify 0");
      }

      verifyCommand({ dir, phaseId, noMark: flags.has("--no-mark"), revisit: flags.has("--revisit") });
      break;
    }

    case "revisit": {
      const { revisitCommand } = require("./lib/revisit");
      const { parseArgs } = require("./lib/args");
      const { positionals } = parseArgs(commandArgs, { valueFlags: ["--dir"] });
      const phaseId = Number.parseInt(positionals[0] || "", 10);

      if (!Number.isFinite(phaseId)) {
        fail("revisit requires a phase id, ex: ai-learn revisit 2 [--giveup]");
      }

      revisitCommand({ dir, phaseId, giveup: flags.has("--giveup") });
      break;
    }

    case "mutate": {
      const { mutateCommand } = require("./lib/mutate");
      const phaseRaw = getFlagValue("--phase", null);
      const phaseId = phaseRaw !== null ? Number.parseInt(phaseRaw, 10) : NaN;

      if (!Number.isFinite(phaseId)) {
        fail("mutate requires --phase <id>, ex: ai-learn mutate --phase 0");
      }

      mutateCommand({ dir, phaseId });
      break;
    }

    case "predict": {
      const { recordPrediction, revealPrediction } = require("./lib/predictions");
      const { readProgress, missingProgressMessage } = require("./lib/progress");
      const revealId = getFlagValue("--reveal", null);
      const phaseRaw = getFlagValue("--phase", null);
      const phaseId = phaseRaw !== null ? Number.parseInt(phaseRaw, 10) : NaN;

      if (!revealId && !Number.isFinite(phaseId)) {
        fail('predict requires --phase <id>, ex: ai-learn predict --phase 0 --prediction "..."');
      }

      const { config, exists } = readProgress(dir);

      if (!exists || !config) {
        fail(missingProgressMessage(dir));
      }

      const fields = {
        phaseId,
        type: getFlagValue("--type", null),
        prediction: getFlagValue("--prediction", null),
        gaps: getFlagValue("--gaps", null),
        score: getFlagValue("--score", null),
        strengths: getFlagValue("--strengths", null),
        weaknesses: getFlagValue("--weaknesses", null),
        flash: getFlagValue("--flash", null),
        corrected: getFlagValue("--corrected", null),
        correctedBy: getFlagValue("--corrected-by", revealId ? null : "apprenant"),
      };
      const { entry, render } = revealId ? revealPrediction(dir, config, revealId, fields) : recordPrediction(dir, config, fields);

      log(`${revealId ? "Revealed" : "Recorded"} prediction ${entry.id} for phase ${entry.phaseId} (.ai-learn/predictions.json).`);

      if (render.action === "kept-customized") {
        log("docs/plans/predictions.md is customized (no generated marker) — left untouched.");
      } else {
        log(`docs/plans/predictions.md ${render.action}.`);
      }

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
      const rootFlag = getFlagValue("--root");
      const root = rootFlag ? resolveDir(rootFlag) : require("./lib/progress").findProjectDir(resolveDir(null));
      checkCommand({ root, json: flags.has("--json") });
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

    case "norm": {
      // Standalone, read-only clean-code check (file/function length, nesting,
      // params) — same engine verify/check hard-block on, but callable anytime
      // for a fast local feedback loop. Exits non-zero on any violation.
      // `--hook` is the PostToolUse entry point (story 07.03): it reads the
      // hook JSON on stdin, measures only the written file, and never blocks.
      const { normCommand, normHookCommand } = require("./lib/norm");

      if (flags.has("--hook")) {
        normHookCommand({ inputFile: getFlagValue("--input", null) });
        break;
      }

      normCommand({ dir });
      break;
    }

    case "mode": {
      // Switches `.ai-learn/guard.json` between `apprenti` and `dirigeant`.
      // `dirigeant` is gated on tiers 1-3 of the global test-mastery ledger;
      // `apprenti` is always permitted (see lib/mode.js).
      const { modeCommand } = require("./lib/mode");
      const { parseArgs } = require("./lib/args");
      const { positionals } = parseArgs(commandArgs, { valueFlags: ["--dir", "--platform"] });
      modeCommand({ dir, target: positionals[0] || null });
      break;
    }

    case "guard": {
      // PreToolUse hook (hot path): refuses the AI any write into the learner's
      // solution files. Reads the hook JSON on stdin, responds allow/deny.
      const { guardCommand } = require("./lib/guard");
      guardCommand({ inputFile: getFlagValue("--input", null) });
      break;
    }

    case "profile": {
      // Machinery (story 10.02): the agent reads and writes the learner profile.
      const { profileCommand } = require("./lib/profile");
      const { parseArgs } = require("./lib/args");
      const { positionals, flags } = parseArgs(commandArgs, { valueFlags: ["--json"] });
      const raw = flags["--json"];
      profileCommand({ args: positionals, json: "--json" in flags, jsonValue: typeof raw === "string" ? raw : "" });
      break;
    }

    case "update": {
      const { updateCommand } = require("./lib/update");
      const platform = getFlagValue("--platform", null);
      updateCommand({ root: resolveDir(getFlagValue("--root")), platform });
      break;
    }

    case "ledgers": {
      // Machinery (story 09.01): called by `update` and by the agent, never
      // one of the learner's commands.
      const { ledgersCommand } = require("./lib/ledgers");
      const { parseArgs } = require("./lib/args");
      const { flags, positionals } = parseArgs(commandArgs, { valueFlags: ["--dir", "--platform"] });
      // A typo'd `--dryrun` must not silently turn a simulation into a repair.
      const known = new Set(["--dir", "--platform", "--repair", "--sync", "--dry-run"]);
      const unknown = [...Object.keys(flags).filter((flag) => !known.has(flag)), ...positionals];
      if (unknown.length > 0) {
        throw new UsageError(`ledgers : argument inconnu ${unknown.join(", ")} — attendu --repair [--dry-run] | --sync [--dir <dir>]`);
      }
      process.exitCode = ledgersCommand({
        dir,
        repair: Boolean(flags["--repair"]),
        sync: Boolean(flags["--sync"]),
        dryRun: Boolean(flags["--dry-run"]),
      });
      break;
    }

    case "upgrade": {
      const { upgradeCommand } = require("./lib/upgrade");
      upgradeCommand();
      break;
    }

    case "install": {
      const { installCommand } = require("./lib/install");
      const { parseArgs } = require("./lib/args");
      const { positionals, flags: installFlags } = parseArgs(commandArgs, { valueFlags: ["--home"] });
      const platform = positionals[0] || null;
      const home = typeof installFlags["--home"] === "string" ? installFlags["--home"] : null;
      installCommand({ platform, dryRun: Boolean(installFlags["--dry-run"]), ...(home ? { home } : {}) });
      break;
    }

    case "help":
    default:
      log(`ai-learn — evidence-based learning tracks

Usage:
  ai-learn version | --version | -v
  ai-learn init --technology <name> [--project <name>] [--dir <dir>] [--doc-source <path|url>] [--phases '<json>']
             [--platform <claude|codex|gemini|opencode|antigravity>]
  ai-learn status [--dir <dir>] [--json]
  ai-learn next [--dir <dir>] [--json]
  ai-learn scan [--dir <dir>]
  ai-learn propose [--dir <dir>] [--stack <c|javascript|typescript|python|go|rust>] [--level <1-5>] [--limit <n>]
             propose --validate <project.json>
  ai-learn verify <phase-id> [--dir <dir>] [--no-mark] [--revisit]
  ai-learn revisit <phase-id> [--giveup] [--dir <dir>]
  ai-learn verify --stale [--dir <dir>]
  ai-learn mutate --phase <id> [--dir <dir>]
  ai-learn predict --phase <id> --prediction <text> [--type <code|casse|reality|transfert>] [--dir <dir>]
  ai-learn predict --reveal <id> --score <n/10> --gaps <t> --strengths <t> --weaknesses <t> --flash <t> [--corrected <t>]
             [--corrected-by <apprenant|IA>] [--dir <dir>]
  ai-learn check [--root <dir>] [--json]
  ai-learn docs <add|list|remove|update> [--dir <dir>] [--online] [--regen] [--secondary] [--path <subdir>]
             docs presets: build-your-own-x, developer-roadmap, conventional-commits, gh-manual
  ai-learn traps [--dir <dir>]
  ai-learn norm [--dir <dir>]   (--hook: hook PostToolUse interne, lecture seule)
  ai-learn mode <apprenti|dirigeant> [--dir <dir>]
  ai-learn guard [--input <file>]   (PreToolUse hook — interne, pas un usage manuel)
  ai-learn update [--root <dir>] [--platform <claude|codex|gemini|opencode|antigravity>]
  ai-learn ledgers --repair [--dry-run] | --sync [--dir <dir>]   (machinerie : ledgers ~/.ai-learn)
  ai-learn profile [--json] | profile set --json '<objet>'   (machinerie : profil ~/.ai-learn/profile.json)
  ai-learn upgrade
  ai-learn install [claude|codex|gemini|opencode|antigravity] [--home <dir>] [--dry-run]

--platform is accepted by EVERY command (not just init/update): before
dispatch, ai-learn mechanically installs that platform's skills if
missing — a learner resuming on a different platform than the project was
init'ed on self-heals on its very next command, no separate step to
remember. Claude Code also self-heals with no flag at all (CLAUDECODE=1,
the one verified auto-detect signal) — see bin/lib/platforms/ensure.js.

--json (check, status, next only) prints one machine-readable JSON object on
stdout instead of the human report, for an agent to parse — it never mixes
with the text output.

Commands:
  init     Scaffold a learning project (progress.json, docs/plans/, checkpoint/, predictions journal).
           --platform installs that platform's skills immediately (the agent knows its own
           identity — pass it explicitly; falls back to detecting Claude Code only, the sole
           verified signal — see bin/lib/platforms/detect.js)
  status   Show phases and their state in the current project
  next     Show the next phase to work on (and warn on unproven "done" phases)
  scan     Analyze an existing project: where you are + deepening directions (non-regression)
  propose  Suggest projects to build when you don't know what to do; every stage
           backed by a verifiable resource; --validate refuses an invented
           project with an unsourced stage
  verify   Run a phase checkpoint, record executed evidence, mark it done on success.
           --stale re-proves every done phase whose proof went stale, and separates
           "toujours vert" (fresh proof) from "régression" (the checkpoint now fails)
           --revisit proves a phase retyped from memory after "ai-learn revisit": it
           refreshes lastProvenAt and doubles the interval on success, never demotes on
           failure, and never rewrites the ledger status; refused without a removal
  revisit  Remove from your files what a done phase added (reverse of its feat(phase-N)
           commits) so you retype it from memory; --giveup restores your files exactly
  mutate   Mutation testing: break the learner's code one way, run the phase
           checkpoint against it, report SURVÉCU (the test missed it) or TUÉ
           (the test caught it) per site — the file is always restored after
  predict  Record a prediction for a phase in .ai-learn/predictions.json (source of
           truth) and regenerate docs/plans/predictions.md from it — unless that
           file has been customized (no generated marker), in which case it is left
           untouched and the tool says so. Called by the agent, not the learner.
  check    Cross-check progress against reality across learning projects under a root
  docs     Bring reference docs into the project (docs/sources/) and record their
           provenance; --online records URLs only, --regen recreates a
           non-clonable source locally from a verified origin (anti-hallucination);
           a local file (ex. a PDF book) is embedded whole and the AI distills
           only what the plan needs into an essentiel.md citing pages;
           --secondary adds a light 4th source outside the quota of 3 (citable,
           never mined for traps)
  traps    Extract the friction bank (warning callouts) from the embedded docs —
           each trap cited file:line, probed by the protocol, never invented
  norm     Check clean-code metrics (file/function length, nesting depth, param
           count) against the project's norm (.ai-learn/norm.json or the stack
           pack's defaults) — read-only, non-zero exit on violation. Same engine
           verify/check hard-block on; run standalone for fast local feedback.
           --hook is the PostToolUse entry point: init/update wire it for
           claude-code so a write into src/** gets the violation immediately,
           without blocking (the block stays in verify/check)
  mode     Switch between apprenti and dirigeant. Dirigeant is earned: tiers 1-3
           of ~/.ai-learn/tracks/tests.json must be achieved (a killed mutant, a
           100 % mutation score, red-before-green). An absent/corrupt ledger
           refuses; returning to apprenti is always permitted
  guard    PreToolUse hook: refuses the AI any write into the learner's solution
           files (src/** by default, .ai-learn/guard.json). Wired by init/update —
           the learner types that code, the AI cannot
  update   Propagate the protocol template + traps bank to every learning project
           under --root (non-destructive: only generated AGENTS.md is overwritten)
  upgrade  Update the ai-learn tool itself to the latest version (npm reinstall from
           GitHub). Refuses to run on a dev checkout (git clone) — use git pull there.
           Does not touch already-scaffolded projects; run update --root for that
  install  Install the 7 commands as <name>/SKILL.md skills (and, for claude,
           the ai-learn binary on PATH) for a platform. Old command files this
           tool wrote are removed only when unmodified; edited ones are kept
           and named. --dry-run reports the actions without touching disk.
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
