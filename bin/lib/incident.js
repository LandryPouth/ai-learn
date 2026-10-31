"use strict";

// `ai-learn break [--level 1|2] | --resolve | --giveup` — story 10.04. The tool
// breaks the learner's code without saying where; the learner predicts the
// site, repairs, and the checkpoints of the finished phases prove it. The site
// is the one fact only the tool knows: it lives in `~/.ai-learn/incidents/`,
// outside the project, and the guard closes that directory to the AI.
//
// Injection reuses the mutation engine (`mutate.js`): same site finder, same
// in-place edit, same recovery lock. The lock exists only while a candidate is
// in place; once a fault is kept, the original lives in the secret record.

const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { log, fail, readJson, writeJson, normalizePortable } = require("./util");
const { readProgress, missingProgressMessage } = require("./progress");
const { findAllSites, applyMutant, restoreOriginal, mutateLockPath, recoverOrphanLockAndLog } = require("./mutate");
const { loadGuardConfig, MODE_DIRIGEANT } = require("./guard");
const { gitState } = require("./scan");
const { runCommand } = require("./exec");
const { readPredictions } = require("./predictions");
const { projectKey, assertWritable } = require("./tracks/store");
const { recordDebugTiers } = require("./tracks/debug");

const MAX_ATTEMPTS = 20;
const EXACT_LINE_TOLERANCE = 2;
// A prediction counts as "before the repair" when it is not later than the
// repaired file's last write; the slack absorbs filesystem timestamp rounding.
const MTIME_SLACK_MS = 2000;
const OUTPUT_LINES = 15;

function statePath(dir) {
  return path.join(dir, ".ai-learn", "incident.json");
}

function giveupDir(dir) {
  return path.join(dir, ".ai-learn", "incident-giveup");
}

function projectId(dir) {
  return crypto.createHash("sha1").update(projectKey(dir)).digest("hex").slice(0, 16);
}

function incidentRecordPath(dir, { home = os.homedir() } = {}) {
  return path.join(home, ".ai-learn", "incidents", `${projectId(dir)}.json`);
}

function readIncident(dir) {
  return readJson(statePath(dir), null);
}

// Only the public facts of an incident (never the site) — the shape `next` and
// `status` put in their --json.
function incidentFact(dir) {
  const state = readIncident(dir);
  return state && state.active ? { active: true, level: state.level, startedAt: state.startedAt, failingPhases: state.failingPhases } : { active: false };
}

// Story 10.04 — an active incident outranks the next phase: the learner's code
// is broken on purpose until it is repaired or given up.
function incidentNotice(dir) {
  const incident = incidentFact(dir);

  if (!incident.active) {
    return null;
  }

  return (
    `⚠ Incident de code actif (niveau ${incident.level}) : une panne est cachée dans ton code — elle passe avant la phase suivante.\n` +
    "  Prédis le site (`ai-learn predict --type debug --file … --line …`), répare, puis `ai-learn break --resolve` (ou `--giveup`)."
  );
}

function checkpointPhases(dir) {
  const { config, exists } = readProgress(dir);

  if (!exists || !config) {
    fail(missingProgressMessage(dir));
  }

  return (Array.isArray(config.phases) ? config.phases : []).filter((p) => p && p.status === "done" && p.checkpoint);
}

// Runs every finished phase's checkpoint; `failing` carries the phases that are red.
function runCheckpoints(phases, dir, execute) {
  const results = phases.map((phase) => ({ phase, result: execute(phase.checkpoint, dir) }));
  return { results, failing: results.filter((r) => !r.result.ok) };
}

function outputOf(result) {
  return `${result.stdoutTail || ""}\n${result.stderrTail || ""}`.trim();
}

function tail(text) {
  return text.split(/\r?\n/).slice(-OUTPUT_LINES).join("\n");
}

function mentionsFile(output, rel) {
  const portable = normalizePortable(output);
  return portable.includes(normalizePortable(rel)) || portable.includes(path.basename(rel));
}

function assertPreconditions(dir, phases) {
  const state = readIncident(dir);

  if (state && state.active) {
    fail("Un incident actif est déjà en cours : répare-le (`ai-learn break --resolve`) ou abandonne-le (`ai-learn break --giveup`).");
  }

  if (phases.length === 0) {
    fail("Aucune phase terminée avec checkpoint : termine et prouve au moins une phase avant de provoquer un incident.");
  }

  if (loadGuardConfig(dir).mode === MODE_DIRIGEANT) {
    fail("Pas d'incident en mode dirigeant : l'IA y écrit l'implémentation, il n'y aurait rien à diagnostiquer. Repasse en apprenti (`ai-learn mode apprenti`).");
  }

  const git = gitState(dir);

  if (!git.isRepo || git.uncommitted > 0) {
    fail("arbre git non propre : commit (ou abandonne) tes changements avant l'incident, pour pouvoir toujours revenir en arrière.");
  }
}

