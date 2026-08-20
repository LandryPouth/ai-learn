"use strict";

// `ai-learn next` — the orientation command: tells the learner exactly what to
// do next. Read-only. The first phase not marked done is the next phase; done
// phases without passing evidence are called out because they are unproven.

const fs = require("fs");
const { log, fail } = require("./util");
const { readProgress } = require("./progress");
const { latestEvidenceForPhase } = require("./status");

function nextCommand({ dir }) {
  const { config, exists } = readProgress(dir);

  if (!exists || !config) {
    fail(`No progress.json in ${dir}. Run \`ai-learn init\` first.`);
  }

  const phases = Array.isArray(config.phases) ? config.phases : [];
  const next = phases.find((phase) => phase && phase.status !== "done");

  // Unproven "done" phases are drift the learner should know about before
  // moving on — the check scanner fails on them, and next should not hide it.
  const unprovenDone = phases.filter(
    (phase) => phase && phase.status === "done" && !latestEvidenceForPhase(dir, phase.id),
  );

  for (const phase of unprovenDone) {
    log(`⚠ Phase ${phase.id} — ${phase.name} is marked done but has no passing evidence (unproven).`);
  }

  if (unprovenDone.length > 0) {
    log("");
  }

  if (!next) {
    log(`All ${phases.length}/${phases.length} phases done.`);
    log("Run `ai-learn check` to confirm the whole track is proven, then ship it.");
    return;
  }

  log(`Next: Phase ${next.id} — ${next.name}`);
  log(`  Status: ${next.status}`);
  log(`  Checkpoint: ${next.checkpoint || "(no checkpoint defined)"}`);

  if (next.predictionsRequired) {
    log(`  Predictions required: ${next.predictionsRequired}`);
  }

  if (Array.isArray(next.artifacts) && next.artifacts.length > 0) {
    log(`  Artifact: ${next.artifacts.join(", ")}`);
  }

  log("");
  log("When it passes, prove it:");
  log(`  ai-learn verify ${next.id}`);
}

module.exports = { nextCommand };
