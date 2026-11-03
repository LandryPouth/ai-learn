"use strict";

// Story 11.04 — `ai-learn break --bisect`: a throwaway branch of N commits, each
// a neutral rewrite, one of them also carrying a detectable fault. The learner
// finds it with `git bisect run`; the faulty sha stays in `~/.ai-learn/incidents/`.
// The tool commits (a fixture, like the broken file of `break`); the learner
// bisects. Only the throwaway branch is ever touched — no reset, no rebase.

const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { log, fail, readJson, writeJson, spawnGit } = require("../util");
const { findAllSites, applyMutant, restoreOriginal } = require("../mutate");
const { projectKey } = require("../tracks/store");
const { recordIncidentTier } = require("../tracks/git");
const { predictionsPath, journalPath } = require("../predictions");
const { recordSecondOpinion } = require("../tracks/debug");
const { runCommand } = require("../exec");

const MIN_COMMITS = 6;
const MAX_COMMITS = 32;
const DEFAULT_COMMITS = 12;
const MAX_FAULT_ATTEMPTS = 20;
const TIER = 7;
const IDENTITY = { name: "ai-learn", email: "ai-learn@localhost" };
// Plausible, hint-free: the same pool serves the neutral and the faulty commits.
const MESSAGES = [
  "refactor: simplifie une condition",
  "chore: harmonise l'écriture des tests",
  "refactor: clarifie une comparaison",
  "chore: reformule un contrôle",
  "refactor: uniformise le style des conditions",
  "chore: nettoie une vérification",
];

// `incident` is required lazily: incident.js loads this module at startup.
const incident = () => require("../incident");

function lockPath(dir) {
  return path.join(dir, ".ai-learn", "bisect.lock.json");
}

function git(dir, args, opts = {}) {
  const res = spawnGit(["-C", dir, "-c", "core.hooksPath=" + os.devNull, "-c", "commit.gpgsign=false", ...args], { encoding: "utf8", ...opts });
  return { ok: res.status === 0, out: (res.stdout || "").trim(), err: (res.stderr || "").trim() };
}

function mustGit(dir, args, message) {
  const res = git(dir, args);

  if (!res.ok) {
    fail(`${message}\n${res.err}`);
  }

  return res.out;
}

function currentBranch(dir) {
  return git(dir, ["branch", "--show-current"]).out;
}

function relPosix(dir, file) {
  return path.relative(dir, file).split(path.sep).join("/");
}

// The journal is the tool's own state, not the learner's repair: predictions.json
// and its rendered journal are tracked, and a bet made during the incident writes both.
function journalFiles(dir) {
  return [predictionsPath(dir), journalPath(dir)];
}

function isClean(dir) {
  const excludes = [".ai-learn", ...journalFiles(dir).map((f) => relPosix(dir, f))].map((p) => `:(exclude)${p}`);
  const res = git(dir, ["status", "--porcelain", "--untracked-files=no", "--", ".", ...excludes]);
  return res.ok && res.out === "";
}

function commitStep(dir, files, message) {
  mustGit(dir, ["add", "--", ...files], "Impossible de préparer le commit de l'historique.");
  const env = { GIT_AUTHOR_NAME: IDENTITY.name, GIT_AUTHOR_EMAIL: IDENTITY.email, GIT_COMMITTER_NAME: IDENTITY.name, GIT_COMMITTER_EMAIL: IDENTITY.email };
  const res = git(dir, ["commit", "-q", "--no-verify", "-m", message], { env });

  if (!res.ok) {
    fail(`Impossible de commiter l'historique.\n${res.err}`);
  }

  return mustGit(dir, ["rev-parse", "HEAD"], "Impossible de lire le commit créé.");
}

// Returns to the original branch and drops the throwaway one: it was never
// delivered. The whole tracked tree goes back to the throwaway HEAD first (the
// tool owns it during a build), or a half-applied rewrite would follow the
// learner onto their branch. A failed checkout keeps the lock and says so.
function abandonBuild(dir, lock) {
  if (currentBranch(dir) === lock.branch) {
    git(dir, ["checkout", "-q", "--", "."]);
  }

  const back = git(dir, ["checkout", "-q", lock.origin, "--"]);

  if (!back.ok) {
    fail(`Impossible de revenir sur ${lock.origin} après une construction interrompue (la branche jetable ${lock.branch} reste) : \`git switch ${lock.origin}\`, puis relance.\n${back.err}`);
  }

  git(dir, ["branch", "-D", lock.branch]);
  fs.rmSync(lockPath(dir), { force: true });
}

