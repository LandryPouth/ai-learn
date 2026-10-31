"use strict";

// `ai-learn revisit <id>` — a revisit that proves memory (story 09.06).
//
// `verify --revisit` used to replay the checkpoint on unchanged code, so it was
// always green. Here the tool first removes from the learner's files exactly
// what the phase's commits added, and the learner retypes it from memory.
//
// The removal is a reverse apply of the phase's commits (`feat(phase-N)`, the
// convention `verify` proposes and the commit-msg hook enforces): the only cut
// of "what this phase added" the tool knows without guessing. If the reverse
// does not apply, the phase was reworked since — refuse instead of
// approximating, a partial removal would prove nothing.
//
// Git is only ever read (`log`, `diff-tree`, `status`); the one write is an
// exclude line in `.git/info/exclude` for the lock and backup. The reverse apply runs
// in a scratch copy outside the repository, so a refusal modifies nothing.
// Files are written by this tool, after a byte-for-byte backup and a lock
// modelled on `mutate.lock.json`, which `--giveup` (or an interrupted run's
// recovery) restores from. The incident engine of epic 10 reuses this.

const fs = require("fs");
const os = require("os");
const path = require("path");
const { log, fail, readJson, writeJson, spawnGit } = require("./util");
const { readProgress, missingProgressMessage, findPhase, setPhaseReviewAfterDays } = require("./progress");
const { loadGuardConfig, matchesLearnerPath } = require("./guard");
const { mutateLockPath } = require("./mutate");

const MAX_BUFFER = 64 * 1024 * 1024;

function revisitLockPath(dir) {
  return path.join(dir, ".ai-learn", "revisit.lock.json");
}

function revisitBackupDir(dir, phaseId) {
  return path.join(dir, ".ai-learn", "revisit", String(phaseId));
}

function manifestPath(dir, phaseId) {
  return path.join(revisitBackupDir(dir, phaseId), "manifest.json");
}

// "none" | "active" | "orphan". Orphan = a lock that cannot be trusted: the
// run was interrupted while removing files, or the backup it relies on is gone.
// The CLI exits right after removing the code, so a dead process alone says
// nothing — the lock's own `state` does.
function revisitStatus(dir) {
  if (!fs.existsSync(revisitLockPath(dir))) {
    return { state: "none" };
  }

  const lock = readJson(revisitLockPath(dir), null);

  if (!lock || !Number.isInteger(lock.phaseId)) {
    return { state: "orphan", lock: null, reason: "verrou illisible" };
  }

  if (!readJson(manifestPath(dir, lock.phaseId), null)) {
    return { state: "orphan", lock, reason: "sauvegarde absente" };
  }

  if (lock.state !== "active") {
    return { state: "orphan", lock, reason: "interrompue pendant le retrait du code" };
  }

  return { state: "active", lock };
}

function git(dir, args, { input } = {}) {
  const res = spawnGit(["-C", dir, "--literal-pathspecs", ...args], { input, maxBuffer: MAX_BUFFER });
  return { ok: res.status === 0, stdout: res.stdout || Buffer.alloc(0), stderr: String((res.stderr && res.stderr.toString()) || "") };
}

function isGitRepo(dir) {
  return git(dir, ["rev-parse", "--is-inside-work-tree"]).ok;
}

// Paths git reports as modified, staged or untracked. Ignored files do not
// appear, so the revisit's own backup (gitignored) never counts as dirt.
function dirtyFiles(dir) {
  const res = git(dir, ["--no-optional-locks", "status", "--porcelain"]);

  return res.stdout
    .toString("utf8")
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => line.slice(3));
}

// The lock and the backup must never be committed by the learner's `git add -A`
// nor count as a dirty tree, including in a project whose `.gitignore` predates
// this story. `.git/info/exclude` is local to the clone and leaves the tracked
// `.gitignore` untouched.
function excludeRevisitFiles(dir) {
  const res = git(dir, ["rev-parse", "--git-path", "info/exclude"]);
  const file = path.resolve(dir, res.stdout.toString("utf8").trim());
  const wanted = [".ai-learn/revisit/", ".ai-learn/revisit.lock.json"];
  const current = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
  const missing = wanted.filter((line) => !current.split(/\r?\n/).includes(line));

  if (missing.length > 0) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.appendFileSync(file, `${current && !current.endsWith("\n") ? "\n" : ""}${missing.join("\n")}\n`);
  }
}

// Commits whose *subject* is `type(phase-N): …` — not a body, a revert or a
// later commit that merely mentions the phase.
function phaseCommits(dir, phaseId) {
  const res = git(dir, ["log", "--reverse", "--format=%H%x09%s", "--fixed-strings", `--grep=(phase-${phaseId})`]);
  const subject = new RegExp(`^[a-z]+\\(phase-${phaseId}\\)!?:`);

  return res.stdout
    .toString("utf8")
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => line.split("\t"))
    .filter(([, text]) => subject.test(text || ""))
    .map(([hash]) => hash);
}

