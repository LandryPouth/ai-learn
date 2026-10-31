"use strict";

// `ai-learn next` — the orientation command: tells the learner exactly what to
// do next. Read-only. The first phase not marked done is the next phase; done
// phases without passing evidence are called out because they are unproven.

const fs = require("fs");
const { log, fail, normalizePortable } = require("./util");
const { readProgress, missingProgressMessage, latestEvidenceForPhase, phaseVerdict, revisitState, scaffoldState } = require("./progress");
const { checkpointFilePath, computeSourceHash } = require("./source-hash");
const { printCommitReminder, uncommittedCount } = require("./commit-reminder");
const { normalizePredictionsRequired } = require("./predictions");
const { normProject, formatViolation } = require("./norm");
const { revisitStatus, revisitNotice } = require("./revisit");
const { incidentFact, incidentNotice, incidentDue } = require("./incident");

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
// Learner-file norm violations, as the `file:line — message [rule]` strings
// `ai-learn norm` prints. Never throws: a norm failure must not break `next`.
const MAX_NORM_LINES = 5;

function learnerNorm(dir) {
  try {
    return { violations: normProject(dir).violations.map(formatViolation) };
  } catch {
    return { violations: [] };
  }
}

// The one place `next` writes anything: an incident draw is recorded (outside
// the project) so each proven phase is rolled for exactly once. `random` and
// `home` are injectable for tests.
function incidentOffer(dir, { random, home } = {}) {
  const fact = incidentFact(dir);
  return { ...fact, due: !fact.active && incidentDue(dir, { random, home }) };
}

