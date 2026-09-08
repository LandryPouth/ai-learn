"use strict";

// `ai-learn verify <id>` — the executed-proof step. Runs the phase's checkpoint
// command itself, captures the output verbatim, writes evidence JSON under
// .ai-learn/runs/, and only marks the phase done when the command really passed.
// This is the part that "the agent said it passed" cannot fake.

const fs = require("fs");
const path = require("path");
const { log, fail } = require("./util");
const { readProgress, runsDir, findPhase, setPhaseStatus } = require("./progress");
const { syncGitTrack } = require("./tracks/git");
const { syncDomainLedger } = require("./tracks/domain");
const { normProject, formatViolation } = require("./norm");
const { checkpointFilePath, computeSourceHash } = require("./source-hash");
const { predictionsReport, formatPredictionsGap } = require("./predictions");
const { mutationReport, formatMutationGap, emptyMutationReport, recoverOrphanLockAndLog } = require("./mutate");
const { runCommand } = require("./exec");

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

function verifyCommand({ dir, phaseId, noMark = false, home }) {
  const { config, exists } = readProgress(dir);

  if (!exists || !config) {
    fail(`No progress.json in ${dir}. Run \`ai-learn init\` first.`);
  }

  const phase = findPhase(config, phaseId);

  if (!phase) {
    fail(`No phase ${phaseId} in progress.json.`);
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

  const ok =
    result.ok &&
    (!stressResult || stressResult.ok) &&
    normReport.violations.length === 0 &&
    missingArtifacts.length === 0 &&
    predReport.missing === 0 &&
    mutReport.ok;

  const evidence = {
    generatedAt: new Date().toISOString(),
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
    // Whether this run touched the ledger. `check` uses it to tell a
    // deliberate `--no-mark` observation run apart from a real drift (a
    // passing evidence that never got marked done) — see story 01.02.
    marking: noMark ? "skipped" : "applied",
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
      corrupted: predReport.corrupted,
      anomalies: predReport.anomalies,
    },
    mutation: {
      ok: mutReport.ok,
      required: mutReport.required,
      mutants: mutReport.mutants,
      killed: mutReport.killed,
      survived: mutReport.survived,
      score: mutReport.score,
      truncated: mutReport.truncated,
    },
  };

  const outputPath = writeEvidence(dir, evidence);

  if (ok) {
    if (!noMark) {
      setPhaseStatus(dir, phase.id, "done");

      // Best-effort, secondary tracking feature — must never entangle with
      // or break verify's own load-bearing contract (mark done only on a
      // real pass), hence its own isolated try/catch.
      try {
        syncGitTrack({ dir, phase, verifyEvidence: evidence, home });
      } catch {
        // ledger sync failing is never a reason to fail verify itself
      }

      try {
        syncDomainLedger({ dir, verifyEvidence: evidence, home });
      } catch {
        // same isolated failure domain as the git ledger sync above
      }

      log(`Phase ${phase.id} marked done.`);

      // AGENTS.md §3bis forbids the AI from running git itself — only the
      // human learner types it. Without a nudge here, nothing prompts a
      // commit per phase, and everything piles up into one commit at the end
      // instead of the "one phase = one commit" habit the track is meant to
      // teach. `ai-learn` only ever suggests the command; it never runs it.
      log("");
      log("Clôture propre — committez cette phase avant de continuer :");
      log(`  git add -A && git commit -m "feat(phase-${phase.id}): ${phase.name}"`);
    }
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
}

module.exports = { verifyCommand, runCommand, writeEvidence, captureEnvironment };
