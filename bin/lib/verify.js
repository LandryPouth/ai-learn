"use strict";

// `ai-learn verify <id>` — the executed-proof step. Runs the phase's checkpoint
// command itself, captures the output verbatim, writes evidence JSON under
// .ai-learn/runs/, and only marks the phase done when the command really passed.
// This is the part that "the agent said it passed" cannot fake.

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const { log, fail } = require("./util");
const { readProgress, runsDir, findPhase, setPhaseStatus } = require("./progress");
const { syncGitTrack } = require("./tracks/git");
const { syncDomainLedger } = require("./tracks/domain");
const { normProject, formatViolation } = require("./norm");
const { checkpointFilePath, computeSourceHash } = require("./source-hash");

function captureEnvironment() {
  return { node: process.version, platform: process.platform, arch: process.arch };
}

function runCommand(command, cwd, { timeoutMs = 120000 } = {}) {
  const started = Date.now();
  const result = spawnSync(command, [], {
    cwd,
    shell: true,
    encoding: "utf8",
    timeout: timeoutMs,
    maxBuffer: 256 * 1024 * 1024,
  });

  const timedOut = Boolean(result.error && result.error.code === "ETIMEDOUT");
  const exitCode = result.status != null ? result.status : timedOut ? 124 : result.error ? 127 : 1;

  return {
    command,
    exitCode,
    ok: exitCode === 0,
    timedOut,
    durationMs: Date.now() - started,
    stdoutTail: (result.stdout || "").slice(-4000),
    stderrTail: (result.stderr || "").slice(-4000),
  };
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

  log(`Verifying phase ${phase.id} — ${phase.name}`);
  log(`Command: ${phase.checkpoint}\n`);

  const result = runCommand(phase.checkpoint, dir);
  const results = [result];
  logResult(phase.checkpoint, result);

  // A stress-tagged phase (see docs/plans — Partie B, bin/lib/stacks/*.js's
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

  // The empreinte of what this run's proof covers — the learner's own files
  // plus the checkpoint file itself. Written unconditionally, same as
  // normReport/missingArtifacts above: only evidence with `ok: true` is ever
  // consulted by `phaseVerdict`, but a failing run still gets one for
  // consistency and debugging.
  const sourceHash = computeSourceHash(dir, { checkpointFile: checkpointFilePath(dir, phase.checkpoint) });

  const ok =
    result.ok && (!stressResult || stressResult.ok) && normReport.violations.length === 0 && missingArtifacts.length === 0;

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
    norm: {
      ok: normReport.violations.length === 0,
      violations: normReport.violations,
      scannedFiles: normReport.scanned,
      skipped: normReport.skippedFunctionParse,
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
  }

  log(`Evidence: ${outputPath}`);

  if (!ok) {
    process.exitCode = 1;
  }
}

module.exports = { verifyCommand, runCommand, writeEvidence, captureEnvironment };
