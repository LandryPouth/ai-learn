"use strict";

// The prediction journal's data layer (story 01.03). `.ai-learn/predictions.json`
// is the source of truth once it exists and is valid; `docs/plans/predictions.md`
// becomes a render of it, same "generated unless customized" convention as
// AGENTS.md (update.js#PROTOCOL_MARKER) and the solutions README
// (guard.js#renderSolutionsReadme). A project with no predictions.json yet keeps
// being counted from its hand-typed `.md` — see check.js.

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { fail } = require("./util");
const { findPhase } = require("./progress");

const VERSION = 1;

// Story 05.01 — a prediction carries a type so `verify` can require them
// separately (`predictionsRequired: { code: 2, reality: 1 }`). Entries written
// before this story have no `type` and count as `code` — no migration needed.
const PREDICTION_TYPES = ["code", "casse", "reality", "transfert"];
const DEFAULT_PREDICTION_TYPE = "code";

// `predictionsRequired` accepts an integer (legacy: any type combined) or an
// object keyed by type. Both normalise to one shape so `verify` and `check`
// never diverge on how a requirement is read (same single-source rule as
// `predictionsReport`).
function normalizePredictionsRequired(required) {
  if (Number.isFinite(required) && required > 0) {
    return { total: required, byType: null };
  }

  if (required && typeof required === "object" && !Array.isArray(required)) {
    const byType = {};

    for (const type of PREDICTION_TYPES) {
      const count = Number.isFinite(required[type]) && required[type] > 0 ? required[type] : 0;

      if (count > 0) {
        byType[type] = count;
      }
    }

    const total = Object.values(byType).reduce((sum, count) => sum + count, 0);
    return { total, byType: total > 0 ? byType : null };
  }

  return { total: 0, byType: null };
}

