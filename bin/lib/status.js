"use strict";

// `ai-learn status` — the single-project view: phases and their state, with the
// latest passing evidence date when one exists. Read-only.

const path = require("path");
const { log, fail, normalizePortable } = require("./util");
const { readProgress, validateProgress, latestEvidenceForPhase, phaseVerdict } = require("./progress");
const { readGitTracks, TIER_IDS } = require("./tracks/git");
const { detectDomainKey, domainSummary } = require("./tracks/domain");
const { normProject } = require("./norm");
const { loadGuardConfig } = require("./guard");
const { readTutorConfig } = require("./tutor");
const { reviewStates } = require("./reviews");
const { checkpointFilePath, computeSourceHash } = require("./source-hash");
const { printCommitReminder, uncommittedCount } = require("./commit-reminder");

// The mark and, where useful, the French label shown next to a phase —
// derived from the same verdict `check` and `next` consume, not re-derived
// from `phase.status` alone. Only `stale`/`unproven` get a label: the other
// states are already legible from the mark plus the raw status text below.
// The `stale` label names the exact command to run, same as `check`/`next` —
// spec.md's UX Note requires a périmé state to say what to do, not just note it.
function verdictDisplay(state, reason) {
  switch (state) {
    case "proven":
    case "proven-unhashed":
      return { mark: "✓", label: null };
    case "stale":
      if (reason === "checkpoint-changed") {
        return { mark: "⚠", label: "périmé — checkpoint modifié depuis la preuve, re-prouver avec `ai-learn verify`" };
      }

      return { mark: "⚠", label: "périmé — re-prouver avec `ai-learn verify --stale`" };
    case "unproven":
      return { mark: "✗", label: "non prouvé" };
    case "in-progress":
      return { mark: "●", label: null };
    default:
      return { mark: "○", label: null };
  }
}

// Story 02.04: `status`/`check` never recompute mutation themselves (a
// checkpoint-per-mutant run is too costly for a read-only, repeatedly-called
// command — spec.md Requirements) — this only reads `evidence.mutation`,
// already written by `verify` (story 02.03), off the latest *passing*
// evidence for the phase. `ev.mutation.required` distinguishes "measured,
// zero mutable sites" (`required: true`, real evidence) from "never
// measured for this phase" (evidence predates this story, or predates the
// phase's own `mutation: true` — `required` would be `false` on it) — both
// collapse to `score: null` for a script consuming --json, but only the
// former is worth a line in the human-readable text (edge cases, spec.md).
function measuredMutation(phase, ev) {
  if (phase.mutation !== true) {
    return null;
  }

  return ev && ev.mutation && ev.mutation.required ? ev.mutation : null;
}

function formatMutationLine(phase, ev) {
  const measured = measuredMutation(phase, ev);

  if (!measured) {
    return null;
  }

  return measured.score === null
    ? "mutation : aucun site mutable"
    : `mutation : ${measured.score} % (${measured.killed} tués / ${measured.mutants})`;
}

// The --json counterpart of `formatMutationLine`: same source (`ev.mutation`
// on the latest passing evidence), reshaped into the stable schema
// plan.md's Technical Notes locks — `null` only when `phase.mutation` isn't
// declared, otherwise always the same four fields, never half-filled, so a
// script never has to branch on which fields happen to be present.
// `required` is always `true` in the non-null cases below — the caller
// already got `null` above when the phase doesn't require mutation, so
// there is no live path where this object exists with `required: false`.
// Kept as a literal field (not hoisted) to match the locked JSON shape.
function mutationSummary(phase, ev) {
  if (phase.mutation !== true) {
    return null;
  }

  const measured = measuredMutation(phase, ev);

  return measured
    ? { required: true, score: measured.score, killed: measured.killed, mutants: measured.mutants }
    : { required: true, score: null, killed: 0, mutants: 0 };
}

