"use strict";

// `ai-learn status` — the single-project view: phases and their state, with the
// latest passing evidence date when one exists. Read-only.

const path = require("path");
const { log, fail } = require("./util");
const { readProgress, validateProgress, latestEvidenceForPhase, phaseVerdict } = require("./progress");
const { readGitTracks, TIER_IDS } = require("./tracks/git");
const { detectDomainKey, domainSummary } = require("./tracks/domain");
const { normProject } = require("./norm");
const { checkpointFilePath, computeSourceHash } = require("./source-hash");

// The mark and, where useful, the French label shown next to a phase —
// derived from the same verdict `check` and `next` consume, not re-derived
// from `phase.status` alone. Only `stale`/`unproven` get a label: the other
// states are already legible from the mark plus the raw status text below.
function verdictDisplay(state) {
  switch (state) {
    case "proven":
    case "proven-unhashed":
      return { mark: "✓", label: null };
    case "stale":
      return { mark: "⚠", label: "périmé — à re-prouver" };
    case "unproven":
      return { mark: "✗", label: "non prouvé" };
    case "in-progress":
      return { mark: "●", label: null };
    default:
      return { mark: "○", label: null };
  }
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
    // evidence to compare it against — phaseVerdict never consults currentHash
    // for any other status, same guard as check.js/next.js.
    const currentHash = phase.status === "done" && ev ? computeSourceHash(dir, { checkpointFile }) : null;
    const verdict = phaseVerdict({ phase, evidence: ev, currentHash, checkpointFileExists: Boolean(checkpointFile) });
    const { mark, label } = verdictDisplay(verdict.state);

    const evNote = ev ? ` — evidence ${new Date(ev.generatedAt).toISOString().slice(0, 10)}` : "";
    const labelNote = label ? ` (${label})` : "";
    log(`  ${mark} Phase ${phase.id} — ${phase.name}${evNote}${labelNote}`);
    if (phase.checkpoint) {
      log(`      ${phase.checkpoint}`);
    }
  }
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

function statusCommand({ dir, home }) {
  const { config, exists } = readProgress(dir);

  if (!exists || !config) {
    fail(`No progress.json in ${dir}. Run \`ai-learn init\` first.`);
  }

  printStatus(config, { dir });

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
}

module.exports = { statusCommand, latestEvidenceForPhase, printGitTracksSummary, printDomainSummary, printNormSummary };
