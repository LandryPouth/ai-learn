"use strict";

// The prediction journal's data layer (story 01.03). `.ai-learn/predictions.json`
// is the source of truth once it exists and is valid; `docs/plans/predictions.md`
// becomes a render of it, same "generated unless customized" convention as
// AGENTS.md (update.js#PROTOCOL_MARKER) and the solutions README
// (guard.js#SOLUTIONS_README). A project with no predictions.json yet keeps
// being counted from its hand-typed `.md` — see check.js.

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { fail } = require("./util");
const { findPhase } = require("./progress");

const VERSION = 1;

// The exact first line `init` writes (mirrored from templates/predictions.md).
// A predictions.md that doesn't start with it is treated as customized and is
// never regenerated — same rule `guard.js`/`update.js` already apply elsewhere.
const GENERATED_MARKER = "# Journal de prédictions";

function predictionsPath(dir) {
  return path.join(dir, ".ai-learn", "predictions.json");
}

function journalPath(dir) {
  return path.join(dir, "docs", "plans", "predictions.md");
}

function templatePath() {
  return path.join(__dirname, "..", "..", "templates", "predictions.md");
}

function validatePredictionsData(data) {
  const issues = [];

  if (!data || typeof data !== "object" || Array.isArray(data)) {
    issues.push("predictions.json must be a JSON object");
    return issues;
  }

  if (data.version !== VERSION) {
    issues.push(`unknown version ${JSON.stringify(data.version)} (expected ${VERSION})`);
  }

  if (!Array.isArray(data.entries)) {
    issues.push('"entries" must be an array');
    return issues;
  }

  data.entries.forEach((entry, index) => {
    if (!entry || typeof entry !== "object") {
      issues.push(`entries[${index}] must be an object`);
      return;
    }

    if (typeof entry.id !== "string" || !entry.id) {
      issues.push(`entries[${index}] is missing "id"`);
    }

    if (!Number.isFinite(entry.phaseId)) {
      issues.push(`entries[${index}] is missing a numeric "phaseId"`);
    }

    if (typeof entry.at !== "string" || !entry.at) {
      issues.push(`entries[${index}] is missing an "at" timestamp`);
    }
  });

  return issues;
}

// Three distinct states, never conflated: missing (fall back to the legacy
// `.md`, silently — that is the normal case for every pre-existing project),
// corrupted (exists but invalid — `check` must say so, never fall back
// quietly), and valid (this is now the source of truth). See check.js.
function readPredictions(dir) {
  const filePath = predictionsPath(dir);

  if (!fs.existsSync(filePath)) {
    return { exists: false, valid: false, data: null, issues: [] };
  }

  let raw;

  try {
    raw = JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    return { exists: true, valid: false, data: null, issues: [`not valid JSON: ${error.message}`] };
  }

  const issues = validatePredictionsData(raw);
  return { exists: true, valid: issues.length === 0, data: issues.length === 0 ? raw : null, issues };
}

