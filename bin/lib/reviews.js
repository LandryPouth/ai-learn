"use strict";

// The dirigeant review tier: `docs/reviews/<brique>.md` is the learner's proof
// of judgment over the AI's diff. One review per done phase, named from the
// phase name (`Phase zero` → `phase-zero.md`). It must cite a real
// `file:line` and state a decision; presence + minimum substance, same
// contract as `citesRealPRUrl` (see citation.js).

const fs = require("fs");
const path = require("path");
const { findRealFileLine, hasSubstantialBody } = require("./citation");
const { matchesLearnerPath } = require("./guard");

// "accepter, rejeter, demander un changement" — the vocabulary the review must
// contain, in its French forms (plus the English review equivalents). `\b` is
// ASCII-only in JS, so it would reject every accented past participle after
// its final letter (`accepté`, `rejeté`, `changement demandé`). Unicode-aware
// lookarounds treat accented letters as word characters instead.
// Limit (by contract, presence not judgment): it is tested on the whole review,
// so a matching word anywhere in the prose counts as the decision.
const DECISION_RE =
  /(?<![\p{L}\p{N}_])(?:accepter|accepte|accepté|acceptée|acceptés|acceptées|rejeter|rejette|rejeté|rejetée|rejetés|rejetées|refuser|refuse|refusé|refusée|demande(?:r)?\s+(?:un\s+|de\s+)?changement|changements?\s+demand[ée]s?|request(?:ed)?\s+changes?|reject(?:ed)?|approv(?:e|ed))(?![\p{L}\p{N}_])/iu;

function reviewSlug(phase) {
  const name = typeof phase.name === "string" ? phase.name : "";
  const slug = name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return slug || `phase-${phase.id}`;
}

function reviewPath(phase) {
  return path.posix.join("docs", "reviews", `${reviewSlug(phase)}.md`);
}

// Review files are named after the phase, so two phases sharing a name would
// silently share one review — one file would prove both. A phase whose slug
// collides is refused rather than guessed at; renaming one phase is the fix.
function duplicateSlugs(phases) {
  const counts = new Map();

  for (const phase of phases || []) {
    const slug = reviewSlug(phase);
    counts.set(slug, (counts.get(slug) || 0) + 1);
  }

  return new Set(
    [...counts].filter(([, count]) => count > 1).map(([slug]) => slug),
  );
}

// `valid` | `missing` | `invalid` (with a reason: no-citation, no-decision,
// insufficient-substance, unreadable, ambiguous-name). A valid review exposes
// the citation it resolved so callers can report it without re-parsing.
//
// `scope` is the guard's `implementationFiles`: the file:line must name a file
// the diff covers, not just any existing path (a review citing `README.md` is
// not a review of the implementation). Omitted, the check stays root-only.
// `duplicates` (optional) is the set from `duplicateSlugs`; when the phase's
// name is in it, the review is ambiguous by construction.
function reviewState(dir, phase, scope, duplicates) {
  const relative = reviewPath(phase);
  const full = path.join(dir, relative);

  if (duplicates && duplicates.has(reviewSlug(phase))) {
    return { path: relative, state: "invalid", reason: "ambiguous-name" };
  }

  if (!fs.existsSync(full)) {
    return { path: relative, state: "missing", reason: "missing" };
  }

  let content;

  try {
    content = fs.readFileSync(full, "utf8");
  } catch {
    return { path: relative, state: "invalid", reason: "unreadable" };
  }

  const isAllowed = Array.isArray(scope)
    ? (cited) => matchesLearnerPath(cited, scope)
    : null;
  const citation = findRealFileLine(content, dir, isAllowed);

  if (!citation) {
    return { path: relative, state: "invalid", reason: "no-citation" };
  }

  if (!DECISION_RE.test(content)) {
    return { path: relative, state: "invalid", reason: "no-decision", citation };
  }

  if (!hasSubstantialBody(content, citation)) {
    return { path: relative, state: "invalid", reason: "insufficient-substance", citation };
  }

  return { path: relative, state: "valid", citation };
}

function reviewStates(dir, config, scope) {
  const duplicates = duplicateSlugs(config.phases);

  return (config.phases || [])
    .filter((phase) => phase.status === "done")
    .map((phase) => ({ phase, ...reviewState(dir, phase, scope, duplicates) }));
}

module.exports = {
  DECISION_RE,
  duplicateSlugs,
  reviewPath,
  reviewSlug,
  reviewState,
  reviewStates,
};