function predictionTypeOf(entry) {
  return entry && PREDICTION_TYPES.includes(entry.type) ? entry.type : DEFAULT_PREDICTION_TYPE;
}

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

    if (entry.type !== undefined && !PREDICTION_TYPES.includes(entry.type)) {
      issues.push(`entries[${index}] has unknown type ${JSON.stringify(entry.type)} (expected one of ${PREDICTION_TYPES.join(", ")})`);
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

  if (!phase) {
    return null;
  }

  return normalizePredictionsRequired(phase.predictionsRequired).total || null;
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
      `- Type : ${predictionTypeOf(entry)}`,
      `- Prédiction : ${escapeField(entry.prediction)}`,
      `- Écarts : ${escapeField(entry.gaps)} — Note : ${escapeField(entry.score)}`,
      `- Points forts : ${escapeField(entry.strengths)}`,
      `- Zones de faiblesse : ${escapeField(entry.weaknesses)}`,
      `- Explication flash : ${escapeField(entry.flash)}`,
      `- Corrigé : ${escapeField(entry.corrected)}`,
      `- Corrigé par : ${escapeField(entry.correctedBy || "apprenant")}`,
      `- Révélé le : ${entry.revealedAt || "pas encore révélée"}`,
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

const REVEAL_FIELDS = ["gaps", "score", "strengths", "weaknesses", "flash", "corrected"];
const VALID_CORRECTED_BY = ["apprenant", "IA"];

// Records one entry and (re)renders the `.md` from it in the same call. With no
// feedback field it is the first step (unrevealed); `revealPrediction` is the
// second. Feedback given here is the legacy one-step form (`at == revealedAt`).
function recordPrediction(dir, config, fields) {
  if (!findPhase(config, fields.phaseId)) {
    fail(`Phase ${fields.phaseId} introuvable dans progress.json — impossible d'y enregistrer une prédiction.`);
  }

  if (!fields.prediction) {
    fail('predict requires --prediction "<text>"');
  }

  const correctedBy = fields.correctedBy || "apprenant";

  if (!VALID_CORRECTED_BY.includes(correctedBy)) {
    fail(`--corrected-by must be one of ${VALID_CORRECTED_BY.join(", ")}, got: ${correctedBy}`);
  }

  const type = fields.type || DEFAULT_PREDICTION_TYPE;

  if (!PREDICTION_TYPES.includes(type)) {
    fail(`--type must be one of ${PREDICTION_TYPES.join(", ")}, got: ${type}`);
  }

  const existing = readPredictions(dir);

  if (existing.exists && !existing.valid) {
    fail(`predictions.json is corrupted, refusing to append to it: ${existing.issues.join("; ")}`);
  }

  const data = existing.data || { version: VERSION, entries: [] };
  const now = new Date().toISOString();
  // Two steps (story 09.03): a bare prediction is stored unrevealed, so its
  // `at` provably precedes the reveal. Any feedback field makes it the legacy
  // one-step form (`at == revealedAt`), which `check` reports as after-the-fact.
  const oneStep = REVEAL_FIELDS.some((key) => fields[key]);
  const entry = {
    id: crypto.randomUUID(),
    phaseId: fields.phaseId,
    at: now,
    type,
    prediction: fields.prediction,
    gaps: fields.gaps || null,
    score: fields.score || null,
    strengths: fields.strengths || null,
    weaknesses: fields.weaknesses || null,
    flash: fields.flash || null,
    corrected: fields.corrected || null,
    correctedBy,
    revealedAt: oneStep ? now : undefined,
  };

  data.entries.push(entry);
  fs.mkdirSync(path.dirname(predictionsPath(dir)), { recursive: true });
  fs.writeFileSync(predictionsPath(dir), `${JSON.stringify(data, null, 2)}\n`);

  const render = syncJournalRender(dir, config, data);
  return { entry, render };
}

// Completes a prediction recorded earlier: stamps `revealedAt` and stores the
// feedback. Unknown id → fail before touching the file.
function revealPrediction(dir, config, id, fields) {
  const existing = readPredictions(dir);

  if (!existing.exists || !existing.valid) {
    fail(`No usable predictions.json to reveal ${id} in${existing.issues.length ? `: ${existing.issues.join("; ")}` : ""}.`);
  }

  const entry = existing.data.entries.find((candidate) => candidate.id === id);

  if (!entry) {
    fail(`No prediction ${id} in predictions.json.`);
  }

  if (fields.correctedBy && !VALID_CORRECTED_BY.includes(fields.correctedBy)) {
    fail(`--corrected-by must be one of ${VALID_CORRECTED_BY.join(", ")}, got: ${fields.correctedBy}`);
  }

  if (entry.revealedAt) {
    fail(`Prediction ${id} is already revealed — a reveal is final.`);
  }

  const missing = REVEAL_FIELDS.filter((key) => key !== "corrected" && !fields[key]);

  if (missing.length > 0) {
    fail(`predict --reveal needs the full feedback; missing: ${missing.map((key) => `--${key}`).join(", ")}.`);
  }

  for (const key of REVEAL_FIELDS) {
    if (fields[key]) {
      entry[key] = fields[key];
    }
  }

  if (fields.correctedBy) {
    entry.correctedBy = fields.correctedBy;
  }

  entry.revealedAt = new Date().toISOString();
  fs.writeFileSync(predictionsPath(dir), `${JSON.stringify(existing.data, null, 2)}\n`);

  return { entry, render: syncJournalRender(dir, config, existing.data) };
}

// Story 01.04 — the single source `verify` and `check` both consume so a
// phase never gets two diverging verdicts about the same count (plan.md
// Decisions). Retro-compat is load-bearing here: a project that never
// adopted 01.03 (no predictions.json on disk at all) reports `missing: 0`
// unconditionally — this mechanism only bites once a project has real
// prediction data, never on legacy projects with just the `.md`.
//
// A corrupted predictions.json is treated as present-but-untrustworthy, not
// absent: `check` already hard-errors on it project-wide, and letting it
// silently disable the gate here would make deleting/corrupting the file an
// easy way to dodge a `predictionsRequired` block.
//
// Antériorité (`at > revealedAt`) is reported, never blocking — see plan.md:
// the field is agent-declared, not observed by the tool.
// `predictions` is optional: a caller that already called `readPredictions(dir)`
// itself (check.js, once per project, before looping over phases) passes it
// through here instead of paying for a second disk read + JSON.parse per
// phase that requires predictions. Omitted, this reads it itself — the shape
// every existing caller (verify.js, the unit tests) relies on.
function predictionsReport({ dir, phase, predictions }) {
  const requirement = normalizePredictionsRequired(phase.predictionsRequired);
  const required = requirement.total;
  const emptyTypeCounts = {};
  const resolved = predictions || readPredictions(dir);

  if (!resolved.exists) {
    return {
      required,
      count: 0,
      missing: 0,
      requiredByType: requirement.byType,
      countByType: emptyTypeCounts,
      missingByType: {},
      corrupted: false,
      anomalies: [],
    };
  }

  if (!resolved.valid) {
    return {
      required,
      count: 0,
      missing: required,
      requiredByType: requirement.byType,
      countByType: emptyTypeCounts,
      missingByType: missingPerType(requirement.byType, emptyTypeCounts),
      corrupted: true,
      issues: resolved.issues,
      anomalies: [],
    };
  }

  const entries = resolved.data.entries.filter((entry) => entry.phaseId === phase.id);
  const count = entries.length;
  const countByType = {};

  for (const entry of entries) {
    const type = predictionTypeOf(entry);
    countByType[type] = (countByType[type] || 0) + 1;
  }

  const missingByType = missingPerType(requirement.byType, countByType);
  const missing = requirement.byType
    ? Object.values(missingByType).reduce((sum, gap) => sum + gap.missing, 0)
    : Math.max(0, required - count);

  const anomalies = entries
    .filter((entry) => entry.revealedAt && entry.at > entry.revealedAt)
    .map((entry) => ({ id: entry.id, at: entry.at, revealedAt: entry.revealedAt }));

  return { required, count, missing, requiredByType: requirement.byType, countByType, missingByType, corrupted: false, anomalies };
}

// Story 05.01 — only types the phase actually requires are reported, and only
// when short: `{ reality: { expected: 1, actual: 0, missing: 1 } }`. A legacy
// integer requirement has `byType: null` and no per-type gap at all.
function missingPerType(requiredByType, countByType) {
  if (!requiredByType) {
    return {};
  }

  const gaps = {};

  for (const [type, expected] of Object.entries(requiredByType)) {
    const actual = countByType[type] || 0;

    if (actual < expected) {
      gaps[type] = { expected, actual, missing: expected - actual };
    }
  }

  return gaps;
}

// Story 09.07 — « À revoir » : the flash notes of the most recent revealed
// predictions the learner scored under 7/10. A deterministic threshold, not a
// grouping of free-text weaknesses (they never repeat word for word).
const REVIEW_BELOW = 7;
const REVIEW_MAX = 3;

function predictionsToReview(dir) {
  const read = readPredictions(dir);

  if (!read.valid) {
    return [];
  }

  return read.data.entries
    .filter((entry) => entry.revealedAt && entry.flash)
    .map((entry) => ({ entry, score: Number.parseFloat(String(entry.score || "").split("/")[0]) }))
    .filter(({ score }) => Number.isFinite(score) && score < REVIEW_BELOW)
    .sort((a, b) => Date.parse(b.entry.revealedAt) - Date.parse(a.entry.revealedAt))
    .slice(0, REVIEW_MAX)
    .map(({ entry }) => ({ phaseId: entry.phaseId, flash: entry.flash }));
}

// Shared by `verify` and `check` so a phase's missing-predictions warning
// never reads different counts in two places (plan.md Decisions) — the one
// divergence this story exists to close. A ventilated requirement names the
// short type with its real/expected count, so "which prediction is missing"
// is never left to guesswork.
function formatPredictionsGap(phase, report) {
  const base = `phase ${phase.id}: ${report.count}/${report.required} prédictions enregistrées ; ${report.missing} manquante(s)`;
  const details = Object.entries(report.missingByType || {})
    .map(([type, gap]) => `${type} ${gap.actual}/${gap.expected}`)
    .join(", ");

  return details ? `${base} (${details})` : base;
}

module.exports = {
  VERSION,
  GENERATED_MARKER,
  PREDICTION_TYPES,
  DEFAULT_PREDICTION_TYPE,
  normalizePredictionsRequired,
  predictionTypeOf,
  predictionsPath,
  journalPath,
  readPredictions,
  ensurePredictionsFile,
  countByPhase,
  countIATyped,
  recordPrediction,
  revealPrediction,
  renderJournal,
  predictionsReport,
  formatPredictionsGap,
  predictionsToReview,
};