// A lock next to an active incident is stale: the incident owns the branch.
function recoverBuild(dir) {
  const lock = readJson(lockPath(dir), null);

  if (!lock) {
    return;
  }

  const state = incident().readIncident(dir);

  if (!(state && state.active)) {
    abandonBuild(dir, lock);
    log(`Construction d'historique interrompue : retour sur ${lock.origin}, branche jetable supprimée.`);
    return;
  }

  fs.rmSync(lockPath(dir), { force: true });
}

// Same site again on the clean text: its line never changes (neutral rewrites
// stay on their line), its offset may.
function findAgain(dir, fault) {
  const sites = findAllSites(dir, { bank: fault.bank });
  return sites.find((s) => s.file.rel === fault.rel && s.line === fault.line && s.operator === fault.operator && s.matchedText === fault.matchedText) || null;
}

function pickFrom(list, random) {
  return list.splice(Math.min(list.length - 1, Math.floor(random() * list.length)), 1)[0];
}

// The neutral rewrite for this step, proven neutral by the checkpoints; an
// unproven one is undone and dropped.
function keepNeutral(dir, { phases, used, avoid, random, execute }) {
  const { runCheckpoints } = incident();
  const candidates = findAllSites(dir, { bank: "neutral" }).filter((s) => !used.has(`${s.file.rel}:${s.line}`) && !(avoid && avoid === `${s.file.rel}:${s.line}`) && s.mutate(s.matchedText) !== s.matchedText);

  while (candidates.length > 0) {
    const site = pickFrom(candidates, random);
    applyMutant(site);

    if (runCheckpoints(phases, dir, execute).failing.length === 0) {
      return site;
    }

    restoreOriginal(site);
  }

  return null;
}

// A detectable fault on top of the current (neutral) tree: banks as `break` does.
function keepFault(dir, { phases, random, execute }) {
  const { runCheckpoints } = incident();

  for (const bank of ["faults", "mutators"]) {
    const candidates = findAllSites(dir, { bank });
    let attempts = 0;

    while (candidates.length > 0 && attempts < MAX_FAULT_ATTEMPTS) {
      const site = pickFrom(candidates, random);

      if (site.rejects && site.rejects()) continue;

      attempts += 1;
      applyMutant(site);

      if (runCheckpoints(phases, dir, execute).failing.length > 0) {
        return { site, bank };
      }

      restoreOriginal(site);
    }
  }

  return null;
}

function clampCommits(requested) {
  const n = Number.isInteger(requested) ? requested : DEFAULT_COMMITS;
  return Math.min(MAX_COMMITS, Math.max(MIN_COMMITS, n));
}

function bisectCommand({ dir, commits, home = os.homedir(), random = Math.random, execute = runCommand, shell }) {
  const { assertPreconditions, checkpointPhases, runCheckpoints } = incident();

  incident().recoverOrphans(dir, shell);
  const phases = checkpointPhases(dir);
  assertPreconditions(dir, phases);

  const origin = currentBranch(dir);

  if (!origin) {
    fail("HEAD est détaché : place-toi sur une branche (`git switch <branche>`) avant de construire un historique.");
  }

  const baseline = runCheckpoints(phases, dir, execute);

  if (baseline.failing.length > 0) {
    fail(`Le checkpoint de la phase ${baseline.failing[0].phase.id} est déjà rouge : répare-le avant de provoquer un incident.`);
  }

  const id = crypto.randomUUID();
  const branch = `ai-learn/bisect-${id.slice(0, 8)}`;
  const lock = { origin, branch };

  // The lock comes first: a crash right after `checkout -b` is then recoverable.
  writeJson(lockPath(dir), lock);

  try {
    return buildHistory({ dir, home, phases, origin, branch, id, requested: commits, random, execute });
  } catch (error) {
    abandonBuild(dir, lock);
    throw error;
  }
}

