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
const { recordDebugTiers, readOrDefaultDebugTracks } = require("./tracks/debug");
const { readOrDefaultPlatformTracks } = require("./tracks/platform");
const { latestEvidenceForPhase } = require("./progress");
const { readTutorConfig, incidentChance } = require("./tutor");
const envFaults = require("./incidents/env");

const RESTORED_OUTCOMES = ["gone", "stopped", "restarted", "restored"];
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
    (incident.level === 3
      ? "  La panne est dans l'environnement : prédis sa cause (`ai-learn predict --type debug --cause \"variable | port | service\" --prediction …`), diagnostique, puis `ai-learn break --resolve` (ou `--giveup`)."
      : "  Prédis le site (`ai-learn predict --type debug --file … --line …`), répare, puis `ai-learn break --resolve` (ou `--giveup`).")
  );
}

// Story 10.05 — the level an automatic incident gets: 1 by default, 2 once the
// learner has resolved a first one, 3 (environment) once they also showed
// platform skills in containers (tier 4) or observability (tier 6).
function chooseLevel({ home = os.homedir() } = {}) {
  const debug = readOrDefaultDebugTracks({ home }).tiers;
  const platform = readOrDefaultPlatformTracks({ home }).tiers;
  const platformReady = Boolean((platform["4"] || {}).achieved || (platform["6"] || {}).achieved);

  if ((debug["2"] || {}).achieved && platformReady) {
    return 3;
  }

  return (debug["1"] || {}).achieved ? 2 : 1;
}

function offerPath(dir, { home = os.homedir() } = {}) {
  return path.join(home, ".ai-learn", "incidents", `${projectId(dir)}.offer.json`);
}

// The instant of the latest passing verify across the finished phases.
function lastProofAt(dir, phases) {
  const stamps = phases
    .filter((p) => p && p.status === "done")
    .map((p) => latestEvidenceForPhase(dir, p.id))
    .filter((ev) => ev && typeof ev.generatedAt === "string")
    .map((ev) => ev.generatedAt)
    .sort();

  return stamps.length > 0 ? stamps[stamps.length - 1] : null;
}

