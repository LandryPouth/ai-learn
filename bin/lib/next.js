"use strict";

// `ai-learn next` — the orientation command: tells the learner exactly what to
// do next. Read-only. The first phase not marked done is the next phase; done
// phases without passing evidence are called out because they are unproven.

const fs = require("fs");
const { log, fail } = require("./util");
const { readProgress, latestEvidenceForPhase, phaseVerdict } = require("./progress");
const { checkpointFilePath, computeSourceHash } = require("./source-hash");

function nextCommand({ dir }) {
  const { config, exists } = readProgress(dir);

  if (!exists || !config) {
    fail(`No progress.json in ${dir}. Run \`ai-learn init\` first.`);
  }

  const phases = Array.isArray(config.phases) ? config.phases : [];
  const next = phases.find((phase) => phase && phase.status !== "done");

  // Done phases whose proof does not actually hold — never proven, or once
  // proven and now stale — are drift the learner should know about before
  // moving on. `check` fails on both; `next` should not hide either.
  const brokenDone = [];

  for (const phase of phases) {
    if (!phase || phase.status !== "done") {
      continue;
    }

    const ev = latestEvidenceForPhase(dir, phase.id);
    const checkpointFile = checkpointFilePath(dir, phase.checkpoint);
    const currentHash = ev ? computeSourceHash(dir, { checkpointFile }) : null;
    const verdict = phaseVerdict({ phase, evidence: ev, currentHash, checkpointFileExists: Boolean(checkpointFile) });

    if (verdict.state === "unproven" || verdict.state === "stale") {
      brokenDone.push({ phase, verdict });
    }
  }

  for (const { phase, verdict } of brokenDone) {
    if (verdict.state === "stale") {
      log(`⚠ Phase ${phase.id} — ${phase.name} is marked done but its proof is stale — re-prove it: \`ai-learn verify ${phase.id}\`.`);
    } else {
      log(`⚠ Phase ${phase.id} — ${phase.name} is marked done but has no passing evidence (unproven).`);
    }
  }

  if (brokenDone.length > 0) {
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
    log("  Protocole : AGENTS.md § « prédire avant de révéler » — une prédiction par écrit, dans le chat,");
    log("  AVANT chaque révélation ; puis consignée dans docs/plans/predictions.md (format en tête du fichier).");
  }

  if (Array.isArray(next.artifacts) && next.artifacts.length > 0) {
    log(`  Artifact: ${next.artifacts.join(", ")}`);
  }

  log("");
  log("When it passes, prove it:");
  log(`  ai-learn verify ${next.id}`);
}

module.exports = { nextCommand };