function printStatus(config, { dir }) {
  const done = config.phases.filter((phase) => phase.status === "done").length;

  log(`Project: ${config.project || path.basename(dir)}${config.technology ? ` · ${config.technology}` : ""}`);
  log(`Phases: ${done}/${config.phases.length} done\n`);

  if (config.phases.length === 0) {
    log("No phases yet. Add them to progress.json, then run `ai-learn verify <id>` for each checkpoint.");
    return;
  }

  for (const phase of config.phases) {
    const ev = latestEvidenceForPhase(dir, phase.id);
    const checkpointFile = checkpointFilePath(dir, phase.checkpoint);
    // Only cost a hash computation (a full walkSources) for a done phase with
    // evidence that actually carries a sourceHash to compare against —
    // phaseVerdict never consults currentHash for proven-unhashed or any
    // other status, same guard as check.js/next.js.
    const currentHash = phase.status === "done" && ev && ev.sourceHash ? computeSourceHash(dir, { checkpointFile }) : null;
    const verdict = phaseVerdict({ phase, evidence: ev, currentHash, checkpointFileExists: Boolean(checkpointFile) });
    const { mark, label } = verdictDisplay(verdict.state, verdict.reason);

    const evNote = ev ? ` — evidence ${new Date(ev.generatedAt).toISOString().slice(0, 10)}` : "";
    const labelNote = label ? ` (${label})` : "";
    log(`  ${mark} Phase ${phase.id} — ${phase.name}${evNote}${labelNote}`);
    if (phase.checkpoint) {
      log(`      ${phase.checkpoint}`);
    }

    const mutationLine = formatMutationLine(phase, ev);
    if (mutationLine) {
      log(`      ${mutationLine}`);
    }

    // Story 09.02 — a contract change the learner acknowledged is shown once,
    // here, with its reason (the `check` warning it silences is gone).
    for (const change of Array.isArray(phase.contractChanges) ? phase.contractChanges : []) {
      if (change && typeof change.why === "string") {
        log(`      contrat modifié (${String(change.at).slice(0, 10)}) : ${change.why}`);
      }
    }
  }
}

// The active tutor profile (story 05.05), one line. Absent or invalid, the
// defaults are what verify will actually use, so the line says so.
function printTutorProfile({ dir }) {
  const tutor = readTutorConfig(dir);
  const { assistance, proof } = tutor.config;
  const source = tutor.exists && tutor.valid ? "" : " (défaut)";

  log(`\nTuteur : assistance=${assistance} · preuve=${proof}${source}`);
}

// Additive, read-only summary of the global git/gh mastery ledger (see
// bin/lib/tracks/git.js) — cross-project, never reset by a new `progress.json`.
// Silent when the ledger doesn't exist yet: a learner who hasn't touched a
// tagged git/gh phase yet sees the normal per-project status, nothing more.
function printGitTracksSummary({ home } = {}) {
  const { config, exists } = readGitTracks({ home });

  if (!exists || !config || !config.tiers) {
    return;
  }

  const achieved = TIER_IDS.filter((tier) => config.tiers[String(tier)] && config.tiers[String(tier)].achieved);
  const missing = TIER_IDS.filter((tier) => !achieved.includes(tier));

  log("\nGit/gh — maîtrise cross-projet :");
  log(`  Tiers atteints : ${achieved.length > 0 ? achieved.join(", ") : "aucun"}`);
  log(missing.length > 0 ? `  Tiers restants  : ${missing.join(", ")}` : "  Tous les tiers sont atteints.");
}

// Additive, read-only summary of the domain mastery ledger (see
// bin/lib/tracks/domain.js) — the falsifiable "3 projects → expert" status.
// Keyed by the stack *detected from real code*, not `progress.json`'s
// free-text `technology` label — best-effort, silent on any detection
// failure or an absent ledger (a learner who hasn't verified a phase in this
// stack yet sees nothing extra).
function printDomainSummary({ dir, home } = {}) {
  let key;

  try {
    key = detectDomainKey(dir).key;
  } catch {
    return;
  }

  const summary = domainSummary({ technology: key, home });

  if (!summary) {
    return;
  }

  const unit = summary.metric === "concepts" ? "concept(s)" : "direction(s)";
  const pct = summary.total > 0 ? Math.round(summary.coverage * 100) : 0;

  log(`\nMaîtrise de domaine (${summary.technology}) — cross-projet :`);
  log(`  ${summary.achieved}/${summary.total} ${unit} (${pct}%)`);
  log(
    summary.expert
      ? "  Statut : Expert — couverture complète de la banque."
      : `  Manque encore : ${summary.missing.length > 0 ? summary.missing.join(", ") : "—"}`,
  );
}

