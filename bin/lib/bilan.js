"use strict";

// The end-of-project bilan (story 10.07): `docs/bilan.md`. `verify` generates
// the factual half from data already on disk when the last phase is proven; the
// learner writes the rest. `check` verifies presence + minimum substance (marker
// gone, section non-empty, exactly one decision) — never the quality of the
// answers, same contract as the dirigeant reviews (see reviews.js).

const fs = require("fs");
const os = require("os");
const path = require("path");
const { latestEvidenceForPhase } = require("./progress");
const { readPredictions, DEFAULT_PREDICTION_TYPE } = require("./predictions");
const { readJson } = require("./util");
const { projectKey } = require("./tracks/store");

const MARKER = "<!-- à compléter";
const TO_COMPLETE = ["Encore fragile", "Erreurs marquantes", "Compromis d'architecture", "Réutilisable dans mes projets", "Recommandation"];
const DECISIONS = ["intégrer", "labo", "simplifier", "abandonner"];
const LEDGERS = [
  ["git", "git"],
  ["tests", "tests"],
  ["plateforme", "platform"],
  ["debug", "debug"],
];
const NONE = "aucune donnée";

function bilanPath(dir) {
  return path.join(dir, "docs", "bilan.md");
}

function isFinished(config) {
  return Boolean(config) && Array.isArray(config.phases) && config.phases.length > 0 && config.phases.every((phase) => phase.status === "done");
}

function line(label, value) {
  return `- ${label} : ${value}`;
}

// Tiers whose evidence names this project, per cross-project ledger.
function tiersReached(dir, home) {
  const key = projectKey(dir);

  return LEDGERS.map(([label, file]) => {
    const config = readJson(path.join(home, ".ai-learn", "tracks", `${file}.json`), null);
    const tiers = Object.entries((config && config.tiers) || {})
      .filter(([, tier]) => Array.isArray(tier && tier.evidence) && tier.evidence.some((e) => e && typeof e.project === "string" && projectKey(e.project) === key))
      .map(([id]) => id);

    return line(label, tiers.length > 0 ? `palier(s) ${tiers.join(", ")}` : NONE);
  });
}

function phaseLines(dir, config) {
  return config.phases.map((phase) => {
    const ev = latestEvidenceForPhase(dir, phase.id);
    const mutation = ev && ev.mutation && Number.isFinite(ev.mutation.score) && ev.mutation.mutants > 0 ? `mutation ${ev.mutation.score} %` : "mutation : aucune donnée";

    return line(`Phase ${phase.id} — ${phase.name}`, `${ev ? `prouvée le ${String(ev.generatedAt).slice(0, 10)}` : "preuve : aucune donnée"} ; ${mutation}`);
  });
}

function predictionLines(dir) {
  const read = readPredictions(dir);
  const entries = read.valid ? read.data.entries : [];

  if (entries.length === 0) {
    return [line("Prédictions", NONE)];
  }

  const byType = {};

  for (const entry of entries) {
    const type = entry.type || DEFAULT_PREDICTION_TYPE;
    byType[type] = (byType[type] || 0) + 1;
  }

  const counts = Object.entries(byType).map(([type, count]) => `${type} ${count}`).join(", ");
  const weaknesses = [...new Set(entries.map((entry) => entry.weaknesses).filter(Boolean))].slice(0, 5);

  return [line("Prédictions", `${entries.length} (${counts})`), ...weaknesses.map((text) => line("Zone de faiblesse", text))];
}

function incidentLines(home, dir) {
  const config = readJson(path.join(home, ".ai-learn", "tracks", "debug.json"), null);
  const key = projectKey(dir);
  const details = new Set();

  for (const tier of Object.values((config && config.tiers) || {})) {
    for (const e of (tier && tier.evidence) || []) {
      if (e && typeof e.project === "string" && projectKey(e.project) === key) {
        details.add(e.incidentId ? `${e.incidentId}${e.detail ? ` — ${e.detail}` : ""}` : String(e.detail || "incident"));
      }
    }
  }

  return details.size > 0 ? [...details].map((text) => line("Incident réparé", text)) : [line("Incidents", NONE)];
}

function generatedSection(dir, config, home) {
  return [
    "## Ce que l'outil a mesuré",
    "",
    "### Phases et preuves",
    ...phaseLines(dir, config),
    "",
    "### Paliers atteints pendant le projet",
    ...tiersReached(dir, home),
    "",
    "### Prédictions",
    ...predictionLines(dir),
    "",
    "### Incidents",
    ...incidentLines(home, dir),
  ].join("\n");
}

// Never overwrites: once it exists the bilan belongs to the learner.
function generateBilan({ dir, config, home = os.homedir() }) {
  const target = bilanPath(dir);

  if (fs.existsSync(target)) {
    return { created: false };
  }

  const progress = config || readJson(path.join(dir, "progress.json"), null);
  const template = fs.readFileSync(path.join(__dirname, "..", "..", "templates", "bilan.md"), "utf8");

  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, template.replace("{{generated}}", () => generatedSection(dir, progress, home)));

  return { created: true };
}

function sectionBody(text, title) {
  const match = new RegExp(`^## ${title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[ \\t]*\\n([\\s\\S]*?)(?=^## |(?![\\s\\S]))`, "m").exec(text);
  return match ? match[1] : null;
}

function decisionsIn(body) {
  const prose = body.replace(/<!--[\s\S]*?-->/g, "");

  return DECISIONS.filter((word) => new RegExp(`(?<![\\p{L}\\p{N}_])${word}(?![\\p{L}\\p{N}_])`, "iu").test(prose));
}

// `missing` | `incomplete` (with the issues naming each section) | `complete`.
function bilanState(dir) {
  let text;

  try {
    text = fs.readFileSync(bilanPath(dir), "utf8");
  } catch {
    return { state: "missing", decision: null, issues: ["docs/bilan.md absent — complète le bilan de fin de projet (`/learn-next`)"] };
  }

  const issues = [];
  let decision = null;

  for (const title of TO_COMPLETE) {
    const body = sectionBody(text, title);

    if (body === null) {
      issues.push(`section « ${title} » introuvable`);
    } else if (body.includes(MARKER)) {
      issues.push(`section « ${title} » encore à compléter`);
    } else if (body.replace(/<!--[\s\S]*?-->/g, "").trim() === "") {
      issues.push(`section « ${title} » vide`);
    } else if (title === "Recommandation") {
      const found = decisionsIn(body);

      if (found.length === 1) {
        decision = found[0];
      } else {
        issues.push(`« Recommandation » doit contenir exactement une décision parmi ${DECISIONS.join(", ")} (trouvé : ${found.length})`);
      }
    }
  }

  return { state: issues.length === 0 ? "complete" : "incomplete", decision: issues.length === 0 ? decision : null, issues };
}

module.exports = { MARKER, TO_COMPLETE, DECISIONS, bilanPath, isFinished, generateBilan, bilanState };