// `added\tdeleted\tpath` per file the commit touched (NUL-separated, so no path
// is ever quoted), restricted to the learner's files — checkpoint, docs and the
// like are never removed.
function learnerChanges(dir, hash, learnerFiles) {
  const res = git(dir, ["diff-tree", "--no-commit-id", "--numstat", "-z", "-r", "--no-renames", "--root", "--relative", hash]);

  return res.stdout
    .toString("utf8")
    .split("\0")
    .filter(Boolean)
    .map((entry) => {
      const [added, deleted, ...rest] = entry.split("\t");
      return { file: rest.join("\t"), added: Number.parseInt(added, 10), deleted: Number.parseInt(deleted, 10) };
    })
    .filter(({ file }) => matchesLearnerPath(file, learnerFiles));
}

// A relative path that stays inside the project and crosses no symlink — the
// backup/restore writes through paths read from git or from the manifest, and
// must never be walked out of the project.
function safeTarget(dir, rel, learnerFiles) {
  if (typeof rel !== "string" || !rel || path.isAbsolute(rel) || rel.split(/[\\/]/).includes("..")) {
    fail(`Chemin refusé (hors du projet) : ${rel}`);
  }

  if (!matchesLearnerPath(rel, learnerFiles)) {
    fail(`Chemin refusé (hors des fichiers de l'apprenant) : ${rel}`);
  }

  let current = dir;

  for (const part of rel.split(/[\\/]/)) {
    current = path.join(current, part);

    try {
      if (fs.lstatSync(current).isSymbolicLink()) {
        fail(`Lien symbolique refusé : ${rel} — la revisite n'écrit jamais à travers un lien.`);
      }
    } catch (error) {
      if (error.code !== "ENOENT") {
        throw error;
      }
      break;
    }
  }

  return path.join(dir, rel);
}

function commitPatch(dir, hash, files) {
  const args = ["diff-tree", "--no-commit-id", "-p", "--binary", "-r", "--no-renames", "--root", "--relative", "--no-color", "--no-ext-diff", hash, "--", ...files];

  return git(dir, args).stdout;
}

// Reverse-applies the patches (latest commit first) on a scratch copy of the
// touched files, and returns the resulting content per file (`null` = file
// removed), or the git error when the phase no longer reverses cleanly.
function reverseInScratch(dir, patches, files) {
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "ai-learn-revisit-"));

  try {
    for (const file of files) {
      const source = path.join(dir, file);

      if (fs.existsSync(source)) {
        fs.mkdirSync(path.dirname(path.join(scratch, file)), { recursive: true });
        fs.copyFileSync(source, path.join(scratch, file));
      }
    }

    for (const patch of [...patches].reverse()) {
      const res = spawnGit(["apply", "-R", "--whitespace=nowarn", "-"], { cwd: scratch, input: patch, maxBuffer: MAX_BUFFER });

      if (res.status !== 0) {
        return { ok: false, error: String(res.stderr || "").trim() };
      }
    }

    const result = new Map();

    for (const file of files) {
      const target = path.join(scratch, file);
      result.set(file, fs.existsSync(target) ? fs.readFileSync(target) : null);
    }

    return { ok: true, result };
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true });
  }
}

function backupFiles(dir, phaseId, files) {
  const backup = revisitBackupDir(dir, phaseId);

  fs.rmSync(backup, { recursive: true, force: true });
  fs.mkdirSync(path.join(backup, "files"), { recursive: true });

  const manifest = files.map((file) => {
    const source = path.join(dir, file);
    const existed = fs.existsSync(source);

    if (existed) {
      fs.mkdirSync(path.dirname(path.join(backup, "files", file)), { recursive: true });
      fs.copyFileSync(source, path.join(backup, "files", file));
    }

    return { path: file, existed };
  });

  writeJson(manifestPath(dir, phaseId), manifest);
}

