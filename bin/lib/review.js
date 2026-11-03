"use strict";

// `ai-learn review [--defects K] [--decoys M] | --reveal | --giveup` — story
// 12.03. The tool writes a plausible diff on a COPY of the learner's code:
// hidden defects (the `faults` bank, then the pack's mutators) mixed with
// harmless rewrites (`NEUTRAL_TRANSFORMS`). The learner reviews it; the tool
// counts found, missed and falsely flagged. Sites live in
// `~/.ai-learn/katas/`, outside the project, and the guard closes the kata to
// the AI while it is active. `src/**` is never modified.

const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { log, fail, readJson, writeJson, normalizePortable } = require("./util");
const { readProgress, missingProgressMessage, latestEvidenceForPhase } = require("./progress");
const { findAllSites, findSitesInFiles } = require("./mutate");
const { resolveSource, selectFiles, isLearnerCode } = require("./review-source");
const { allFileLines } = require("./citation");
const { loadGuardConfig, MODE_DIRIGEANT } = require("./guard");
const { projectId, readIncident } = require("./incident");
const { projectKey, assertWritable } = require("./tracks/store");
const { recordReviewKata } = require("./tracks/review");
const faults = require("./faults");

const DEFECTS_RANGE = [2, 4];
const DECOYS_RANGE = [3, 6];
// Tier 2 needs enough harmless lines to make a false positive possible.
const MIN_DECOYS_FOR_TIER_2 = 2;
const MAX_DEFECTS = 6;
const MAX_DECOYS = 10;
const LINE_TOLERANCE = 1;
const CONTEXT = 3;

function statePath(dir) {
  return path.join(dir, ".ai-learn", "kata.json");
}

function kataDir(dir, id) {
  return path.join(dir, "katas", id);
}

function secretPath(dir, id, { home = os.homedir() } = {}) {
  return path.join(home, ".ai-learn", "katas", `${projectId(dir)}-${id}.json`);
}

function offerPath(dir, { home = os.homedir() } = {}) {
  return path.join(home, ".ai-learn", "kata-offers", `${projectId(dir)}.json`);
}

function readKata(dir) {
  return readJson(statePath(dir), null);
}

// Only the public facts of a kata (never a site, never K or M).
function kataFact(dir) {
  const state = readKata(dir);
  return state && state.active ? { active: true, id: state.id, startedAt: state.startedAt } : { active: false };
}

function kataNotice(dir) {
  const kata = kataFact(dir);

  return kata.active
    ? `⚠ Kata de revue actif : relis katas/${kata.id}/kata.diff dans ton éditeur, note chaque défaut trouvé dans katas/${kata.id}/revue.md (\`- fichier:ligne — raison\`), puis \`ai-learn review --reveal\` (ou \`--giveup\`).`
    : null;
}

// A phase tagged `kata: true` offers a kata on the learner's code, `kata:
// "<path>"` one on that path (story 12.04).
function doneProofs(dir, phases) {
  return phases
    .filter((phase) => phase && phase.status === "done" && (phase.kata === true || (typeof phase.kata === "string" && phase.kata.trim() !== "")))
    .map((phase) => ({ evidence: latestEvidenceForPhase(dir, phase.id), from: typeof phase.kata === "string" ? phase.kata.trim() : null }))
    .filter(({ evidence }) => evidence && typeof evidence.generatedAt === "string")
    .map(({ evidence, from }) => ({ at: evidence.generatedAt, from }))
    .sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));
}

// Whether `next` should hand the learner a kata now: a phase tagged `kata` was
// just proven. Once per proof — the marker lives outside the project, so
// asking again never offers a second kata for the same proof.
function kataOffer(dir, { home = os.homedir() } = {}) {
  const { config } = readProgress(dir);
  const phases = config && Array.isArray(config.phases) ? config.phases : [];
  const proofs = doneProofs(dir, phases);
  const incident = readIncident(dir);

  if (proofs.length === 0 || kataFact(dir).active || (incident && incident.active) || loadGuardConfig(dir).mode === MODE_DIRIGEANT) {
    return null;
  }

  const { at: proofAt, from } = proofs[proofs.length - 1];
  const marker = readJson(offerPath(dir, { home }), null);

  if (marker && marker.proofAt === proofAt) {
    return null;
  }

  writeJson(offerPath(dir, { home }), { proofAt, offeredAt: new Date().toISOString() });
  return { from };
}