// Whether `next` should hand the learner an incident now. The moment is safe
// only right after a proof, on a clean tree, with nothing already broken; the
// dice are rolled once per proof (recorded outside the project), so asking
// again never improves the odds. `random` is injectable, `Math.random` in use.
function incidentDue(dir, { home = os.homedir(), random = Math.random } = {}) {
  const chance = incidentChance(readTutorConfig(dir).config);
  const { config } = readProgress(dir);
  const phases = config && Array.isArray(config.phases) ? config.phases : [];
  const state = readIncident(dir);
  const git = gitState(dir);
  const proofAt = lastProofAt(dir, phases);
  const hasCheckpoint = phases.some((p) => p && p.status === "done" && p.checkpoint);

  if (chance <= 0 || !proofAt || !hasCheckpoint || (state && state.active) || loadGuardConfig(dir).mode === MODE_DIRIGEANT || !git.isRepo || git.uncommitted > 0) {
    return false;
  }

  const marker = readJson(offerPath(dir, { home }), null);

  if (marker && marker.proofAt === proofAt) {
    return false;
  }

  const due = random() < chance;
  writeJson(offerPath(dir, { home }), { proofAt, rolledAt: new Date().toISOString(), due });
  return due;
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

// The recovery lock of a port/service fault: written the instant the fault
// exists (before the first checkpoint run), so a crash right after never
// leaves a stray listener or a stopped service without a trail.
function faultLockPath(dir) {
  return path.join(dir, ".ai-learn", "env-fault.lock.json");
}

function writeFaultLock(dir, record) {
  const lock = faultLockPath(dir);
  writeJson(lock, record);
  fs.chmodSync(lock, 0o600);
}

// Undoes a fault left by a run that died before recording its incident. A
// lock next to an active incident is stale: the incident owns the fault.
function recoverFaultLock(dir, shell) {
  const lock = faultLockPath(dir);
  const record = readJson(lock, null);

  if (!record) {
    return;
  }

  const state = readIncident(dir);

  if (!(state && state.active)) {
    const outcome = envFaults.restoreFault(record, dir, { shell });

    if (!RESTORED_OUTCOMES.includes(outcome)) {
      fail(`Une panne d'environnement laissée par un run interrompu n'a pas pu être annulée (${describeFault(record)}) : rétablis-la à la main, puis relance.`);
    }

    log(`Panne d'environnement d'un run interrompu annulée : ${describeFault(record)}.`);
  }

  fs.rmSync(lock, { force: true });
}

function recoverOrphans(dir, shell) {
  recoverOrphanLockAndLog(dir);
  recoverFaultLock(dir, shell);
}

// Picks and injects an environment fault that a finished phase's checkpoint
// detects; every attempt that goes unnoticed is undone on the spot. The lock
// (same shape as the code engine's) lets an interrupted run restore `.env`.
function keepEnvFault({ dir, phases, random, execute, shell }) {
  const types = envFaults.applicableFaults(dir, { shell });

  while (types.length > 0) {
    const type = types.splice(Math.min(types.length - 1, Math.floor(random() * types.length)), 1)[0];
    const lockPath = mutateLockPath(dir);

    if (type === "env") {
      writeJson(lockPath, { file: ".env", original: fs.readFileSync(path.join(dir, ".env"), "latin1"), encoding: "latin1" });
      fs.chmodSync(lockPath, 0o600);
    }

    const fault = envFaults.injectFault(type, dir, { random, shell, onRecord: (partial) => writeFaultLock(dir, partial) });

    if (!fault) {
      fs.rmSync(lockPath, { force: true });
      fs.rmSync(faultLockPath(dir), { force: true });
      continue;
    }

    const record = { kind: type, ...fault };
    let failing;

    // A throw here must not leave the fault in place (a stray listener, a
    // stopped service): undo it, then let the error through.
    try {
      ({ failing } = runCheckpoints(phases, dir, execute));
    } catch (error) {
      envFaults.restoreFault(record, dir, { shell });
      fs.rmSync(lockPath, { force: true });
      fs.rmSync(faultLockPath(dir), { force: true });
      throw error;
    }

    if (failing.length > 0) {
      return { record, lockPath, failing };
    }

    const outcome = envFaults.restoreFault(record, dir, { shell });

    if (!RESTORED_OUTCOMES.includes(outcome)) {
      fail(`Une panne d'environnement non détectée n'a pas pu être annulée (${describeFault(record)}) : rétablis-la à la main (\`docker compose start\` ou arrêt du processus).`);
    }

    fs.rmSync(lockPath, { force: true });
    fs.rmSync(faultLockPath(dir), { force: true });
  }

  return null;
}

function breakCommand({ dir, level = 1, home = os.homedir(), random = Math.random, execute = runCommand, shell }) {
  const auto = level === "auto";

  if (!auto && ![1, 2, 3].includes(level)) {
    fail("--level doit valoir 1, 2 ou 3.");
  }

  // Repair a previous interrupted run first: the tree must be judged after it.
  recoverOrphans(dir, shell);

  const phases = checkpointPhases(dir);
  assertPreconditions(dir, phases);

  const baseline = runCheckpoints(phases, dir, execute);

  if (baseline.failing.length > 0) {
    fail(`Le checkpoint de la phase ${baseline.failing[0].phase.id} est déjà rouge : répare-le avant de provoquer un incident.`);
  }

  let kept = null;
  let envFault = null;

  if (auto) {
    level = chooseLevel({ home });
  }

  if (level === 3) {
    envFault = keepEnvFault({ dir, phases, random, execute, shell });

    if (envFault) {
      kept = { site: null, lockPath: envFault.lockPath, failing: envFault.failing };
    } else {
      level = 2;
      log("Aucune panne d'environnement applicable (pas de `.env` non suivi, de `PORT` libre ni de service en cours) : repli sur le niveau 2.");
    }
  }

  const candidates = envFault ? [] : findAllSites(dir);
  let attempts = 0;

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
  const record = site
    ? { id, dir: projectKey(dir), startedAt, level, file: site.file.rel, line: site.line, operator: site.operator, original: site.original }
    : { id, dir: projectKey(dir), startedAt, level, ...envFault.record };
  const recordPath = incidentRecordPath(dir, { home });

  try {
    assertWritable(recordPath);
    writeJson(recordPath, record);
    fs.chmodSync(recordPath, 0o600);
  } catch (error) {
    // Nothing recorded means nothing could undo the fault later: undo it now.
    if (envFault) {
      envFaults.restoreFault(record, dir, { shell });
      fs.rmSync(lockPath, { force: true });
      fs.rmSync(faultLockPath(dir), { force: true });
    }
    throw error;
  }
  writeJson(statePath(dir), { active: true, level, startedAt, failingPhases: failing.map((r) => r.phase.id) });
  fs.rmSync(lockPath, { force: true });
  fs.rmSync(faultLockPath(dir), { force: true });

  log(
    envFault
      ? "Incident de niveau 3 : une panne est cachée dans l'environnement, pas dans ton code. Tu ne sais pas où — c'est le but."
      : `Incident de niveau ${level} : une panne est cachée dans ton code. Tu ne sais pas où — c'est le but.`,
  );
  log("");
  log(`Symptôme (checkpoint de la phase ${failing[0].phase.id} — ${failing[0].phase.name}) :`);
  log(tail(outputOf(failing[0].result)) || "(le checkpoint échoue sans afficher de sortie)");
  log("");
  if (envFault) {
    log("Avant de lancer une commande, écris quelle cause tu soupçonnes (variable d'environnement, port occupé ou service arrêté) :");
    log(`  ai-learn predict --phase ${failing[0].phase.id} --type debug --cause "<type de panne>" --prediction "<mécanisme>"`);
  } else {
    log("Avant d'ouvrir un fichier, écris où tu penses que se trouve la cause et pourquoi :");
    log(`  ai-learn predict --phase ${failing[0].phase.id} --type debug --file <fichier> --line <n> --prediction "<mécanisme>"`);
  }

  log("Puis cherche, répare, et lance `ai-learn break --resolve`. Bloqué ? `ai-learn break --giveup`.");
}

function readRecord(dir, home) {
  const record = readJson(incidentRecordPath(dir, { home }), null);

  const valid =
    record &&
    (record.kind === "port"
      ? Number.isInteger(record.pid)
      : record.kind === "service"
        ? typeof record.service === "string"
        : typeof record.file === "string" && typeof record.original === "string");

  if (!valid) {
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
function lastDebugPrediction(dir, startedAt, field = "file") {
  const { data } = readPredictions(dir);
  const entries = data && Array.isArray(data.entries) ? data.entries : [];
  const mine = entries.filter((e) => e.type === "debug" && typeof e[field] === "string" && e.at >= startedAt);
  return mine.length > 0 ? mine[mine.length - 1] : null;
}

const CAUSE_WORDS = {
  env: /(\.env\b|\benv\b|\bvariables?\b)/i,
  port: /\bport\b/i,
  service: /\b(service|conteneur|container)\b/i,
};

// Level 3 compares the fault *type* the learner named, not a file and line:
// `exact` only when exactly one type is named and it is the right one.
function compareCause(prediction, record) {
  if (!prediction) {
    return "aucune";
  }

  const named = Object.keys(CAUSE_WORDS).filter((type) => CAUSE_WORDS[type].test(prediction.cause));
  return named.length === 1 && named[0] === record.kind ? "exact" : "manqué";
}

function isEnvironmentFault(record) {
  return record.kind === "env" || record.kind === "port" || record.kind === "service";
}

function describeFault(record) {
  if (record.kind === "port") {
    return `le port ${record.port} tenu par un processus parasite (pid ${record.pid})`;
  }

  if (record.kind === "service") {
    return `le service « ${record.service} » arrêté`;
  }

  return `${record.file}:${record.line} (${record.operator})`;
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
  // Only `.env` leaves a modification time to compare; the other faults have no
  // repair instant the tool can observe (documented limit).
  if (record.kind === "port" || record.kind === "service") {
    return true;
  }

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

// A fault only counts as undone when the restore says so; otherwise the
// incident stays active rather than claiming an environment that is not back.
function assertRestored(outcome) {
  if (!RESTORED_OUTCOMES.includes(outcome)) {
    fail("Impossible de rétablir l'environnement (processus non reconnu ou `docker compose start` en échec) : l'incident reste actif, vérifie à la main puis relance.");
  }
}

function resolveCommand({ dir, home = os.homedir(), execute = runCommand, shell }) {
  recoverOrphans(dir, shell);
  const state = requireActive(dir);
  const record = readRecord(dir, home);
  const { failing } = runCheckpoints(checkpointPhases(dir), dir, execute);

  if (failing.length > 0) {
    log("Toujours rouge — l'incident reste actif :");
    log(tail(outputOf(failing[0].result)));
    process.exitCode = 1;
    return;
  }

  const environment = isEnvironmentFault(record);
  const prediction = lastDebugPrediction(dir, record.startedAt, environment ? "cause" : "file");
  const verdict = environment ? compareCause(prediction, record) : comparePrediction(prediction, record);
  const tiers = [1];

  if (record.level >= 2) {
    tiers.push(2);
  }

  if (verdict === "exact" && predictedBeforeRepair(prediction, record, dir)) {
    tiers.push(3);
  }

  if (environment) {
    tiers.push(4);
    assertRestored(envFaults.restoreFault(record, dir, { keepFile: true, shell }));
  }

  recordDebugTiers({ home, dir: projectKey(dir), incidentId: record.id, tiers, detail: describeFault(record) });
  closeIncident(dir, home, state, "resolu", { prediction: verdict });

  log("Incident résolu : tous les checkpoints repassent au vert.");
  log(`${environment ? "La panne était" : "Le site était"} ${describeFault(record)}.`);
  log(`Ta prédiction : ${verdict}.`);
  log(`Paliers atteints : ${tiers.join(", ")} (~/.ai-learn/tracks/debug.json).`);
}

function giveupCommand({ dir, home = os.homedir(), shell }) {
  recoverOrphans(dir, shell);
  const state = requireActive(dir);
  const record = readRecord(dir, home);

  if (record.kind === "port" || record.kind === "service") {
    assertRestored(envFaults.restoreFault(record, dir, { shell }));
    closeIncident(dir, home, state, "abandon");
    log("Incident abandonné : l'environnement est revenu à son état d'avant la panne.");
    log(`La panne était ${describeFault(record)}.`);
    return;
  }

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
  // Keep the file's own permissions (a 0600 `.env` must not become 0644).
  const mode = fs.existsSync(target) ? fs.statSync(target).mode & 0o777 : 0o644;
  fs.writeFileSync(partial, record.original, { mode, encoding: record.kind === "env" ? "latin1" : "utf8" });
  fs.renameSync(partial, target);
  closeIncident(dir, home, state, "abandon");

  log("Incident abandonné : ton code est revenu à son état d'avant la panne.");
  log(`${record.kind === "env" ? "La panne était" : "Le site était"} ${describeFault(record)}.`);
  log(`Ta version du fichier est gardée dans ${normalizePortable(path.join(".ai-learn", "incident-giveup", record.file))}.`);
}

module.exports = { chooseLevel, incidentDue, incidentFact, incidentNotice, breakCommand, resolveCommand, giveupCommand, readIncident, incidentRecordPath, statePath };