function buildHistory({ dir, home, phases, origin, branch, id, requested, random, execute }) {
  const { statePath, incidentRecordPath } = incident();

  // The fault is chosen on the clean tree, before any rewrite, so the neutral
  // rewrites can neither consume its candidates nor touch its line.
  const picked = keepFault(dir, { phases, random, execute });

  if (!picked) {
    fail("aucune panne détectable : tes tests ne couvrent pas assez le code pour qu'une panne y soit repérée. Renforce-les, puis relance.");
  }

  const fault = { bank: picked.bank, rel: picked.site.file.rel, line: picked.site.line, operator: picked.site.operator, matchedText: picked.site.matchedText };
  restoreOriginal(picked.site);
  const faultLine = `${fault.rel}:${fault.line}`;

  const available = new Set(findAllSites(dir, { bank: "neutral" }).filter((s) => s.mutate(s.matchedText) !== s.matchedText).map((s) => `${s.file.rel}:${s.line}`));
  available.delete(faultLine);
  const asked = clampCommits(requested);

  if (asked !== requested && Number.isInteger(requested)) {
    log(`--commits ramené à ${asked} (entre ${MIN_COMMITS} et ${MAX_COMMITS}).`);
  }

  const total = Math.min(asked, available.size);

  if (total < MIN_COMMITS) {
    fail(`pas assez de code pour construire un historique : il faut au moins ${MIN_COMMITS} réécritures neutres (comparaisons \`===\`, tests de longueur…) couvertes par tes checkpoints, hors la ligne de la panne (${available.size} trouvée(s)).`);
  }

  if (total < asked) {
    log(`Historique réduit à ${total} commits : c'est tout ce que ton code permet de réécrire sans effet.`);
  }

  log(`Construction d'un historique de ${total} commits (au moins ${total + 1} exécutions de tes checkpoints, patiente)…`);
  mustGit(dir, ["checkout", "-q", "-b", branch], "Impossible de créer la branche jetable.");

  const used = new Set();
  const third = Math.ceil(total / 3);
  const faultIndex = Math.floor(total / 3) + Math.min(Math.floor(random() * third), third - 1);
  let faultSha = null;
  let applied = null;
  let built = 0;

  for (let i = 0; i < total; i += 1) {
    // A crash mid-rewrite is undone by the lock: recovery restores the whole tracked tree.
    const neutral = keepNeutral(dir, { phases, used, avoid: faultLine, random, execute });

    if (!neutral) {
      break;
    }

    used.add(`${neutral.file.rel}:${neutral.line}`);
    const files = [neutral.file.rel];

    if (i >= faultIndex) {
      const again = findAgain(dir, fault);

      if (!again) {
        fail("Impossible de reporter la panne sur le commit suivant : historique abandonné.");
      }

      applyMutant(again);
      applied = again;
      if (!files.includes(fault.rel)) files.push(fault.rel);
    }

    const sha = commitStep(dir, files, MESSAGES[i % MESSAGES.length]);
    built += 1;

    if (i === faultIndex) {
      faultSha = sha;
    }

    // Back to the clean text for the next neutral rewrite's proof.
    if (applied && i < total - 1) {
      restoreOriginal(applied);
      applied = null;
    }
  }

  // The last commit carries the fault: the working tree must match it, even
  // when the loop stopped right after restoring the clean text.
  mustGit(dir, ["checkout", "-q", "--", "."], "Impossible de rétablir l'arbre de travail.");

  if (built <= faultIndex || built < MIN_COMMITS || !faultSha) {
    fail("pas assez de code pour construire un historique : trop de réécritures ont fait tomber un checkpoint.");
  }

  const startedAt = new Date().toISOString();
  const record = { kind: "bisect", level: "bisect", id, startedAt, origin, branch, sha: faultSha, file: fault.rel, line: fault.line, operator: fault.operator, commits: built };

  fs.mkdirSync(path.dirname(incidentRecordPath(dir, { home })), { recursive: true });
  writeJson(incidentRecordPath(dir, { home }), record);
  fs.chmodSync(incidentRecordPath(dir, { home }), 0o600);
  writeJson(statePath(dir), { active: true, level: "bisect", startedAt, branch });
  fs.rmSync(lockPath(dir), { force: true });

  log(`Incident de régression : la branche ${branch} porte ${built} commits, l'un d'eux a cassé ton checkpoint. Tu ne sais pas lequel — c'est le but.`);
  log("");
  log("Retrouve-le avec git (tu tapes les commandes, pas l'IA) :");
  log("  git bisect start <mauvais> <bon>");
  log("  git bisect run <commande du checkpoint>");
  log("  git bisect reset");
  log("Écris le commit que tu soupçonnes avant de lancer bisect :");
  log(`  ai-learn predict --phase ${phases[0].id} --type debug --commit <sha> --prediction "<pourquoi>"`);
  log("Puis répare (ou annule le commit), commite sur la branche jetable, et lance `ai-learn break --resolve`. Bloqué ? `ai-learn break --giveup`.");
}

function readBisectRecord(dir, home) {
  const record = readJson(incident().incidentRecordPath(dir, { home }), null);

  if (!record || record.kind !== "bisect" || typeof record.sha !== "string") {
    fail("Le secret de l'incident est introuvable (~/.ai-learn/incidents/) : abandonne-le avec `ai-learn break --giveup`.");
  }

  return record;
}

// `exact` only when the bet names the faulty commit (short sha accepted).
function compareCommit(dir, prediction, record) {
  if (!prediction) {
    return "aucune";
  }

  const res = git(dir, ["rev-parse", "--verify", "--quiet", `${prediction.commit}^{commit}`]);

  if (!res.ok) {
    log(`Le sha prédit (${prediction.commit}) n'est pas un commit unique du dépôt (inconnu ou ambigu) : compté comme manqué.`);
  }

  return res.ok && res.out === record.sha ? "exact" : "manqué";
}