function ensurePredictionsFile(dir) {
  const filePath = predictionsPath(dir);

  if (fs.existsSync(filePath)) {
    return { created: false };
  }

  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify({ version: VERSION, entries: [] }, null, 2)}\n`);
  return { created: true };
}

function countByPhase(entries) {
  const counts = {};

  for (const entry of entries) {
    counts[entry.phaseId] = (counts[entry.phaseId] || 0) + 1;
  }

  return counts;
}

function countIATyped(entries) {
  return entries.filter((entry) => entry.correctedBy === "IA").length;
}

// A line-leading `#` in reported free text would fabricate a markdown heading
// (a fake `### Phase N — prédiction` entry) once rendered — this is the only
// place untrusted agent-written text reaches a file `check`/`next` later
// parse structurally. Escaping it, and folding embedded newlines to keep each
// field a single bullet line, are the two ways that text could otherwise
// break the render (story 01.03 edge case).
function escapeField(value) {
  return String(value ?? "")
    .replace(/\r\n/g, " ")
    .replace(/\n/g, " ")
    .replace(/^#/gm, "\\#");
}

function phaseRequiredTotal(config, phaseId) {
  const phase = findPhase(config, phaseId);
  return phase && Number.isFinite(phase.predictionsRequired) && phase.predictionsRequired > 0
    ? phase.predictionsRequired
    : null;
}

// Renders the full file: the template's own header (title, Format, Règles —
// unchanged, still the documentation a human reads) followed by the recorded
// entries, chronological, in the exact per-entry format that header
// describes — so nothing changes at reading time, only who writes it.
function renderJournal(dir, config, data) {
  const header = fs.readFileSync(templatePath(), "utf8").trimEnd();
  const entries = [...data.entries].sort((a, b) => a.at.localeCompare(b.at));
  const seenPerPhase = {};

  const blocks = entries.map((entry) => {
    seenPerPhase[entry.phaseId] = (seenPerPhase[entry.phaseId] || 0) + 1;
    const total = phaseRequiredTotal(config, entry.phaseId) || seenPerPhase[entry.phaseId];

    return [
      `### Phase ${entry.phaseId} — prédiction ${seenPerPhase[entry.phaseId]}/${total}`,
      `- Prédiction : ${escapeField(entry.prediction)}`,
      `- Écarts : ${escapeField(entry.gaps)} — Note : ${escapeField(entry.score)}`,
      `- Points forts : ${escapeField(entry.strengths)}`,
      `- Zones de faiblesse : ${escapeField(entry.weaknesses)}`,
      `- Explication flash : ${escapeField(entry.flash)}`,
      `- Corrigé : ${escapeField(entry.corrected)}`,
      `- Corrigé par : ${escapeField(entry.correctedBy || "apprenant")}`,
      `- Révélé le : ${entry.revealedAt || entry.at}`,
    ].join("\n");
  });

  const generated = [
    "<!-- Généré par ai-learn depuis .ai-learn/predictions.json — ne pas éditer cette section à la main. -->",
    ...blocks,
  ].join("\n\n");

  return `${header}\n\n${generated}\n`;
}

// Regenerates docs/plans/predictions.md, unless it has been customized (does
// not start with GENERATED_MARKER) — same non-destructive stance as
// update.js#syncProtocol / guard.js#ensureGuardHook. Never called from
// `check` (read-only); only the record path below triggers a render.
function syncJournalRender(dir, config, data) {
  const target = journalPath(dir);
  const existing = fs.existsSync(target) ? fs.readFileSync(target, "utf8") : null;
  const isGenerated = existing === null || existing.trimStart().startsWith(GENERATED_MARKER);

  if (!isGenerated) {
    return { action: "kept-customized" };
  }

  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, renderJournal(dir, config, data));
  return { action: existing === null ? "created" : "refreshed" };
}

const VALID_CORRECTED_BY = ["apprenant", "IA"];

// Records one entry and (re)renders the `.md` from it in the same call — the
// command an agent runs "at the moment of the protocol" (story goal), not a
// two-step API. `at`/`revealedAt` are both stamped "now": this story stores
// both fields faithfully (schema below) but does not itself demonstrate a
// gap between them — story 01.04 is what will make that gap meaningful, by
// calling this at prediction time and again at reveal time.
function recordPrediction(dir, config, fields) {
  if (!findPhase(config, fields.phaseId)) {
    fail(`No phase ${fields.phaseId} in progress.json — cannot record a prediction for it.`);
  }

  if (!fields.prediction) {
    fail('predict requires --prediction "<text>"');
  }

  const correctedBy = fields.correctedBy || "apprenant";

  if (!VALID_CORRECTED_BY.includes(correctedBy)) {
    fail(`--corrected-by must be one of ${VALID_CORRECTED_BY.join(", ")}, got: ${correctedBy}`);
  }

  const existing = readPredictions(dir);

  if (existing.exists && !existing.valid) {
    fail(`predictions.json is corrupted, refusing to append to it: ${existing.issues.join("; ")}`);
  }

  const data = existing.data || { version: VERSION, entries: [] };
  const now = new Date().toISOString();
  const entry = {
    id: crypto.randomUUID(),
    phaseId: fields.phaseId,
    at: now,
    prediction: fields.prediction,
    gaps: fields.gaps || null,
    score: fields.score || null,
    strengths: fields.strengths || null,
    weaknesses: fields.weaknesses || null,
    flash: fields.flash || null,
    corrected: fields.corrected || null,
    correctedBy,
    revealedAt: now,
  };

  data.entries.push(entry);
  fs.mkdirSync(path.dirname(predictionsPath(dir)), { recursive: true });
  fs.writeFileSync(predictionsPath(dir), `${JSON.stringify(data, null, 2)}\n`);

  const render = syncJournalRender(dir, config, data);
  return { entry, render };
}

module.exports = {
  VERSION,
  GENERATED_MARKER,
  predictionsPath,
  journalPath,
  readPredictions,
  ensurePredictionsFile,
  countByPhase,
  countIATyped,
  recordPrediction,
  renderJournal,
};
