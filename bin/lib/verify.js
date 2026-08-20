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

function verifyCommand({ dir, phaseId, noMark = false }) {
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
  const evidence = {
    generatedAt: new Date().toISOString(),
    project: config.project,
    technology: config.technology || null,
    phaseId: phase.id,
    phaseName: phase.name,
    checkpoint: phase.checkpoint,
    cwd: dir,
    environment: captureEnvironment(),
    ok: result.ok,
    results: [result],
  };

  const outputPath = writeEvidence(dir, evidence);

  if (result.ok) {
    log(`[ok] ${phase.checkpoint} (${result.durationMs}ms)`);

    if (!noMark) {
      setPhaseStatus(dir, phase.id, "done");
      log(`Phase ${phase.id} marked done.`);
    }
  } else {
    log(`[exit ${result.exitCode}${result.timedOut ? ", timeout" : ""}] ${phase.checkpoint} (${result.durationMs}ms)`);

    for (const line of (result.stderrTail || result.stdoutTail || "").split(/\r?\n/).slice(-3).filter(Boolean)) {
      log(`    ${line}`);
    }
  }

  log(`Evidence: ${outputPath}`);

  if (!result.ok) {
    process.exitCode = 1;
  }
}

module.exports = { verifyCommand, runCommand, writeEvidence, captureEnvironment };