// Applies one candidate, keeps the recovery lock while it is in place, and
// reports what the checkpoints say. Restores unless the caller keeps it.
function trial(site, phases, dir, execute) {
  const lockPath = mutateLockPath(dir);
  writeJson(lockPath, { file: site.file.rel, original: site.original });
  applyMutant(site);

  try {
    return { lockPath, ...runCheckpoints(phases, dir, execute) };
  } catch (error) {
    release(site, lockPath);
    throw error;
  }
}

function release(site, lockPath) {
  restoreOriginal(site);

  if (fs.existsSync(lockPath)) {
    fs.unlinkSync(lockPath);
  }
}

function pickSite(candidates, random) {
  return candidates.splice(Math.min(candidates.length - 1, Math.floor(random() * candidates.length)), 1)[0];
}

function breakCommand({ dir, level = 1, home = os.homedir(), random = Math.random, execute = runCommand }) {
  if (level !== 1 && level !== 2) {
    fail("--level doit valoir 1 ou 2.");
  }

  // Repair a previous interrupted run first: the tree must be judged after it.
  recoverOrphanLockAndLog(dir);

  const phases = checkpointPhases(dir);
  assertPreconditions(dir, phases);

  const baseline = runCheckpoints(phases, dir, execute);

  if (baseline.failing.length > 0) {
    fail(`Le checkpoint de la phase ${baseline.failing[0].phase.id} est déjà rouge : répare-le avant de provoquer un incident.`);
  }

  const candidates = findAllSites(dir);
  let attempts = 0;
  let kept = null;

  while (candidates.length > 0 && attempts < MAX_ATTEMPTS && !kept) {
    attempts += 1;
    const site = pickSite(candidates, random);
    const { lockPath, failing } = trial(site, phases, dir, execute);
    const output = failing.map((r) => outputOf(r.result)).join("\n");
    const detectable = failing.length > 0 && (level === 1 || !mentionsFile(output, site.file.rel));

    if (!detectable) {
      release(site, lockPath);
      continue;
    }

    kept = { site, lockPath, failing };
  }

  if (!kept) {
    fail("aucune panne détectable : tes tests ne couvrent pas assez le code pour qu'une panne y soit repérée. Renforce-les, puis relance.");
  }

  const { site, lockPath, failing } = kept;
  const startedAt = new Date().toISOString();
  const id = crypto.randomUUID();
  const record = { id, dir: projectKey(dir), startedAt, level, file: site.file.rel, line: site.line, operator: site.operator, original: site.original };
  const recordPath = incidentRecordPath(dir, { home });

  assertWritable(recordPath);
  writeJson(recordPath, record);
  writeJson(statePath(dir), { active: true, level, startedAt, failingPhases: failing.map((r) => r.phase.id) });
  fs.unlinkSync(lockPath);

  log(`Incident de niveau ${level} : une panne est cachée dans ton code. Tu ne sais pas où — c'est le but.`);
  log("");
  log(`Symptôme (checkpoint de la phase ${failing[0].phase.id} — ${failing[0].phase.name}) :`);
  log(tail(outputOf(failing[0].result)) || "(le checkpoint échoue sans afficher de sortie)");
  log("");
  log("Avant d'ouvrir un fichier, écris où tu penses que se trouve la cause et pourquoi :");
  log(`  ai-learn predict --phase ${failing[0].phase.id} --type debug --file <fichier> --line <n> --prediction "<mécanisme>"`);
  log("Puis cherche, répare, et lance `ai-learn break --resolve`. Bloqué ? `ai-learn break --giveup`.");
}

function readRecord(dir, home) {
  const record = readJson(incidentRecordPath(dir, { home }), null);

  if (!record || typeof record.file !== "string" || typeof record.original !== "string") {
    fail("Le secret de l'incident est introuvable (~/.ai-learn/incidents/) : abandonne-le avec `ai-learn break --giveup`.");
  }

  return record;
}

function requireActive(dir) {
  const state = readIncident(dir);

  if (!state || !state.active) {
    fail("Aucun incident actif. Provoque-en un avec `ai-learn break`.");
  }

  return state;
}

