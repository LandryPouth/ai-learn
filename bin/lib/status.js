"use strict";

// `ai-learn status` — the single-project view: phases and their state, with the
// latest passing evidence date when one exists. Read-only.

const path = require("path");
const { log, fail } = require("./util");
const { readProgress, validateProgress, latestEvidenceForPhase } = require("./progress");
const { readGitTracks, TIER_IDS } = require("./tracks/git");
const { detectDomainKey, domainSummary } = require("./tracks/domain");

function printStatus(config, { dir }) {
  const done = config.phases.filter((phase) => phase.status === "done").length;

  log(`Project: ${config.project || path.basename(dir)}${config.technology ? ` · ${config.technology}` : ""}`);
  log(`Phases: ${done}/${config.phases.length} done\n`);

  if (config.phases.length === 0) {
    log("No phases yet. Add them to progress.json, then run `ai-learn verify <id>` for each checkpoint.");
    return;
  }

  for (const phase of config.phases) {
    const mark = phase.status === "done" ? "✓" : phase.status === "in_progress" ? "●" : "○";
    const ev = latestEvidenceForPhase(dir, phase.id);
    const evNote = ev ? ` — evidence ${new Date(ev.generatedAt).toISOString().slice(0, 10)}` : "";
    log(`  ${mark} Phase ${phase.id} — ${phase.name}${evNote}`);
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
}

module.exports = { statusCommand, latestEvidenceForPhase, printGitTracksSummary, printDomainSummary };