function bets(dir, record) {
  const { lastDebugPrediction } = incident();
  const learner = lastDebugPrediction(dir, record.startedAt, "commit");
  const ai = lastDebugPrediction(dir, record.startedAt, "commit", { ai: true });

  return { learnerVerdict: compareCommit(dir, learner, record), aiVerdict: compareCommit(dir, ai, record) };
}

function reveal(dir, record, { learnerVerdict, aiVerdict }) {
  log(`Le commit fautif était ${record.sha.slice(0, 10)} (${record.file}:${record.line}, ${record.operator}).`);
  log(`Ta prédiction : ${learnerVerdict}.`);
  incident().logSecondOpinion(aiVerdict);
}

function bisectInProgress(dir) {
  const res = git(dir, ["rev-parse", "--git-path", "BISECT_START"]);
  return res.ok && fs.existsSync(path.resolve(dir, res.out));
}

function backToOrigin(dir, record) {
  if (bisectInProgress(dir)) {
    fail("Un `git bisect` est en cours : lance `git bisect reset`, puis recommence.");
  }

  const res = git(dir, ["checkout", "-q", record.origin, "--"]);

  if (!res.ok) {
    fail(`Impossible de revenir sur ${record.origin} (commite ou abandonne tes changements, puis relance) :\n${res.err}`);
  }
}

// The journal written during the incident may have been committed on the
// throwaway branch: the checkout back would drop it from the learner's branch.
// Its text is kept across the switch and put back.
function backToOriginKeepingJournal(dir, record) {
  const kept = journalFiles(dir).map((file) => ({ file, text: fs.existsSync(file) ? fs.readFileSync(file, "utf8") : null }));

  backToOrigin(dir, record);

  for (const { file, text } of kept) {
    if (text !== null && (!fs.existsSync(file) || fs.readFileSync(file, "utf8") !== text)) {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, text);
    }
  }
}

function resolveBisect({ dir, home, execute, state }) {
  const { checkpointPhases, runCheckpoints, closeIncident } = incident();
  const record = readBisectRecord(dir, home);

  if (currentBranch(dir) !== record.branch) {
    fail(`Extrais la branche jetable (\`git switch ${record.branch}\`, après \`git bisect reset\`) avant de résoudre.`);
  }

  if (!isClean(dir)) {
    fail("Commite ta réparation sur la branche jetable avant de résoudre (arbre git non propre).");
  }

  const { failing } = runCheckpoints(checkpointPhases(dir), dir, execute);

  if (failing.length > 0) {
    log("Toujours rouge — l'incident reste actif :");
    log(`${failing[0].result.stdoutTail || ""}${failing[0].result.stderrTail || ""}`.trim());
    process.exitCode = 1;
    return;
  }

  const verdicts = bets(dir, record);
  const tiers = verdicts.learnerVerdict === "exact" ? [TIER] : [];

  backToOriginKeepingJournal(dir, record);

  if (tiers.length > 0) {
    recordIncidentTier({ home, dir: projectKey(dir), incidentId: record.id, tier: TIER, kind: "bisect", detail: `${record.file}:${record.line}` });
  }

  if (verdicts.aiVerdict !== "aucune") {
    recordSecondOpinion({ home, incidentId: record.id, learner: verdicts.learnerVerdict, ai: verdicts.aiVerdict });
  }

  closeIncident(dir, home, state, "resolu", { prediction: verdicts.learnerVerdict });

  log("Incident résolu : tous les checkpoints repassent au vert.");
  reveal(dir, record, verdicts);
  log(tiers.length > 0 ? `Palier git ${TIER} atteint (~/.ai-learn/tracks/git.json).` : "Pas de palier : le commit prédit n'est pas le bon.");
  log(`Tu es revenu sur ${record.origin} ; la branche ${record.branch} reste, supprime-la quand tu veux (\`git branch -D ${record.branch}\`).`);
}

function giveupBisect({ dir, home, state }) {
  const { closeIncident } = incident();
  const record = readBisectRecord(dir, home);
  const verdicts = bets(dir, record);

  backToOriginKeepingJournal(dir, record);
  closeIncident(dir, home, state, "abandon");

  log("Incident abandonné : tu es revenu sur ta branche d'origine.");
  reveal(dir, record, verdicts);
  log(`La branche ${record.branch} reste, supprime-la quand tu veux (\`git branch -D ${record.branch}\`).`);
}

module.exports = { bisectCommand, resolveBisect, giveupBisect, recoverBuild };
