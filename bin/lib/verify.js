"use strict";

// `ai-learn verify <id>` — the executed-proof step. Runs the phase's checkpoint
// command itself, captures the output verbatim, writes evidence JSON under
// .ai-learn/runs/, and only marks the phase done when the command really passed.
// This is the part that "the agent said it passed" cannot fake.

const fs = require("fs");
const path = require("path");
const { log, fail, UsageError, explainCommitCommand } = require("./util");
const { readProgress, runsDir, findPhase, setPhaseStatus, latestEvidenceForPhase, phaseVerdict } = require("./progress");
const { syncEvidence, formatSyncFailure } = require("./ledgers");
const { normProject, formatViolation } = require("./norm");
const { checkpointFilePath, computeSourceHash, computeLearnerHash, computeCheckpointHash } = require("./source-hash");
const { predictionsReport, formatPredictionsGap } = require("./predictions");
const { readTutorConfig, masteryLevel } = require("./tutor");
const { mutationReport, formatMutationGap, emptyMutationReport, recoverOrphanLockAndLog } = require("./mutate");
const { runCommand, portabilityHint, zeroTestsRan } = require("./exec");

function captureEnvironment() {
  return { node: process.version, platform: process.platform, arch: process.arch };
}

function logResult(command, result) {
  if (result.ok) {
    log(`[ok] ${command} (${result.durationMs}ms)`);
    return;
  }

  log(`[exit ${result.exitCode}${result.timedOut ? ", timeout" : ""}] ${command} (${result.durationMs}ms)`);

  for (const line of (result.stderrTail || result.stdoutTail || "").split(/\r?\n/).slice(-3).filter(Boolean)) {
    log(`    ${line}`);
  }

  const hint = portabilityHint(result);

  if (hint) {
    log(`    ${hint}`);
  }
}

function writeEvidence(dir, evidence) {
  const runs = runsDir(dir);
  fs.mkdirSync(runs, { recursive: true });

  const base = new Date().toISOString().replace(/[:.]/g, "-");
  let outputPath = path.join(runs, `${base}-phase-${evidence.phaseId}-verify.json`);
  let counter = 1;

  while (fs.existsSync(outputPath)) {
    outputPath = path.join(runs, `${base}-phase-${evidence.phaseId}-${counter}-verify.json`);
    counter += 1;
  }

  fs.writeFileSync(outputPath, `${JSON.stringify(evidence, null, 2)}\n`);
  return outputPath;
}

// The done phases whose latest passing evidence no longer matches the current
// source — exactly the verdict `next`, `status` and `check` warn about (see
// `phaseVerdict`). Read-only and local to verify: `--stale` re-proves what
// those commands already flag, never a second definition of "périmé".
function findStalePhases(dir, config) {
  const phases = Array.isArray(config.phases) ? config.phases : [];
  const stale = [];

  for (const phase of phases) {
    if (!phase || phase.status !== "done") {
      continue;
    }

    const evidence = latestEvidenceForPhase(dir, phase.id);

    // No passing evidence at all is `unproven`, not `stale` — re-proving it
    // would not be a "the proof no longer covers the code" case.
    if (!evidence || !evidence.sourceHash) {
      continue;
    }

    const checkpointFile = checkpointFilePath(dir, phase.checkpoint);
    const currentHash = computeSourceHash(dir, { checkpointFile });
    const verdict = phaseVerdict({ phase, evidence, currentHash, checkpointFileExists: Boolean(checkpointFile) });

    if (verdict.state === "stale") {
      stale.push(phase);
    }
  }

  return stale;
}