// Unlike the git/domain summaries above, this one is not silent-by-absence:
// it re-checks the norm on every `status` call (decision: always verify — see
// docs/plans/norm-clean-code.md, walkSources already caps at 1000 files/1MB
// each so the cost stays negligible for a real learning project). Silent only
// when there are zero violations to report.
function printNormSummary({ dir }) {
  const report = normProject(dir);

  if (report.violations.length > 0) {
    log(`\nNorme (clean code) : ${report.violations.length} violation(s) — voir \`ai-learn norm\`.`);
  }
}

// Dirigeant-only, additive summary: how many done phases carry a valid sourced
// review. In apprenti the review tier does not exist, so the line is silent —
// same absence-is-not-a-warning stance as the other cross-project summaries.
const REVIEW_REASONS = {
  missing: "manquante",
  unreadable: "illisible",
  "no-citation": "sans file:line réel",
  "no-decision": "sans décision",
  "insufficient-substance": "sans substance",
  "ambiguous-name": "nom de phase ambigu",
};

function printReviewSummary({ dir, config }) {
  const guard = loadGuardConfig(dir);

  if (guard.mode !== "dirigeant") {
    return;
  }

  const states = reviewStates(dir, config, guard.implementationFiles);
  const pending = states.filter((review) => review.state !== "valid");
  const valid = states.length - pending.length;

  if (pending.length === 0) {
    log(`\nRevues (mode dirigeant) : ${valid}/${states.length} brique(s) revue(s).`);
    return;
  }

  const detail = pending.map((review) => `${review.path} (${REVIEW_REASONS[review.reason] || "invalide"})`).join(", ");
  log(`\nRevues (mode dirigeant) : ${valid}/${states.length} valide(s) — ${pending.length} à revoir : ${detail}`);
}

// The JSON-facing calc: same per-phase verdict `printStatus` prints as text,
// reshaped into a stable, versioned object. Never throws — a missing or
// corrupt progress.json becomes an `error` field on the object instead of a
// stack, so --json always produces valid JSON (see spec.md's edge cases).
function buildStatusReport(dir) {
  const { config, exists } = readProgress(dir);

  if (!exists || !config) {
    return {
      version: 1,
      dir: normalizePortable(dir),
      error: `No progress.json in ${dir}. Run \`ai-learn init\` first.`,
      uncommitted: uncommittedCount(dir),
    };
  }

  const phases = (config.phases || []).map((phase) => {
    const ev = latestEvidenceForPhase(dir, phase.id);
    const checkpointFile = checkpointFilePath(dir, phase.checkpoint);
    const currentHash =
      phase.status === "done" && ev && ev.sourceHash ? computeSourceHash(dir, { checkpointFile }) : null;
    const verdict = phaseVerdict({ phase, evidence: ev, currentHash, checkpointFileExists: Boolean(checkpointFile) });

    return {
      id: phase.id,
      name: phase.name,
      status: phase.status,
      checkpoint: phase.checkpoint || null,
      verdict: verdict.state,
      evidenceDate: ev ? new Date(ev.generatedAt).toISOString() : null,
      mutation: mutationSummary(phase, ev),
    };
  });

  return {
    version: 1,
    dir: normalizePortable(dir),
    project: config.project || path.basename(dir),
    technology: config.technology || null,
    phasesDone: phases.filter((phase) => phase.status === "done").length,
    phasesTotal: phases.length,
    phases,
    uncommitted: uncommittedCount(dir),
    progressIssues: validateProgress(config).map((issue) => issue.message),
  };
}

function statusCommand({ dir, home, json }) {
  if (json) {
    const report = buildStatusReport(dir);
    log(JSON.stringify(report));

    if (report.error) {
      process.exitCode = 1;
    }
    return;
  }

  const { config, exists } = readProgress(dir);

  if (!exists || !config) {
    fail(`No progress.json in ${dir}. Run \`ai-learn init\` first.`);
  }

  printStatus(config, { dir });
  printTutorProfile({ dir });
  printReviewSummary({ dir, config });

  const issues = validateProgress(config);

  if (issues.length > 0) {
    log("\nprogress.json issues:");
    for (const issue of issues) {
      log(`  - ${issue.message}`);
    }
  }

  printGitTracksSummary({ home });
  printDomainSummary({ dir, home });
  printNormSummary({ dir });
  printCommitReminder(dir);
}

module.exports = {
  statusCommand,
  buildStatusReport,
  latestEvidenceForPhase,
  printGitTracksSummary,
  printDomainSummary,
  printNormSummary,
  printReviewSummary,
  formatMutationLine,
  mutationSummary,
};