function startRevisit({ dir, phaseId }) {
  const { config, exists } = readProgress(dir);

  if (!exists || !config) {
    fail(missingProgressMessage(dir));
  }

  const phase = findPhase(config, phaseId);

  if (!phase) {
    fail(`No phase ${phaseId} in progress.json.`);
  }

  if (phase.status !== "done") {
    fail(`Revisite impossible : la phase ${phase.id} est « ${phase.status} » — on ne revisite qu'une phase prouvée (\`ai-learn verify ${phase.id}\`).`);
  }

  if (!isGitRepo(dir)) {
    fail("Revisite impossible : ce projet n'est pas un dépôt git — le retrait s'appuie sur les commits de la phase (`feat(phase-N)`).");
  }

  const current = revisitStatus(dir);

  if (current.state !== "none") {
    const id = current.lock ? current.lock.phaseId : phaseId;
    fail(`Une revisite est déjà en cours (phase ${id}) — terminez-la (\`ai-learn verify ${id} --revisit\`) ou abandonnez-la (\`ai-learn revisit ${id} --giveup\`).`);
  }

  if (fs.existsSync(mutateLockPath(dir))) {
    fail("Une mutation est en cours (.ai-learn/mutate.lock.json) — relancez `ai-learn verify` ou `ai-learn mutate` pour la résoudre, puis revisitez.");
  }

  const dirty = dirtyFiles(dir);

  if (dirty.length > 0) {
    fail(
      `Revisite impossible : l'arbre git n'est pas propre. Commitez d'abord (\`git add -A && git commit\`) — fichiers non commités : ${dirty.slice(0, 8).join(", ")}${dirty.length > 8 ? ", …" : ""}.`,
    );
  }

  const commits = phaseCommits(dir, phase.id);

  if (commits.length === 0) {
    fail(`Revisite impossible : aucun commit « (phase-${phase.id}) » — la phase doit avoir été commitée en \`feat(phase-${phase.id}): …\`.`);
  }

  const { learnerFiles } = loadGuardConfig(dir);
  const added = new Map();
  const patches = [];

  for (const hash of commits) {
    const changes = learnerChanges(dir, hash, learnerFiles);

    if (changes.length === 0) {
      continue;
    }

    const rewritten = changes.find(({ added: a, deleted: d }) => !Number.isInteger(a) || !Number.isInteger(d) || d > 0);

    if (rewritten) {
      fail(
        `Revisite impossible par retrait : la phase ${phase.id} a supprimé ou remplacé du code existant (${rewritten.file}) — l'inverse réinjecterait de l'ancien code au lieu d'en retirer. Rien n'a été modifié.`,
      );
    }

    for (const { file, added: count } of changes) {
      added.set(file, (added.get(file) || 0) + count);
    }

    patches.push(commitPatch(dir, hash, changes.map(({ file }) => file)));
  }

  if (patches.length === 0) {
    fail(`Revisite impossible : les commits de la phase ${phase.id} ne touchent aucun fichier de l'apprenant (${learnerFiles.join(", ")}).`);
  }

  const files = [...added.keys()].sort();

  for (const file of files) {
    safeTarget(dir, file, learnerFiles);
  }

  const reversed = reverseInScratch(dir, patches, files);

  if (!reversed.ok) {
    fail(
      `Revisite impossible : la phase ${phase.id} a été retravaillée depuis — son code ne se retire plus proprement. Rien n'a été modifié.${reversed.error ? `\n  ${reversed.error.split("\n")[0]}` : ""}`,
    );
  }

  excludeRevisitFiles(dir);
  backupFiles(dir, phase.id, files);
  const lock = {
    phaseId: phase.id,
    startedAt: new Date().toISOString(),
    state: "applying",
    reviewAfterDays: phase.reviewAfterDays === undefined ? null : phase.reviewAfterDays,
    files,
  };
  writeJson(revisitLockPath(dir), lock);

  for (const [file, content] of reversed.result) {
    const target = path.join(dir, file);

    if (content === null) {
      fs.rmSync(target, { force: true });
    } else {
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, content);
    }
  }

  writeJson(revisitLockPath(dir), { ...lock, state: "active" });

  log(`Revisite de la phase ${phase.id} — ${phase.name} : le code de la phase a été retiré.`);

  for (const file of files) {
    log(`  ${file} : ${added.get(file)} lignes retirées`);
  }

  log("");
  log("Retapez-le de mémoire, sans notes ni journal de prédictions. Puis :");
  log(`  ai-learn verify ${phase.id} --revisit      # preuve`);
  log(`  ai-learn revisit ${phase.id} --giveup      # abandon : vos fichiers reviennent tels qu'avant`);
}