function buildNextReport(dir, { now = new Date(), random, home } = {}) {
  const { config, exists } = readProgress(dir);

  if (!exists || !config) {
    return {
      version: 1,
      dir: normalizePortable(dir),
      error: missingProgressMessage(dir),
      uncommitted: uncommittedCount(dir),
    };
  }

  const phases = Array.isArray(config.phases) ? config.phases : [];
  const { broken: brokenDone, revisits } = analyzeDonePhases(dir, phases, now);
  const pending = revisitStatus(dir);
  const revisitPending = pending.state === "none" ? null : { state: pending.state, phaseId: pending.lock ? pending.lock.phaseId : null };
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
      outdated: scaffoldState(config).outdated,
      done: true,
      phasesTotal: phases.length,
      revisitPending,
      incident: incidentOffer(dir, { random, home }),
      broken,
      stale,
      revisit,
      norm: learnerNorm(dir),
      uncommitted: uncommittedCount(dir),
    };
  }

  const predictionRequirement = normalizePredictionsRequired(next.predictionsRequired);

  return {
    version: 1,
    dir: normalizePortable(dir),
    outdated: scaffoldState(config).outdated,
    done: false,
    revisitPending,
    incident: incidentOffer(dir, { random, home }),
    broken,
    stale,
    revisit,
    norm: learnerNorm(dir),
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

function nextCommand({ dir, json, now = new Date(), random, home }) {
  if (json) {
    const report = buildNextReport(dir, { now, random, home });
    log(JSON.stringify(report));

    if (report.error) {
      process.exitCode = 1;
    }
    return;
  }

  const { config, exists } = readProgress(dir);

  if (!exists || !config) {
    fail(missingProgressMessage(dir));
  }

  const phases = Array.isArray(config.phases) ? config.phases : [];

  // Done phases whose proof does not actually hold — never proven, or once
  // proven and now stale — are drift the learner should know about. A stale
  // proof no longer replaces the real next action (story 04.02): `next` names
  // where the learner actually goes, then lists what must be re-proven.
  const { broken: brokenDone, revisits } = analyzeDonePhases(dir, phases, now);
  const staleDone = brokenDone.filter((entry) => entry.verdict.state === "stale");
  const notice = revisitNotice(dir);
  const next = phases.find((phase) => phase && phase.status !== "done");

  const logBroken = (entries) => {
    for (const { phase, verdict } of entries) {
      if (verdict.state === "stale" && verdict.reason === "checkpoint-changed") {
        log(`⚠ Phase ${phase.id} — ${phase.name} est marquée done mais son checkpoint a changé depuis la preuve — re-prouve-la : \`ai-learn verify ${phase.id}\`.`);
      } else if (verdict.state === "stale") {
        log(`⚠ Phase ${phase.id} — ${phase.name} est marquée done mais sa preuve est périmée — re-prouve-la : \`ai-learn verify --stale\`.`);
      } else {
        log(`⚠ Phase ${phase.id} — ${phase.name} est marquée done mais n'a aucune preuve qui passe (non prouvée).`);
      }
    }
  };

  // Story 09.06 — a revisit under way outranks everything: the learner's files
  // are in a half-removed state until it ends.
  if (notice) {
    log(notice);
    log("");
  }

  const incident = incidentNotice(dir);

  if (incident) {
    log(`${incident}\n`);
  }

  const scaffold = scaffoldState(config);

  if (scaffold.outdated) {
    log("⚠ Projet en retard sur l'outil — lance `ai-learn update` avant de continuer.\n");
  } else if (scaffold.ahead) {
    log(`⚠ Ce projet vient d'une version plus récente de l'outil (${scaffold.toolVersion}) — mets l'outil à jour, rien n'est rétrogradé.\n`);
  }

  // No stale proof: keep the pre-04.02 output order byte-for-byte (warnings
  // first, then the next action) — this story only moves stale re-proofs.
  if (staleDone.length === 0) {
    logBroken(brokenDone);

    if (brokenDone.length > 0) {
      log("");
    }
  }

  if (next) {
    log(`Suivant : Phase ${next.id} — ${next.name}`);
    log(`  Statut : ${next.status}`);
    log(`  Checkpoint : ${next.checkpoint || "(aucun checkpoint défini)"}`);

    const predictionRequirement = normalizePredictionsRequired(next.predictionsRequired);

    if (predictionRequirement.total > 0) {
      const byType = predictionRequirement.byType
        ? ` (${Object.entries(predictionRequirement.byType).map(([type, count]) => `${type} ${count}`).join(", ")})`
        : "";

      log(`  Prédictions exigées : ${predictionRequirement.total}${byType}`);
      log("  Protocole : AGENTS.md § « prédire avant de révéler » — une prédiction par écrit, dans le chat,");
      log(`  AVANT chaque révélation, enregistrée en deux temps : \`ai-learn predict --phase ${next.id} --prediction "..."\`, puis \`--reveal\`.`);
    }

    if (Array.isArray(next.artifacts) && next.artifacts.length > 0) {
      log(`  Artefact : ${next.artifacts.join(", ")}`);
    }

    log("");
    log("Quand ça passe, prouve-le :");
    log(`  ai-learn verify ${next.id}`);
  } else if (staleDone.length === 0) {
    log(`Les ${phases.length}/${phases.length} phases sont terminées.`);
    log("Lance `ai-learn check` pour confirmer que tout le parcours est prouvé.");
  } else {
    // Every phase is marked done, but at least one proof does not hold — never
    // claim the track is finished. The actionable list follows below.
    log(`Les ${phases.length}/${phases.length} phases sont marquées done, mais ${brokenDone.length} preuve(s) ne tiennent pas.`);
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
      log(`    Lancez \`ai-learn revisit ${phase.id}\` : le code de la phase est retiré, vous le retapez de mémoire.`);
    }
  }

  const { violations: normViolations } = learnerNorm(dir);

  if (normViolations.length > 0) {
    log("");
    log(`Norme : ${normViolations.length} violation${normViolations.length > 1 ? "s" : ""} dans ton code — à expliquer, pas à corriger à ta place :`);
    normViolations.slice(0, MAX_NORM_LINES).forEach((v) => log(`  ${v}`));

    if (normViolations.length > MAX_NORM_LINES) {
      log(`  … et ${normViolations.length - MAX_NORM_LINES} autre(s) — \`ai-learn norm\` pour la liste complète.`);
    }
  }

  printCommitReminder(dir);
}

module.exports = { nextCommand, buildNextReport };
