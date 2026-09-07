"use strict";

// `ai-learn next` — the orientation command: tells the learner exactly what to
// do next. Read-only. The first phase not marked done is the next phase; done
// phases without passing evidence are called out because they are unproven.

const fs = require("fs");
const { log, fail, normalizePortable } = require("./util");
const { readProgress, latestEvidenceForPhase, phaseVerdict } = require("./progress");
const { checkpointFilePath, computeSourceHash } = require("./source-hash");

// Same broken-done detection `nextCommand` prints as text, shared by the
// JSON builder below so the two can never disagree on which phase is next.
function findBrokenDone(dir, phases) {
  const brokenDone = [];

  for (const phase of phases) {
    if (!phase || phase.status !== "done") {
      continue;
    }

    const ev = latestEvidenceForPhase(dir, phase.id);
    const checkpointFile = checkpointFilePath(dir, phase.checkpoint);
    const currentHash = ev && ev.sourceHash ? computeSourceHash(dir, { checkpointFile }) : null;
    const verdict = phaseVerdict({ phase, evidence: ev, currentHash, checkpointFileExists: Boolean(checkpointFile) });

    if (verdict.state === "unproven" || verdict.state === "stale") {
      brokenDone.push({ phase, verdict });
    }
  }

  return brokenDone;
}

// The JSON-facing calc: never throws — a missing or corrupt progress.json
// becomes an `error` field instead of a stack (see spec.md's edge cases).
// When no phase remains, `done: true` is the dedicated field an agent reads
// instead of parsing the "All N/N phases done." sentence.
function buildNextReport(dir) {
  const { config, exists } = readProgress(dir);

  if (!exists || !config) {
    return { version: 1, dir: normalizePortable(dir), error: `No progress.json in ${dir}. Run \`ai-learn init\` first.` };
  }

  const phases = Array.isArray(config.phases) ? config.phases : [];
  const brokenDone = findBrokenDone(dir, phases);
  const broken = brokenDone.map(({ phase, verdict }) => ({ id: phase.id, name: phase.name, verdict: verdict.state }));
  const staleFirst = brokenDone.find((entry) => entry.verdict.state === "stale");
  const next = staleFirst ? staleFirst.phase : phases.find((phase) => phase && phase.status !== "done");

  if (!next) {
    return { version: 1, dir: normalizePortable(dir), done: true, phasesTotal: phases.length, broken };
  }

  return {
    version: 1,
    dir: normalizePortable(dir),
    done: false,
    broken,
    next: {
      id: next.id,
      name: next.name,
      status: next.status,
      checkpoint: next.checkpoint || null,
      mustReprove: Boolean(staleFirst),
      predictionsRequired: next.predictionsRequired || 0,
      artifacts: Array.isArray(next.artifacts) ? next.artifacts : [],
    },
  };
}

function nextCommand({ dir, json }) {
  if (json) {
    const report = buildNextReport(dir);
    log(JSON.stringify(report));

    if (report.error) {
      process.exitCode = 1;
    }
    return;
  }

  const { config, exists } = readProgress(dir);

  if (!exists || !config) {
    fail(`No progress.json in ${dir}. Run \`ai-learn init\` first.`);
  }

  const phases = Array.isArray(config.phases) ? config.phases : [];

  // Done phases whose proof does not actually hold — never proven, or once
  // proven and now stale — are drift the learner should know about before
  // moving on. `check` fails on both; `next` should not hide either.
  const brokenDone = findBrokenDone(dir, phases);

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

  // A stale proof outranks starting the next unstarted phase: re-proving
  // what regressed comes first, before moving forward (plan.md, "Ordre dans
  // next"). Ledger order among several stale phases, not sorted — the first
  // one a learner would hit reading progress.json top to bottom.
  const staleFirst = brokenDone.find((entry) => entry.verdict.state === "stale");
  const next = staleFirst ? staleFirst.phase : phases.find((phase) => phase && phase.status !== "done");

  if (!next) {
    log(`All ${phases.length}/${phases.length} phases done.`);
    log("Run `ai-learn check` to confirm the whole track is proven, then ship it.");
    return;
  }

  if (staleFirst) {
    log(`Next: Phase ${next.id} — ${next.name} — re-prove it (marked done, but its proof is stale)`);
  } else {
    log(`Next: Phase ${next.id} — ${next.name}`);
    log(`  Status: ${next.status}`);
  }

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
  log(staleFirst ? "Re-prove it:" : "When it passes, prove it:");
  log(`  ai-learn verify ${next.id}`);
}

module.exports = { nextCommand, buildNextReport };
