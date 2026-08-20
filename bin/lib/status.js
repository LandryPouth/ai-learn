"use strict";

// `ai-learn status` — the single-project view: phases and their state, with the
// latest passing evidence date when one exists. Read-only.

const fs = require("fs");
const path = require("path");
const { log, fail } = require("./util");
const { readProgress, runsDir, validateProgress } = require("./progress");

function latestEvidenceForPhase(dir, phaseId) {
  const runs = runsDir(dir);

  if (!fs.existsSync(runs)) {
    return null;
  }

  const files = fs.readdirSync(runs).filter((name) => name.endsWith("-verify.json")).sort().reverse();

  for (const name of files) {
    try {
      const ev = JSON.parse(fs.readFileSync(path.join(runs, name), "utf8"));

      if (ev.phaseId === phaseId && ev.ok === true) {
        return ev;
      }
    } catch {
      // Unreadable evidence is not proof; skip it.
    }
  }

  return null;
}

function printStatus(config, { dir }) {
  const done = config.phases.filter((phase) => phase.status === "done").length;

  log(`Project: ${config.project || path.basename(dir)}${config.technology ? ` · ${config.technology}` : ""}`);
  log(`Phases: ${done}/${config.phases.length} done\n`);

  if (config.phases.length === 0) {
    log("No phases yet. Add them to progress.json, then run `ai-learn verify <id>` for each checkpoint.");
    return;
  }

  for (const phase of config.phases) {
    const mark = phase.status === "done" ? "✓" : phase.status === "in_progress" ? "●" : "○";
    const ev = latestEvidenceForPhase(dir, phase.id);
    const evNote = ev ? ` — evidence ${new Date(ev.generatedAt).toISOString().slice(0, 10)}` : "";
    log(`  ${mark} Phase ${phase.id} — ${phase.name}${evNote}`);
    if (phase.checkpoint) {
      log(`      ${phase.checkpoint}`);
    }
  }
}

function statusCommand({ dir }) {
  const { config, exists } = readProgress(dir);

  if (!exists || !config) {
    fail(`No progress.json in ${dir}. Run \`ai-learn init\` first.`);
  }

  printStatus(config, { dir });

  const issues = validateProgress(config);

  if (issues.length > 0) {
    log("\nprogress.json issues:");
    for (const issue of issues) {
      log(`  - ${issue.message}`);
    }
  }
}

module.exports = { statusCommand, latestEvidenceForPhase };