// The real reason a re-proof failed, for the bulk summary: the failing
// checkpoint's own last output when there is one, otherwise the non-command
// gate that blocked it (norm, artifacts, predictions, mutation) — never a
// generic "échec" that leaves the learner hunting.
function failureDetail(outcome) {
  if (outcome.error) {
    return outcome.error;
  }

  const failed = (outcome.results || []).find((result) => !result.ok);

  if (failed) {
    const tail = (failed.stderrTail || failed.stdoutTail || "")
      .split(/\r?\n/)
      .filter(Boolean)
      .slice(-1)[0];
    const status = failed.timedOut ? "timeout" : `exit ${failed.exitCode}`;
    return tail ? `${status} — ${tail}` : status;
  }

  const evidence = outcome.evidence || {};

  if (evidence.zeroTests) {
    return "aucun test exécuté";
  }

  if (Array.isArray(evidence.missingArtifacts) && evidence.missingArtifacts.length > 0) {
    return `artefacts manquants : ${evidence.missingArtifacts.join(", ")}`;
  }

  if (evidence.norm && evidence.norm.ok === false) {
    return `norme : ${evidence.norm.violations.length} violation(s)`;
  }

  if (evidence.predictions && evidence.predictions.missing > 0) {
    return `prédictions manquantes : ${evidence.predictions.missing}`;
  }

  if (evidence.proof && evidence.proof.configInvalid) {
    return "profil de tuteur invalide (.ai-learn/tutor.json)";
  }

  if (evidence.proof && evidence.proof.tests && evidence.proof.mastery === null) {
    return "preuve de maîtrise manquante";
  }

  if (evidence.mutation && evidence.mutation.ok === false) {
    return `mutation : ${(evidence.mutation.survived || []).length} mutant(s) survivant(s)`;
  }

  return "échec sans détail";
}

// `ai-learn verify --stale` — re-prove every done phase whose proof is stale,
// one phase at a time through the normal `verifyCommand` path, then separate
// "toujours vert" (the proof no longer covered the code, but the checkpoint
// still passes) from "régression" (the checkpoint itself now fails). The
// normal path stays the only writer of a phase's status: this command never
// calls `setPhaseStatus` itself.
function staleCommand({ dir, home }) {
  const { config, exists } = readProgress(dir);

  if (!exists || !config) {
    fail(`No progress.json in ${dir}. Run \`ai-learn init\` first.`);
  }

  const stale = findStalePhases(dir, config);

  if (stale.length === 0) {
    log("Aucune phase périmée — rien à re-prouver.");
    return;
  }

  log(`Re-prouvant ${stale.length} phase(s) périmée(s), via le chemin verify normal.\n`);

  const green = [];
  const regressions = [];

  for (const phase of stale) {
    let outcome;

    try {
      outcome = verifyCommand({ dir, phaseId: phase.id, home });
    } catch (error) {
      // A usage error on one phase (e.g. its checkpoint was removed) must not
      // abort the bulk run and lose the summary: it is a failed re-proof.
      if (!(error instanceof UsageError)) {
        throw error;
      }

      log(error.message);
      outcome = { ok: false, phaseId: phase.id, phaseName: phase.name, error: error.message };
    }

    if (outcome.ok) {
      green.push(outcome);
    } else {
      regressions.push(outcome);
    }

    log("");
  }

  log("Résumé — re-preuve en bloc :");

  if (green.length > 0) {
    log(`  toujours vert : ${green.length} phase(s) — preuve rafraîchie`);
    for (const outcome of green) {
      log(`    ✓ Phase ${outcome.phaseId} — ${outcome.phaseName}`);
    }
  }

  if (regressions.length > 0) {
    log(`  régression : ${regressions.length} phase(s) — le checkpoint échoue maintenant`);
    for (const outcome of regressions) {
      log(`    ✗ Phase ${outcome.phaseId} — ${outcome.phaseName} — ${failureDetail(outcome)}`);
    }
  } else {
    log("  aucune régression.");
  }

  process.exitCode = regressions.length > 0 ? 1 : 0;
}

