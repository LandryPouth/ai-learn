"use strict";

// `ai-learn next` — the orientation command: tells the learner exactly what to
// do next. Read-only. The first phase not marked done is the next phase; done
// phases without passing evidence are called out because they are unproven.

const fs = require("fs");
const { log, fail, normalizePortable } = require("./util");
const { readProgress, latestEvidenceForPhase, phaseVerdict, revisitState } = require("./progress");
const { checkpointFilePath, computeSourceHash } = require("./source-hash");
const { printCommitReminder, uncommittedCount } = require("./commit-reminder");
const { normalizePredictionsRequired } = require("./predictions");

// The done phases, split into the two ways one stops being actionable proof:
// `broken` (never proven, or stale) and `revisits` (proven, but old enough to
// redo from memory — story 07.01). One walk, shared by the text renderer and
// the JSON builder, so the two can never disagree on which phase is which.
// `now` is injected rather than read here so the day-boundary behaviour is
// testable (see progress.js#revisitState).
function analyzeDonePhases(dir, phases, now) {
  const broken = [];
  const revisits = [];

  for (const phase of phases) {
    if (!phase || phase.status !== "done") {
      continue;
    }

    const ev = latestEvidenceForPhase(dir, phase.id);
    const checkpointFile = checkpointFilePath(dir, phase.checkpoint);
    const currentHash = ev && ev.sourceHash ? computeSourceHash(dir, { checkpointFile }) : null;
    const verdict = phaseVerdict({ phase, evidence: ev, currentHash, checkpointFileExists: Boolean(checkpointFile) });

    if (verdict.state === "unproven" || verdict.state === "stale") {
      broken.push({ phase, verdict });
      continue;
    }

    const revisit = revisitState({ phase, evidence: ev, now });

    // A stale/unproven phase is already an urgent warning; never list it a
    // second time as a revisit. Reachability comes before retention.
    if (revisit && revisit.due) {
      revisits.push({ phase, ...revisit });
    }
  }

  return { broken, revisits };
}

// The JSON-facing calc: never throws — a missing or corrupt progress.json
// becomes an `error` field instead of a stack (see spec.md's edge cases).
// When no phase remains, `done: true` is the dedicated field an agent reads
// instead of parsing the "All N/N phases done." sentence.
function buildNextReport(dir, { now = new Date() } = {}) {
  const { config, exists } = readProgress(dir);

  if (!exists || !config) {
    return {
      version: 1,
      dir: normalizePortable(dir),
      error: `No progress.json in ${dir}. Run \`ai-learn init\` first.`,
      uncommitted: uncommittedCount(dir),
    };
  }

  const phases = Array.isArray(config.phases) ? config.phases : [];
  const { broken: brokenDone, revisits } = analyzeDonePhases(dir, phases, now);
  const broken = brokenDone.map(({ phase, verdict }) => ({ id: phase.id, name: phase.name, verdict: verdict.state }));
  // Stale proofs no longer replace the real next action (story 04.02): they are
  // reported separately so a consumer sees "where the learner goes next" and
  // "what must be re-proven" as two independent facts.
  const stale = brokenDone.filter((entry) => entry.verdict.state === "stale").map(({ phase }) => phase.id);
  // Revisits are their own field, never folded into `next` (story 07.01):
  // redoing an old phase from memory is a parallel recommendation, not the
  // next unproven step.
  const revisit = revisits.map(({ phase }) => phase.id);
  const next = phases.find((phase) => phase && phase.status !== "done");

  if (!next) {
    return {
      version: 1,
      dir: normalizePortable(dir),
      done: true,
      phasesTotal: phases.length,
      broken,
      stale,
      revisit,
      uncommitted: uncommittedCount(dir),
    };
  }

  const predictionRequirement = normalizePredictionsRequired(next.predictionsRequired);

  return {
    version: 1,
    dir: normalizePortable(dir),
    done: false,
    broken,
    stale,
    revisit,
    uncommitted: uncommittedCount(dir),
    next: {
      id: next.id,
      name: next.name,
      status: next.status,
      checkpoint: next.checkpoint || null,
      // Deprecated since story 04.02, to remove once no --json consumer reads it:
      // it used to mean "next is itself the stale phase". `next` is now always
      // the real following phase, so read `stale` instead.
      mustReprove: false,
      predictionsRequired: predictionRequirement.total,
      predictionsByType: predictionRequirement.byType,
      artifacts: Array.isArray(next.artifacts) ? next.artifacts : [],
    },
  };
}