function kataDue(dir, options) {
  return kataOffer(dir, options) !== null;
}

function boundedInt(value, name, min, max) {
  if (!Number.isInteger(value) || value < min || value > max) {
    fail(`${name} doit être un entier entre ${min} et ${max}.`);
  }

  return value;
}

function assertPreconditions(dir) {
  const { config, exists } = readProgress(dir);

  if (!exists || !config) {
    fail(missingProgressMessage(dir));
  }

  if (!(config.phases || []).some((phase) => phase && phase.status === "done")) {
    fail("Aucune phase terminée : termine et prouve au moins une phase avant un kata de revue.");
  }

  if (kataFact(dir).active) {
    fail("Un kata est déjà actif : termine-le (`ai-learn review --reveal`) ou abandonne-le (`ai-learn review --giveup`).");
  }

  const incident = readIncident(dir);

  if (incident && incident.active) {
    fail("Un incident est actif : répare-le (`ai-learn break --resolve`) avant un kata de revue.");
  }

  if (loadGuardConfig(dir).mode === MODE_DIRIGEANT) {
    fail("Pas de kata en mode dirigeant : l'IA y écrit l'implémentation. Repasse en apprenti (`ai-learn mode apprenti`).");
  }
}

function pickOne(candidates, random) {
  return candidates.splice(Math.min(candidates.length - 1, Math.floor(random() * candidates.length)), 1)[0];
}

// Draws up to `count` sites, one per line, none on a taken line. A site that
// would change the line count, change nothing or read like a typo is skipped.
function draw(candidates, count, taken, random) {
  const pool = candidates.slice();
  const drawn = [];

  while (drawn.length < count && pool.length > 0) {
    const site = pickOne(pool, random);
    const key = `${site.file.rel}:${site.line}`;
    const after = site.mutate(site.matchedText);

    if (taken.has(key) || after === site.matchedText || after.includes("\n") || site.matchedText.includes("\n") || (site.rejects && site.rejects())) {
      continue;
    }

    taken.add(key);
    drawn.push({ site, after });
  }

  return drawn;
}

// `sitesOf(bank)` is the learner's code, or the foreign files of `--from`.
function drawDefects(sitesOf, count, taken, random) {
  const faults = draw(sitesOf("faults"), count, taken, random);
  const rest = count - faults.length;

  return rest > 0 ? [...faults, ...draw(sitesOf("mutators"), rest, taken, random)] : faults;
}

function describe(operator, kind) {
  const bank = kind === "decoy" ? faults.NEUTRAL_TRANSFORMS : faults.FAULT_OPERATORS;
  const entry = bank[operator];

  return entry ? { label: entry.label, mechanism: entry.mechanism } : { label: operator, mechanism: "Un opérateur de mutation du pack : le comportement change sans que le code ait l'air faux." };
}

function applyChanges(original, changes) {
  return [...changes]
    .sort((a, b) => b.site.index - a.site.index)
    .reduce((text, { site, after }) => text.slice(0, site.index) + after + text.slice(site.index + site.length), original);
}

// Unified diff of line-for-line substitutions: one hunk per group of changes
// closer than twice the context, line numbers those of the "after" file.
function fileDiff(rel, original, after, lines) {
  const before = original.split("\n");
  const now = after.split("\n");
  const total = original.endsWith("\n") ? before.length - 1 : before.length;
  const sorted = [...new Set(lines)].sort((a, b) => a - b);
  const groups = [];

  for (const line of sorted) {
    const last = groups[groups.length - 1];

    if (last && line - last[last.length - 1] <= CONTEXT * 2) {
      last.push(line);
    } else {
      groups.push([line]);
    }
  }

  const out = [`--- a/${rel}`, `+++ b/${rel}`];

  for (const group of groups) {
    const start = Math.max(1, group[0] - CONTEXT);
    const end = Math.min(total, group[group.length - 1] + CONTEXT);
    out.push(`@@ -${start},${end - start + 1} +${start},${end - start + 1} @@`);

    for (let line = start; line <= end; line += 1) {
      const marker = line === total && !original.endsWith("\n") ? ["\\ No newline at end of file"] : [];

      if (group.includes(line)) {
        out.push(`-${before[line - 1]}`, ...marker, `+${now[line - 1]}`, ...marker);
      } else {
        out.push(` ${before[line - 1]}`, ...marker);
      }
    }
  }

  return out.join("\n");
}