function verifyCommand({ dir, phaseId, noMark = false, revisit = false, home }) {
  const { config, exists } = readProgress(dir);

  if (!exists || !config) {
    fail(`No progress.json in ${dir}. Run \`ai-learn init\` first.`);
  }

  const phase = findPhase(config, phaseId);

  if (!phase) {
    fail(`No phase ${phaseId} in progress.json.`);
  }

  // A revisit redoes a phase the learner already proved, from memory (story
  // 07.02). There is nothing to revisit on a phase that never reached `done`:
  // refuse before running anything or writing evidence, so the ledger stays
  // untouched.
  if (revisit && phase.status !== "done") {
    fail(
      `Revisit is only for a proven phase: phase ${phase.id} is "${phase.status}". ` +
        `Prove it first with \`ai-learn verify ${phase.id}\`.`,
    );
  }

  if (!phase.checkpoint) {
    fail(`Phase ${phase.id} ("${phase.name}") has no checkpoint command. Add "checkpoint" to progress.json.`);
  }

  // `verifyCommand` itself now mutates and restores files one mutant at a
  // time (via `mutationReport`, story 02.03) — the exact same window
  // `ai-learn mutate` guards with `.ai-learn/mutate.lock.json`. Recovering
  // here, before the base checkpoint even runs, means an interrupted prior
  // `verify` (Ctrl+C, kill, crash mid-mutation) never leaves the learner's
  // source silently mutated for this run to check against — same self-heal
  // `mutateCommand` already does at its own start, same shared helper
  // (review finding, story 02.03).
  recoverOrphanLockAndLog(dir);

  log(`Verifying phase ${phase.id} — ${phase.name}`);
  log(`Command: ${phase.checkpoint}\n`);

  const result = runCommand(phase.checkpoint, dir);
  const results = [result];
  logResult(phase.checkpoint, result);

  // A stress-tagged phase (see docs/plans/git-gh-renforcement-domaine.md —
  // Partie B, bin/lib/stacks/*.js's
  // `stresses` bank) requires BOTH the base checkpoint and the stress
  // checkpoint to pass before the phase counts as done — the "casse réelle"
  // fix must actually hold, not just the happy path. The moment the stress
  // legitimately fails (before the learner writes the fix) is part of the
  // interactive session, not something `verify` replays; `verify` only ever
  // sees — and requires — the final, both-green state.
  let stressResult = null;

  if (phase.stressCheckpoint) {
    log(`\nStress: ${phase.stressCheckpoint}\n`);
    stressResult = runCommand(phase.stressCheckpoint, dir);
    results.push(stressResult);
    logResult(phase.stressCheckpoint, stressResult);
  }

  // Story 09.02 — a checkpoint that exits 0 without running one test proves
  // nothing. Applies to every command (stress included); never inferred for a
  // runner the patterns do not know.
  const zeroTests = results.some(zeroTestsRan);

  if (zeroTests) {
    log("\nAucun test exécuté — le checkpoint ne prouve rien.");
  }

  // The clean-code norm (ai-learn norm — file/function length, nesting,
  // param count) is checked on every verify, whether or not this phase
  // touches gitTier/stressCheckpoint: it's a standing property of the
  // learner's files, not something tied to one phase. Computed
  // unconditionally, same as stressResult above, regardless of --no-mark.
  const normReport = normProject(dir);

  if (normReport.violations.length > 0) {
    log("\nNorme (clean code) :");
    for (const violation of normReport.violations) {
      log(`  ✗ ${formatViolation(violation)}`);
    }
  }

  // A checkpoint can pass while the phase's declared artifact (the doc it was
  // supposed to produce) was never written — `check` already catches this
  // after the fact, on a phase already marked done; verify should refuse to
  // mark done in the first place instead of leaving that gap for `check` to
  // discover later.
  const missingArtifacts = (phase.artifacts || []).filter((artifact) => !fs.existsSync(path.join(dir, artifact)));

  if (missingArtifacts.length > 0) {
    log("\nArtefacts manquants :");
    for (const artifact of missingArtifacts) {
      log(`  ✗ ${artifact}`);
    }
  }

  // Predictions (story 01.04) — same hard-block philosophy as the norm and
  // artifacts checks above, computed unconditionally regardless of --no-mark.
  // `predictionsReport` itself encodes retro-compat: `missing` stays 0 for a
  // project with no predictions.json at all, so this never blocks a legacy
  // project (plan.md Decisions).
  const predReport = predictionsReport({ dir, phase });

  if (predReport.missing > 0) {
    log("\nPrédictions :");
    log(
      `  ✗ ${formatPredictionsGap(phase, predReport)}` +
        (predReport.corrupted ? " (.ai-learn/predictions.json est corrompu)" : ""),
    );
    log(`    prédire avant de révéler fait l'apprentissage : \`ai-learn predict --phase ${phase.id} --prediction "..."\``);
  }

  if (predReport.anomalies.length > 0) {
    log("\nAntériorité prédiction/révélation :");
    for (const anomaly of predReport.anomalies) {
      log(`  ⚠ prédiction ${anomaly.id} enregistrée après sa révélation (at ${anomaly.at} > revealedAt ${anomaly.revealedAt})`);
    }
  }

  // The tutor profile (story 05.05): `proof: "transfert"` unlocks a phase only
  // with a real `transfert` prediction. `tests`/`explication` keep the current
  // behaviour — no new block. A present-but-invalid file is a configuration
  // error, not a silent fallback to defaults.
  const tutor = readTutorConfig(dir);
  const tutorProof = tutor.config.proof;
  const transfertCount = predReport.countByType.transfert || 0;
  const tutorInvalid = tutor.exists && !tutor.valid;
  const transfertMissing = tutorProof === "transfert" && transfertCount === 0;

  if (tutorInvalid) {
    log("\nProfil de tuteur :");
    for (const issue of tutor.issues) {
      log(`  ✗ .ai-learn/tutor.json — ${issue}`);
    }
  }

  if (transfertMissing) {
    log("\nPreuve de transfert :");
    log(
      `  ✗ aucune prédiction de type transfert pour la phase ${phase.id} (0/1) —` +
        ` enregistrer avec \`ai-learn predict --phase ${phase.id} --type transfert --prediction "..."\``,
    );
  }

  // Mutation testing (story 02.03) — only for a phase that explicitly opts
  // in (`phase.mutation === true`, checked inside mutationReport itself,
  // strictly, so a non-boolean value never turns it on by accident). Only
  // computed when the base checkpoint already passed: mutating code whose
  // test is already red proves nothing (02-01), and running the full mutant
  // loop for a red checkpoint would cost real time for zero information —
  // this guard is explicit here, not hidden inside mutationReport (plan.md
  // Decisions).
  const mutReport = result.ok ? mutationReport({ dir, phase }) : emptyMutationReport(phase.mutation === true);

  if (!mutReport.ok) {
    log("\nMutation :");
    log(`  ✗ ${formatMutationGap(phase, mutReport)}`);
    for (const site of mutReport.survived) {
      log(`    ${site.file}:${site.line} — ${site.operator} — SURVÉCU`);
    }
    log(`    rejouer l'investigation : \`ai-learn mutate --phase ${phase.id}\``);
  }

  if (mutReport.truncated) {
    log(`\n⚠ Mutation : plafond de mutants atteint (${mutReport.mutants} testé(s)) — score partiel, pas un blocage.`);
  }

  // The empreinte of what this run's proof covers — the learner's own files
  // plus the checkpoint file itself. Written unconditionally, same as
  // normReport/missingArtifacts above: only evidence with `ok: true` is ever
  // consulted by `phaseVerdict`, but a failing run still gets one for
  // consistency and debugging.
  const sourceHash = computeSourceHash(dir, { checkpointFile: checkpointFilePath(dir, phase.checkpoint) });

  const learnerHash = computeLearnerHash(dir);
  const checkpointHash = computeCheckpointHash(dir, phase.checkpoint);

  const ok =
    result.ok &&
    !zeroTests &&
    (!stressResult || stressResult.ok) &&
    normReport.violations.length === 0 &&
    missingArtifacts.length === 0 &&
    predReport.missing === 0 &&
    mutReport.ok &&
    !tutorInvalid &&
    !transfertMissing;

  const generatedAt = new Date().toISOString();

  const evidence = {
    generatedAt,
    // The date a proof covers (story 07.01), stamped here from the evidence
    // itself rather than declared by the learner. Only a passing run carries
    // it: a failed run is not a proof, and must never refresh a revisit due
    // date (story 07.02's failed revisit relies on this).
    lastProvenAt: ok ? generatedAt : null,
    // Whether this run was a spaced-repetition revisit (story 07.02). A
    // revisit replays the checkpoint without touching the ledger's status:
    // success refreshes `lastProvenAt`, failure stays visible without
    // demoting a phase that was already proven.
    revisit,
    project: config.project,
    technology: config.technology || null,
    phaseId: phase.id,
    phaseName: phase.name,
    checkpoint: phase.checkpoint,
    stressCheckpoint: phase.stressCheckpoint || null,
    cwd: dir,
    environment: captureEnvironment(),
    ok,
    results,
    missingArtifacts,
    sourceHash,
    // Story 09.02 — the same empreinte split in two, so `check` can tell a
    // green obtained by fixing the code from one obtained by editing the test.
    learnerHash,
    checkpointHash,
    zeroTests,
    // Whether this run touched the ledger. `check` uses it to tell a
    // deliberate `--no-mark` observation run apart from a real drift (a
    // passing evidence that never got marked done) — see story 01.02. A
    // revisit never writes the ledger either (story 07.02).
    marking: noMark || revisit ? "skipped" : "applied",
    norm: {
      ok: normReport.violations.length === 0,
      violations: normReport.violations,
      scannedFiles: normReport.scanned,
      skipped: normReport.skippedFunctionParse,
    },
    predictions: {
      ok: predReport.missing === 0,
      required: predReport.required,
      count: predReport.count,
      missing: predReport.missing,
      requiredByType: predReport.requiredByType,
      countByType: predReport.countByType,
      missingByType: predReport.missingByType,
      corrupted: predReport.corrupted,
      anomalies: predReport.anomalies,
    },
    // Two distinct proofs, never merged (story 05.05): `tests` is the executed
    // checkpoint, `mastery` is the configured level actually reached. A green
    // suite with a missing transfert prediction keeps `tests: true` and
    // `mastery: null` — exactly the gap this story makes visible.
    proof: {
      tests: result.ok,
      mastery: ok ? masteryLevel(tutorProof, { checkpointOk: result.ok, transfertCount }) : null,
      configInvalid: tutorInvalid,
    },
    mutation: {
      ok: mutReport.ok,
      required: mutReport.required,
      mutants: mutReport.mutants,
      killed: mutReport.killed,
      survived: mutReport.survived,
      killedOperators: mutReport.killedOperators,
      score: mutReport.score,
      truncated: mutReport.truncated,
    },
  };

  const outputPath = writeEvidence(dir, evidence);

  if (ok) {
    if (revisit) {
      // The phase is already `done`; this run only records fresh proof of
      // retention. No status write, no track sync, no commit nudge — the
      // learner is not closing a phase, they are remembering one.
      log(`Revisite prouvée — lastProvenAt rafraîchi, phase ${phase.id} reste done.`);
    } else if (!noMark) {
      setPhaseStatus(dir, phase.id, "done");

      // Best-effort, secondary tracking: a ledger sync failing is never a
      // reason to fail verify (the phase proof is the contract), but it is
      // no longer silent either — story 09.01 found real progress missing
      // from every ledger because these failures were swallowed.
      for (const failure of syncEvidence({ dir, phase, evidence, home })) {
        log(formatSyncFailure(failure));
      }

      log(`Phase ${phase.id} marked done.`);

      // AGENTS.md §3bis forbids the AI from running git itself — only the
      // human learner types it. Without a nudge here, nothing prompts a
      // commit per phase, and everything piles up into one commit at the end
      // instead of the "one phase = one commit" habit the track is meant to
      // teach. `ai-learn` only ever suggests the command; it never runs it.
      log("");
      log("Clôture propre — committez cette phase avant de continuer :");

      for (const line of explainCommitCommand(`git add -A && git commit -m "feat(phase-${phase.id}): ${phase.name}"`)) {
        log(line);
      }
    }
  } else if (revisit) {
    // A revisit that fails is information, not a regression: the learner has
    // forgotten part of a phase they once proved. The ledger keeps saying
    // `done` (the work really happened); the failed evidence makes the gap
    // visible, and the decision to re-work the phase belongs to the learner.
    log("");
    log(`Revisite échouée — phase ${phase.id} reste done (une revisite ne rétrograde pas).`);
    log(`L'oubli est tracé dans l'évidence. Re-travaillez la phase, puis relancez \`ai-learn verify ${phase.id} --revisit\`.`);
  } else if (!noMark && phase.status === "done") {
    // Symmetric to the promotion above: verify is the only writer of a
    // phase's status in both directions. A done phase whose checkpoint no
    // longer passes did not just become unproven — it regressed, and
    // `in_progress` says so without erasing that the work happened
    // (never `pending`, see plan.md Decisions).
    setPhaseStatus(dir, phase.id, "in_progress");
    log("");
    log(`Phase ${phase.id} demoted: done → in_progress — the checkpoint or its checks no longer pass.`);
    log(`Fix it, then re-run \`ai-learn verify ${phase.id}\` to prove it again.`);
  }

  log(`Evidence: ${outputPath}`);

  if (!ok) {
    process.exitCode = 1;
  }

  return { ok, phaseId: phase.id, phaseName: phase.name, results, evidence, outputPath };
}

module.exports = { verifyCommand, staleCommand, findStalePhases, runCommand, writeEvidence, captureEnvironment };