function nextCommand({ dir, json, now = new Date() }) {
  if (json) {
    const report = buildNextReport(dir, { now });
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
  // proven and now stale — are drift the learner should know about. A stale
  // proof no longer replaces the real next action (story 04.02): `next` names
  // where the learner actually goes, then lists what must be re-proven.
  const { broken: brokenDone, revisits } = analyzeDonePhases(dir, phases, now);
  const staleDone = brokenDone.filter((entry) => entry.verdict.state === "stale");
  const next = phases.find((phase) => phase && phase.status !== "done");

  const logBroken = (entries) => {
    for (const { phase, verdict } of entries) {
      if (verdict.state === "stale" && verdict.reason === "checkpoint-changed") {
        log(`⚠ Phase ${phase.id} — ${phase.name} is marked done but its checkpoint changed since the proof (checkpoint modifié depuis la preuve) — re-prove it: \`ai-learn verify ${phase.id}\`.`);
      } else if (verdict.state === "stale") {
        log(`⚠ Phase ${phase.id} — ${phase.name} is marked done but its proof is stale — re-prove it: \`ai-learn verify --stale\`.`);
      } else {
        log(`⚠ Phase ${phase.id} — ${phase.name} is marked done but has no passing evidence (unproven).`);
      }
    }
  };

  // No stale proof: keep the pre-04.02 output order byte-for-byte (warnings
  // first, then the next action) — this story only moves stale re-proofs.
  if (staleDone.length === 0) {
    logBroken(brokenDone);

    if (brokenDone.length > 0) {
      log("");
    }
  }

  if (next) {
    log(`Next: Phase ${next.id} — ${next.name}`);
    log(`  Status: ${next.status}`);
    log(`  Checkpoint: ${next.checkpoint || "(no checkpoint defined)"}`);

    const predictionRequirement = normalizePredictionsRequired(next.predictionsRequired);

    if (predictionRequirement.total > 0) {
      const byType = predictionRequirement.byType
        ? ` (${Object.entries(predictionRequirement.byType).map(([type, count]) => `${type} ${count}`).join(", ")})`
        : "";

      log(`  Predictions required: ${predictionRequirement.total}${byType}`);
      log("  Protocole : AGENTS.md § « prédire avant de révéler » — une prédiction par écrit, dans le chat,");
      log("  AVANT chaque révélation ; puis consignée dans docs/plans/predictions.md (format en tête du fichier).");
    }

    if (Array.isArray(next.artifacts) && next.artifacts.length > 0) {
      log(`  Artifact: ${next.artifacts.join(", ")}`);
    }

    log("");
    log("When it passes, prove it:");
    log(`  ai-learn verify ${next.id}`);
  } else if (staleDone.length === 0) {
    log(`All ${phases.length}/${phases.length} phases done.`);
    log("Run `ai-learn check` to confirm the whole track is proven, then ship it.");
  } else {
    // Every phase is marked done, but at least one proof does not hold — never
    // claim the track is finished. The actionable list follows below.
    log(`All ${phases.length}/${phases.length} phases are marked done, but ${brokenDone.length} proof(s) do not hold.`);
  }

  // A stale proof is real, but it does not outrank the next action: it is an
  // actionable warning after it, never the headline.
  if (staleDone.length > 0) {
    log("");
    logBroken(brokenDone);
  }

  // Spaced repetition (story 07.01): a proven phase gone stale in memory is a
  // separate recommendation, printed after the normal path — never a blocker,
  // never a replacement for the real next action.
  if (revisits.length > 0) {
    log("");
    log("Revisite échue — refaire de mémoire, sans relire notes ni journal :");

    for (const { phase, lastProvenAt: provenAt, reviewAfterDays } of revisits) {
      log(`  Phase ${phase.id} — ${phase.name} — prouvée le ${provenAt.slice(0, 10)}, revisite conseillée après ${reviewAfterDays} jour(s).`);
      log(`    Rejouez son checkpoint de mémoire : \`ai-learn verify ${phase.id}\`.`);
    }
  }

  printCommitReminder(dir);
}

module.exports = { nextCommand, buildNextReport };