function buildDiff(changes) {
  const byFile = new Map();

  for (const change of changes) {
    const entry = byFile.get(change.site.file.rel) || { original: change.site.original, changes: [] };
    entry.changes.push(change);
    byFile.set(change.site.file.rel, entry);
  }

  return [...byFile.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([rel, { original, changes: list }]) => fileDiff(rel, original, applyChanges(original, list), list.map((c) => c.site.line)))
    .join("\n");
}

const TEMPLATE = [
  "# Revue",
  "",
  "Relis `kata.diff` comme tu relirais le diff d'une IA avant de l'accepter.",
  "Une ligne par défaut trouvé : `- fichier:ligne — raison`.",
  "Signaler une ligne inoffensive compte comme un faux positif.",
  "",
  "",
].join("\n");

// The foreign files of `--from`, `foreign: false` when the path is the learner's own code.
function sourceOf(dir, from, home) {
  const source = resolveSource(from, dir, home);

  return { ...selectFiles(source), foreign: !isLearnerCode(dir, source.abs) };
}

function siteRecord({ site, after }, kind) {
  return { file: site.file.rel, line: site.line, operator: site.operator, matched: site.matchedText, after, ...describe(site.operator, kind) };
}

// Unless asked, K and M are drawn in a range so the number of changed lines
// never gives the number of defects away.
function reviewCommand({ dir, defects, decoys, from, home = os.homedir(), random = Math.random }) {
  const wanted = boundedInt(defects === undefined ? DEFECTS_RANGE[0] + Math.floor(random() * (DEFECTS_RANGE[1] - DEFECTS_RANGE[0] + 1)) : defects, "--defects", 1, MAX_DEFECTS);
  const wantedDecoys = boundedInt(decoys === undefined ? DECOYS_RANGE[0] + Math.floor(random() * (DECOYS_RANGE[1] - DECOYS_RANGE[0] + 1)) : decoys, "--decoys", 0, MAX_DECOYS);

  assertPreconditions(dir);

  const foreign = from === undefined ? null : sourceOf(dir, from, home);
  const sitesOf = foreign ? (bank) => findSitesInFiles(dir, foreign.files, foreign.language, { bank }) : (bank) => findAllSites(dir, { bank: bank === "mutators" ? undefined : bank });
  const taken = new Set();
  const chosenDefects = drawDefects(sitesOf, wanted, taken, random);

  if (chosenDefects.length < wanted) {
    fail(`Seulement ${chosenDefects.length} défaut(s) possible(s) dans ton code, ${wanted} demandé(s) : écris plus de code ou baisse --defects.`);
  }

  const chosenDecoys = draw(sitesOf("neutral"), wantedDecoys, taken, random);
  const id = crypto.randomUUID().slice(0, 8);
  const startedAt = new Date().toISOString();
  const secret = { id, dir: projectKey(dir), startedAt, ...(foreign ? { from: String(from).trim(), foreign: foreign.foreign } : {}), defects: chosenDefects.map((c) => siteRecord(c, "defect")), decoys: chosenDecoys.map((c) => siteRecord(c, "decoy")) };
  const target = secretPath(dir, id, { home });

  assertWritable(target);
  writeJson(target, secret);
  fs.chmodSync(target, 0o600);
  fs.mkdirSync(kataDir(dir, id), { recursive: true });
  fs.writeFileSync(path.join(kataDir(dir, id), "kata.diff"), `${foreign ? `Source : ${String(from).trim()}\n` : ""}${buildDiff([...chosenDefects, ...chosenDecoys])}\n`);
  fs.writeFileSync(path.join(kataDir(dir, id), "revue.md"), foreign ? TEMPLATE.replace("\n\n", `\n\nSource : ${String(from).trim()}\n\n`) : TEMPLATE);
  writeJson(statePath(dir), { active: true, id, startedAt });

  log("Kata de revue prêt. Ce diff vient d'une IA : certaines lignes cachent des défauts, d'autres sont inoffensives.");
  log("");
  log(`  1. Ouvre katas/${id}/kata.diff dans ton éditeur (l'IA ne le lit pas).`);
  log(`  2. Note chaque défaut trouvé dans katas/${id}/revue.md : \`- fichier:ligne — raison\`.`);
  log("  3. Lance `ai-learn review --reveal` (ou `--giveup` pour abandonner).");
}