function closeIncident(dir, home, state, outcome, extra = {}) {
  writeJson(statePath(dir), { ...state, active: false, outcome, closedAt: new Date().toISOString(), ...extra });
  fs.rmSync(incidentRecordPath(dir, { home }), { force: true });
}

// The learner's last `debug` prediction made during this incident.
function lastDebugPrediction(dir, startedAt) {
  const { data } = readPredictions(dir);
  const entries = data && Array.isArray(data.entries) ? data.entries : [];
  const mine = entries.filter((e) => e.type === "debug" && typeof e.file === "string" && e.at >= startedAt);
  return mine.length > 0 ? mine[mine.length - 1] : null;
}

function comparePrediction(prediction, record) {
  if (!prediction) {
    return "aucune";
  }

  const clean = (file) => path.posix.normalize(normalizePortable(file)).replace(/^\.\//, "");

  if (clean(prediction.file) !== clean(record.file)) {
    return "manqué";
  }

  return Math.abs(prediction.line - record.line) <= EXACT_LINE_TOLERANCE ? "exact" : "fichier";
}

// "Before the repair": the prediction must not postdate the repaired file.
// A repair may land in another file than the site, so the latest edit across the
// implementation files is what counts. Touching the site afterwards still
// passes: a documented limit, like `git diff`.
function predictedBeforeRepair(prediction, record, dir) {
  const files = new Set([record.file, ...findAllSites(dir).map((s) => s.file.rel)]);
  let latest = 0;

  for (const rel of files) {
    try {
      latest = Math.max(latest, fs.statSync(path.join(dir, rel)).mtimeMs);
    } catch {
      // a vanished file contributes nothing
    }
  }

  return Date.parse(prediction.at) <= latest + MTIME_SLACK_MS;
}

function resolveCommand({ dir, home = os.homedir(), execute = runCommand }) {
  recoverOrphanLockAndLog(dir);
  const state = requireActive(dir);
  const record = readRecord(dir, home);
  const { failing } = runCheckpoints(checkpointPhases(dir), dir, execute);

  if (failing.length > 0) {
    log("Toujours rouge — l'incident reste actif :");
    log(tail(outputOf(failing[0].result)));
    process.exitCode = 1;
    return;
  }

  const prediction = lastDebugPrediction(dir, record.startedAt);
  const verdict = comparePrediction(prediction, record);
  const tiers = [1];

  if (record.level === 2) {
    tiers.push(2);
  }

  if (verdict === "exact" && predictedBeforeRepair(prediction, record, dir)) {
    tiers.push(3);
  }

  recordDebugTiers({ home, dir: projectKey(dir), incidentId: record.id, tiers, detail: `${record.file}:${record.line}` });
  closeIncident(dir, home, state, "resolu", { prediction: verdict });

  log("Incident résolu : tous les checkpoints repassent au vert.");
  log(`Le site était ${record.file}:${record.line} (${record.operator}).`);
  log(`Ta prédiction : ${verdict}.`);
  log(`Paliers atteints : ${tiers.join(", ")} (~/.ai-learn/tracks/debug.json).`);
}

function giveupCommand({ dir, home = os.homedir() }) {
  recoverOrphanLockAndLog(dir);
  const state = requireActive(dir);
  const record = readRecord(dir, home);
  const target = path.join(dir, record.file);

  if (fs.existsSync(target)) {
    let saved = path.join(giveupDir(dir), record.file);
    fs.mkdirSync(path.dirname(saved), { recursive: true });

    // Never overwrite an earlier backup: it may be the only copy of the
    // learner's version (a killed run followed by a second --giveup).
    if (fs.existsSync(saved)) {
      saved = `${saved}.${Date.now()}`;
    }

    fs.copyFileSync(target, saved);
  }

  fs.mkdirSync(path.dirname(target), { recursive: true });
  const partial = `${target}.ai-learn-tmp`;
  fs.writeFileSync(partial, record.original);
  fs.renameSync(partial, target);
  closeIncident(dir, home, state, "abandon");

  log("Incident abandonné : ton code est revenu à son état d'avant la panne.");
  log(`Le site était ${record.file}:${record.line} (${record.operator}).`);
  log(`Ta version du fichier est gardée dans ${normalizePortable(path.join(".ai-learn", "incident-giveup", record.file))}.`);
}

module.exports = { incidentFact, incidentNotice, breakCommand, resolveCommand, giveupCommand, readIncident, incidentRecordPath, statePath };