function giveUpRevisit({ dir, phaseId }) {
  const manifest = readJson(manifestPath(dir, phaseId), null);
  const current = revisitStatus(dir);

  if (current.state === "none") {
    fail(`Aucune revisite à abandonner pour la phase ${phaseId}.`);
  }

  if (current.lock && current.lock.phaseId !== phaseId) {
    fail(`La revisite en cours concerne la phase ${current.lock.phaseId} : \`ai-learn revisit ${current.lock.phaseId} --giveup\`.`);
  }

  if (!Array.isArray(manifest)) {
    // Without a backup nothing can be restored, but the lock must still be
    // liftable — otherwise every ordinary `verify` stays refused.
    clearRevisit(dir, phaseId);
    log(`Verrou levé, mais la sauvegarde de la phase ${phaseId} est introuvable — rien n'a pu être restauré. Vérifiez vos fichiers avec \`git status\` / \`git checkout\`.`);
    return;
  }

  const { learnerFiles } = loadGuardConfig(dir);

  for (const { path: file } of manifest) {
    safeTarget(dir, file, learnerFiles);
  }

  for (const { path: file, existed } of manifest) {
    const target = path.join(dir, file);

    if (existed) {
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.copyFileSync(path.join(revisitBackupDir(dir, phaseId), "files", file), target);
    } else {
      fs.rmSync(target, { force: true });
    }
  }

  const { config } = readProgress(dir);
  const phase = findPhase(config, phaseId);

  if (current.lock && current.lock.reviewAfterDays && phase && phase.reviewAfterDays !== current.lock.reviewAfterDays) {
    setPhaseReviewAfterDays(dir, phaseId, current.lock.reviewAfterDays);
  }

  const { writeEvidence } = require("./verify");
  const generatedAt = new Date().toISOString();

  writeEvidence(dir, {
    generatedAt,
    lastProvenAt: null,
    revisit: "abandon",
    project: config && config.project,
    phaseId,
    phaseName: phase ? phase.name : null,
    checkpoint: phase ? phase.checkpoint : null,
    ok: false,
    marking: "skipped",
  });

  clearRevisit(dir, phaseId);
  log(`Revisite abandonnée — ${manifest.length} fichier(s) restauré(s) à l'identique. La phase ${phaseId} reste done ; l'abandon est tracé dans l'évidence.`);
}

// Lifts the lock and drops the backup — after a green `verify --revisit`, or a
// restored `--giveup`.
function clearRevisit(dir, phaseId) {
  fs.rmSync(revisitLockPath(dir), { force: true });
  fs.rmSync(revisitBackupDir(dir, phaseId), { recursive: true, force: true });
}

// What `verify --revisit` requires before running anything. Returns the lock;
// fails with the reason otherwise.
function requireActiveRevisit(dir, phaseId) {
  const current = revisitStatus(dir);

  if (current.state === "none") {
    fail(`Une revisite sans retrait ne prouve rien — lancez d'abord \`ai-learn revisit ${phaseId}\`.`);
  }

  if (current.state === "orphan") {
    const id = current.lock ? current.lock.phaseId : phaseId;
    fail(`La revisite est interrompue (${current.reason}) — résolvez-la : \`ai-learn revisit ${id} --giveup\`.`);
  }

  if (current.lock.phaseId !== phaseId) {
    fail(`La revisite en cours concerne la phase ${current.lock.phaseId} : \`ai-learn verify ${current.lock.phaseId} --revisit\`.`);
  }

  return current.lock;
}

// A plain `verify` (or `--stale`) on a half-removed tree would turn red and
// demote the phase; the revisit has to end first.
function refuseDuringRevisit(dir) {
  const current = revisitStatus(dir);

  if (current.state !== "none") {
    const id = current.lock ? current.lock.phaseId : "<id>";
    fail(`Une revisite est en cours (phase ${id}) : un verify ordinaire démontrerait la phase sur un code retiré. Terminez avec \`ai-learn verify ${id} --revisit\` ou \`ai-learn revisit ${id} --giveup\`.`);
  }
}

// A green revisit: the retyped code stays, the interval doubles (capped at 60
// days, never lowered).
function completeRevisit(dir, phaseId) {
  const { config } = readProgress(dir);
  const phase = findPhase(config, phaseId);

  clearRevisit(dir, phaseId);

  if (phase && Number.isInteger(phase.reviewAfterDays) && phase.reviewAfterDays > 0) {
    const days = phase.reviewAfterDays;
    setPhaseReviewAfterDays(dir, phaseId, Math.max(days, Math.min(60, days * 2)));
  }
}

// The first line `status` and `next` print while a revisit is pending, or null.
function revisitNotice(dir) {
  const current = revisitStatus(dir);

  if (current.state === "none") {
    return null;
  }

  const id = current.lock ? current.lock.phaseId : "<id>";

  if (current.state === "orphan") {
    return `⚠ Revisite interrompue (${current.reason}) — vos fichiers peuvent être incomplets : \`ai-learn revisit ${id} --giveup\` les restaure.`;
  }

  return `Revisite en cours — phase ${id} : retapez de mémoire le code retiré, puis \`ai-learn verify ${id} --revisit\` (ou \`ai-learn revisit ${id} --giveup\`).`;
}

function revisitCommand({ dir, phaseId, giveup = false }) {
  if (giveup) {
    giveUpRevisit({ dir, phaseId });
    return;
  }

  startRevisit({ dir, phaseId });
}

module.exports = {
  revisitCommand,
  revisitStatus,
  revisitNotice,
  requireActiveRevisit,
  refuseDuringRevisit,
  completeRevisit,
  revisitLockPath,
  revisitBackupDir,
};