function requireActive(dir) {
  const state = readKata(dir);

  if (!state || !state.active) {
    fail("Aucun kata actif. Lance-en un avec `ai-learn review`.");
  }

  return state;
}

function readSecret(dir, id, home) {
  const secret = readJson(secretPath(dir, id, { home }), null);

  if (!secret || !Array.isArray(secret.defects) || !Array.isArray(secret.decoys)) {
    fail("Le secret du kata est introuvable (~/.ai-learn/katas/) : abandonne-le avec `ai-learn review --giveup`.");
  }

  return secret;
}

function closeKata(dir, home, state, outcome, extra = {}) {
  writeJson(statePath(dir), { ...state, active: false, outcome, closedAt: new Date().toISOString(), ...extra });
  fs.rmSync(secretPath(dir, state.id, { home }), { force: true });
}

function parseCitation(citation) {
  const [, file, line] = /^(.+):(\d+)$/.exec(citation);
  // `a/` and `b/` are the diff header's prefixes, copied along with the path.
  const plain = normalizePortable(path.posix.normalize(file));

  return { files: [plain, plain.replace(/^[ab]\//, "")], line: Number(line) };
}

function distance(entry, parsed) {
  return parsed.files.includes(entry.file) ? Math.abs(parsed.line - entry.line) : Infinity;
}

// Closest entry within the tolerance, optionally among unmatched indexes only.
function closest(entries, parsed, open) {
  let best = -1;

  entries.forEach((entry, index) => {
    const d = distance(entry, parsed);

    if ((!open || open.has(index)) && d <= LINE_TOLERANCE && (best === -1 || d < distance(entries[best], parsed))) {
      best = index;
    }
  });

  return best;
}

// Two passes: a citation exactly on a line is settled first (a decoy right next
// to a defect never steals or gives it away); the ±1 tolerance only serves what
// is left. A citation on a defect is a find, on a decoy "leurre signalé".
function matchCitations(citations, secret) {
  const parsed = citations.map(parseCitation);
  const open = new Set(secret.defects.map((_, index) => index));
  const verdicts = new Array(citations.length).fill(null);
  const found = [];

  for (const tolerance of [0, LINE_TOLERANCE]) {
    parsed.forEach((p, k) => {
      if (verdicts[k]) {
        return;
      }

      const defect = closest(secret.defects, p, open);

      if (defect !== -1 && distance(secret.defects[defect], p) <= tolerance) {
        open.delete(defect);
        found.push(secret.defects[defect]);
        verdicts[k] = { found: true };
        return;
      }

      const decoy = closest(secret.decoys, p);

      if (decoy !== -1 && distance(secret.decoys[decoy], p) <= tolerance) {
        verdicts[k] = { decoy: secret.decoys[decoy] };
      }
    });
  }

  const falsePositives = parsed.map((_, k) => k).filter((k) => !verdicts[k] || !verdicts[k].found).map((k) => ({ citation: citations[k], decoy: (verdicts[k] || {}).decoy || null }));

  return { found, missed: [...open].map((i) => secret.defects[i]), falsePositives };
}

function siteLines(site) {
  return [`  ${site.file}:${site.line} — ${site.label}`, `    ${site.mechanism}`];
}

// Written once the kata is closed so the AI, which cannot keep the secret, can
// still discuss each defect after a reveal made in the learner's terminal.
function writeCorrige(dir, id, lines) {
  fs.writeFileSync(path.join(kataDir(dir, id), "corrige.md"), `# Corrigé\n\n${lines.join("\n")}\n`);
}

function revealCommand({ dir, home = os.homedir() }) {
  const state = requireActive(dir);
  const secret = readSecret(dir, state.id, home);
  const file = path.join(kataDir(dir, state.id), "revue.md");
  const citations = fs.existsSync(file) ? allFileLines(fs.readFileSync(file, "utf8")) : [];

  if (citations.length === 0) {
    fail(`katas/${state.id}/revue.md ne cite aucun défaut : écris au moins une ligne \`- fichier:ligne — raison\`, ou abandonne avec \`ai-learn review --giveup\`.`);
  }

  const { found, missed, falsePositives } = matchCitations(citations, secret);
  const total = secret.defects.length;
  const garnished = secret.decoys.length >= MIN_DECOYS_FOR_TIER_2;
  const perfect = missed.length === 0 && falsePositives.length <= 1 && garnished;
  const tier3 = secret.foreign === true && found.length >= Math.ceil(total / 2) && falsePositives.length <= 1;
  const lines = [`Défauts trouvés : ${found.length}/${total}`];

  if (missed.length > 0) {
    lines.push("", "Défauts manqués :", ...missed.flatMap(siteLines));
  }

  if (falsePositives.length > 0) {
    lines.push("", "Faux positifs :");

    for (const { citation, decoy } of falsePositives) {
      lines.push(`  ${citation}${decoy ? ` — leurre signalé (${decoy.label}) : ce changement est inoffensif` : " — aucun défaut ici"}`);
    }
  }

  if (tier3) {
    lines.push("", "Palier 3 atteint : au moins la moitié des défauts trouvés sur du code d'autrui, au plus un faux positif.");
  }

  lines.push("", perfect ? "Palier 2 atteint : tous les défauts, au plus un faux positif." : garnished ? "Palier 1 atteint : un kata révélé avec une revue." : "Palier 1 seulement : trop peu de changements inoffensifs pour un faux positif (palier 2 : au moins 2).");

  // Ledger first, then close, then print: an unreadable ledger is refused with
  // the kata still active and the answers still hidden.
  recordReviewKata({ home, dir: projectKey(dir), kataId: state.id, found: found.length, total, falsePositives: falsePositives.length, tiers: [1, ...(perfect ? [2] : []), ...(tier3 ? [3] : [])] });
  closeKata(dir, home, state, "revealed", { found: found.length, total, falsePositives: falsePositives.length });
  writeCorrige(dir, state.id, [...lines, "", "Changements inoffensifs :", ...secret.decoys.map((decoy) => `  ${decoy.file}:${decoy.line} — ${decoy.label}`)]);
  lines.forEach((line) => log(line));
  log("Le kata est clos : l'IA peut maintenant le lire (katas/" + state.id + "/corrige.md) et discuter chaque défaut manqué avec toi.");
}

// Nothing to restore: a lost secret must not trap the learner in a kata.
function giveupCommand({ dir, home = os.homedir() }) {
  const state = requireActive(dir);
  const secret = readJson(secretPath(dir, state.id, { home }), null);

  if (!secret || !Array.isArray(secret.defects) || !Array.isArray(secret.decoys)) {
    closeKata(dir, home, state, "giveup");
    log("Le secret du kata est introuvable : kata abandonné sans révélation, ni score ni palier.");
    return;
  }

  const lines = ["Défauts cachés :", ...secret.defects.flatMap(siteLines), "", "Changements inoffensifs :", ...secret.decoys.map((decoy) => `  ${decoy.file}:${decoy.line} — ${decoy.label}`)];

  closeKata(dir, home, state, "giveup");
  writeCorrige(dir, state.id, lines);
  lines.forEach((line) => log(line));
  log("\nKata abandonné : ni score ni palier.");
}

module.exports = { reviewCommand, revealCommand, giveupCommand, kataFact, kataNotice, kataDue, kataOffer, readKata, statePath };
