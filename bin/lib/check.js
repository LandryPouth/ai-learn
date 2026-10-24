"use strict";

// `ai-learn check [--root <dir>]` — the scanner. Walks a root (default cwd) for
// learning projects and cross-checks each progress.json against what actually
// exists: a phase marked `done` must carry a passing verify evidence and its
// declared artifacts; a phase with evidence but not marked done is drift. This is
// the command that makes "the AI skipped the rule" visible.

const fs = require("fs");
const os = require("os");
const path = require("path");
const { log, findLearningProjects, spawnGit, normalizePortable } = require("./util");
const {
  readProgress,
  validateProgress,
  runsDir,
  progressPath,
  latestEvidenceForPhase,
  latestAnyEvidenceForPhase,
  phaseVerdict,
  revisitState,
} = require("./progress");
const { docSourceList, digestPath, digestCitations, digestCitationProblem } = require("./docs");
const { MARKER: CODEX_GUARD_MARKER } = require("./platforms/codex-guard");
const {
  inspectOpenCodeGuard,
  usesOpenCode,
  PLUGIN_RELATIVE: OPENCODE_PLUGIN_RELATIVE,
} = require("./platforms/opencode-guard");
const {
  NATIVE_MEMORY_FILE,
  detectedPlatforms,
  legacyOnlyPlatforms,
  hasNativeMemoryImport,
} = require("./platforms/ensure");
const { appendAutoEntry } = require("./dogfood");
const { commitMsgHookWired, CONVENTIONAL_COMMITS_RE } = require("./git-hooks");
const { normProject } = require("./norm");
const { guardConfigIssues, loadGuardConfig, isOwnGuardCommand } = require("./guard");
const { readTutorConfig } = require("./tutor");
const { MODE_DIRIGEANT, formatLedgerRefusal, requiredTiersStatus } = require("./mode");
const { checkpointFilePath, computeSourceHash, changedSourceFiles } = require("./source-hash");
const { walkSources, detectTests, ALL_SOURCE_EXTS } = require("./scan");
const {
  journalPath: predictionsJournalPath,
  readPredictions,
  countByPhase,
  countIATyped,
  normalizePredictionsRequired,
  predictionsReport,
  formatPredictionsGap,
} = require("./predictions");
const { citesRealPRUrl, hasSubstantialBody } = require("./citation");
const { duplicateSlugs, reviewState } = require("./reviews");

// Signals that a docs/solutions/*.md reveal was deliberately left incomplete:
// a bracketed placeholder, an ellipsis, a "TODO/à compléter/à finir" note, or
// a line that trails off with "...". Anchored loosely on purpose — this is a
// presence check for *some* hole-shaped marker, not a judge of whether the
// hole is well-placed.
const HOLE_MARKER_RE = /\[\s*\.\.\.\s*\]|…|\bTODO\b|à (?:compl[ée]ter|finir)|\.\.\.\s*$/im;

// Story 06.03 — the fixed reading speed used to turn a digest's word count into
// an estimated reading time. A documented constant, not a per-project setting:
// the budget is a nudge, never a proof.
const READING_WORDS_PER_MINUTE = 200;

function checkProject(dir, { home, now = new Date() } = {}) {
  const issues = { errors: [], warnings: [] };
  const { config, exists } = readProgress(dir);

  if (!exists) {
    return null;
  }

  if (!config) {
    issues.errors.push({ file: "progress.json", message: "unreadable or invalid JSON" });
    return { dir, config: null, issues };
  }

  // The learning mode lives in `.ai-learn/guard.json`; absent or typo'd, the
  // guard resolves to apprenti. `check` only adds the dirigeant review tier
  // when the mode is really dirigeant.
  const guard = loadGuardConfig(dir);
  // Review files are named after the phase, so a duplicate name makes one
  // review stand for two phases. Computed once, shared by every done phase.
  const duplicateReviewNames = duplicateSlugs(config.phases);

  for (const issue of validateProgress(config)) {
    (issue.level === "error" ? issues.errors : issues.warnings).push(issue);
  }

  // The tutor profile (story 05.05): an unknown assistance/proof value is an
  // explicit error, never a silent fallback to the defaults verify would use.
  const tutor = readTutorConfig(dir);

  for (const message of tutor.issues) {
    issues.errors.push({ file: ".ai-learn/tutor.json", message });
  }

  // Doc sources the ledger declares should exist. A local source that vanished
  // is worth knowing — the plan's citations point at it. A *generated* source is
  // stricter: it was not cloned, the AI had to recreate it locally from a
  // verified origin, so check demands provenance, a non-empty doc, and that the
  // doc cites its origin — otherwise it is an unverifiable invention. Handles
  // both the new `docSource.sources[]` shape and the legacy single-source shape.
  let hasLocalSource = false;

  for (const source of docSourceList(config.docSource)) {
    if (source.mode !== "local" || !source.path) {
      continue; // remote sources are URLs — nothing local to check
    }

    hasLocalSource = true;
    const expanded = source.path.replace(/^~/, process.env.HOME || "");
    const resolved = path.isAbsolute(expanded) ? expanded : path.join(dir, expanded);

    if (source.generated) {
      checkGeneratedSource(resolved, source, issues);
      continue;
    }

    if (!fs.existsSync(resolved)) {
      issues.warnings.push({
        file: "progress.json",
        message: `declared doc source does not exist: ${source.path} (${source.name})`,
      });
    }
  }

  // The friction bank is derived from the local docs. Its absence is a warning,
  // not an error: a project can legitimately have zero traps — but if local
  // sources exist, the protocol should know whether any warning callouts live
  // in them. And a bank that exists but flags `possibleMisses` means the
  // extractor found warning-marker lines it could not parse (an admonition
  // syntax it doesn't recognize) — "0 traps" there is not proof the doc is
  // clean, so surface it rather than let it read as silence.
  if (hasLocalSource) {
    const trapsPath = path.join(dir, ".ai-learn", "traps.json");

    if (!fs.existsSync(trapsPath)) {
      issues.warnings.push({
        file: ".ai-learn/traps.json",
        message: "local doc sources exist but no friction bank — run `ai-learn traps`",
      });
    } else {
      try {
        const trapsData = JSON.parse(fs.readFileSync(trapsPath, "utf8"));

        if (Number.isFinite(trapsData.possibleMisses) && trapsData.possibleMisses > 0) {
          issues.warnings.push({
            file: ".ai-learn/traps.json",
            message:
              `${trapsData.possibleMisses} warning-marker line(s) found outside any syntax the extractor ` +
              "recognizes (blockquote, admonition :::, <div>) — extraction may be incomplete; check those docs manually",
          });
        }
      } catch {
        // unreadable/corrupt traps.json — not this check's job to fix
      }
    }
  }

  // A hand-edited `guard.json` is a data file: a typo'd `mode` silently falls
  // back to `apprenti` in the guard (fail-safe, by design), so the only place
  // the learner can see it is here. A project that believes it runs in
  // `dirigeant` while the guard enforces `apprenti` is exactly the silent
  // misconfiguration this check exists to surface.
  if (fs.existsSync(path.join(dir, ".ai-learn", "guard.json"))) {
    for (const issue of guardConfigIssues(dir)) {
      issues.warnings.push({ file: ".ai-learn/guard.json", message: issue.message });
    }

    // `dirigeant` is earned through `ai-learn mode dirigeant`, which proves
    // tiers 1-3 of the global ledger. A hand-edited guard.json can claim the
    // mode without that proof, so the only place the divergence is visible is
    // here — and it is an error, not a warning: the project is enforcing a
    // property the learner has not demonstrated. An absent/corrupt ledger
    // proves nothing either (fail closed, like the gate itself).
    if (loadGuardConfig(dir).mode === MODE_DIRIGEANT) {
      const ledger = requiredTiersStatus({ home });

      if (!ledger.ok) {
        issues.errors.push({
          file: ".ai-learn/guard.json",
          message:
            "mode is \"dirigeant\" but the test ledger does not prove tiers 1-3: " +
            `${formatLedgerRefusal(ledger)} — switch with \`ai-learn mode dirigeant\`, ` +
            "never by hand-editing guard.json",
        });
      }
    }

    // An implementation scope that matches nothing makes source-hash, norm and
    // mutation vacuous: the digest is constant, no file is ever policed and no
    // mutant is generated. That is the silent version of the epic-01 regression
    // (a project laid out in lib/**, bin/**, app/** but scoped to src/**), so
    // surface it instead of letting `verify` pass on an empty proof.
    //
    // Only when the project actually has implementation candidates: a freshly
    // initialized project with no source written yet matches nothing legitimately
    // and must not be nagged. Test files don't count as implementation.
    const implementationScope = guard.implementationFiles;
    if (computeSourceHash(dir).files === 0) {
      const hasImplementationCandidates = walkSources(dir).files.some(
        (file) => ALL_SOURCE_EXTS.has(file.ext) && detectTests([file]).count === 0,
      );

      if (hasImplementationCandidates) {
        issues.warnings.push({
          file: ".ai-learn/guard.json",
          message: `implementation scope (${implementationScope.join(", ")}) matches no files — ` +
            "source-hash, norm and mutation would prove nothing; declare the project's source scope " +
            "(learnerFiles in apprenti, implementationFiles in dirigeant)",
        });
      }
    }
  }

  // The learner-file block ("blocage apprenant") is enforced by the `ai-learn
  // guard` PreToolUse hook. If the policy (.ai-learn/guard.json) exists but the
  // hook is not wired into .claude/settings.json, the block is configured yet
  // inactive — exactly the silent skip this check exists to surface. Guarded
  // only when the policy file exists, so older projects stay quiet.
  if (fs.existsSync(path.join(dir, ".ai-learn", "guard.json")) && !guardHookWired(dir)) {
    issues.warnings.push({
      file: ".claude/settings.json",
      message: "guard policy exists (.ai-learn/guard.json) but the `ai-learn guard` hook is not wired — " +
        "the learner-file block is inactive. Run `ai-learn update --root <dir>`.",
    });
    // Mechanical, not agent-authored: check writes the finding itself the
    // moment it's detected — see bin/lib/dogfood.js.
    appendAutoEntry(dir, {
      platform: "claude-code",
      surface: "hook-guard",
      expected: "le hook PreToolUse ai-learn guard aurait dû être câblé dans .claude/settings.json par init/update",
      problem: "guard.json existe mais aucun hook PreToolUse pointant vers ai-learn.js guard n'est présent dans .claude/settings.json",
    });
  }

  // Clean-code norm (ai-learn norm) — same hard-block philosophy as verify's
  // own gate (see verify.js), but audited here project-wide across every
  // learning project under --root, not just the one being verified right
  // now. Always an error (never a warning): only issues.errors fails the
  // exit code below, and this mechanism is explicitly a hard block.
  const normReport = normProject(dir);

  for (const violation of normReport.violations) {
    issues.errors.push({
      file: `${violation.file}:${violation.line}`,
      message: `${violation.message} [${violation.rule}]`,
    });
  }

  // Codex's mechanical guard (a .codex/config.toml permissions profile, see
  // bin/lib/platforms/codex-guard.js) is a separate wiring from the Claude
  // hook above — a project can have one without the other.
  if (fs.existsSync(path.join(dir, ".ai-learn", "guard.json")) && !codexGuardWired(dir)) {
    issues.warnings.push({
      file: ".codex/config.toml",
      message: "guard policy exists (.ai-learn/guard.json) but no ai-learn permissions profile in " +
        ".codex/config.toml — Codex's sandbox-level block is inactive. Run `ai-learn update --root <dir>`.",
    });
    appendAutoEntry(dir, {
      platform: "codex",
      surface: "config",
      expected: "le profil de permissions ai-learn-guard aurait dû être câblé dans .codex/config.toml par init/update",
      problem: "guard.json existe mais .codex/config.toml ne porte pas le marqueur ai-learn (absent, ou fichier personnalisé jamais rafraîchi)",
    });
  }

  // OpenCode's mechanical guard is a generated plugin (story 08.01). Absent is
  // only a finding when OpenCode is actually in use; stale/foreign means the
  // project has a file there but it is not the guard we would run.
  if (usesOpenCode(dir)) {
    const openCode = inspectOpenCodeGuard(dir);

    if (openCode.state !== "current") {
      const label =
        openCode.state === "absent"
          ? "absent"
          : openCode.state === "stale"
            ? "périmé"
            : openCode.state === "unreadable"
              ? "illisible (pas un fichier, ou permissions)"
              : "personnalisé (sans marqueur ai-learn)";
      const remedy =
        openCode.state === "foreign"
          ? "Renomme ou supprime ce plugin personnalisé, puis lance `ai-learn update --platform opencode` : " +
            "`update` ne remplace jamais un plugin qui ne porte pas le marqueur ai-learn."
          : openCode.state === "unreadable"
            ? "Rends `.opencode/plugins/ai-learn-guard.js` lisible (ou supprime-le), puis lance " +
              "`ai-learn update --platform opencode`."
            : "Lance `ai-learn update` (ou `ai-learn update --platform opencode`) pour le générer.";
      issues.warnings.push({
        file: OPENCODE_PLUGIN_RELATIVE.replace(/\\/g, "/"),
        message: `plugin OpenCode ${label} — le garde-fou src/** n'y est pas actif. ${remedy}`,
      });
    }
  }

  // A platform that does not read AGENTS.md on its own (Claude Code, Gemini)
  // only sees the protocol through its native memory file. When that platform
  // is installed on the machine and the project has an AGENTS.md but no import
  // line, a generalist session opens the project with no learning protocol at
  // all — the exact silent skip this command exists to surface. Same warning
  // discipline as the Codex guard above: actionable, never fatal.
  if (fs.existsSync(path.join(dir, "AGENTS.md"))) {
    // Pre-04.05 installs only carry the old slash names (`/next`, …). The new
    // `/learn-*` names are additive, so this is a migration warning — never an
    // error, and never something the learner has to fix by hand.
    for (const platform of legacyOnlyPlatforms(home)) {
      issues.warnings.push({
        file: `/… skills (${platform})`,
        message:
          `skills ${platform} installés sous les anciens noms seulement — les skills /learn-* ` +
          `manquent. Lance \`ai-learn update --platform ${platform}\` pour les ajouter (migration, non bloquant).`,
      });
    }

    for (const platform of detectedPlatforms(home)) {
      const filename = NATIVE_MEMORY_FILE[platform];

      if (!filename) {
        continue;
      }

      let content = null;

      try {
        content = fs.readFileSync(path.join(dir, filename), "utf8");
      } catch (error) {
        if (error.code !== "ENOENT") {
          continue; // unreadable is not the same as missing — not this check's job
        }
      }

      if (content === null || !hasNativeMemoryImport(content)) {
        issues.warnings.push({
          file: filename,
          message:
            `AGENTS.md exists but ${filename} does not import @AGENTS.md — ${platform} sessions ` +
            "open the project without the learning protocol. Run `ai-learn update --root <dir>`.",
        });
      }
    }
  }

  // The commit-msg hook (mechanical, Conventional Commits — see
  // bin/lib/git-hooks.js) is only real once `.githooks/commit-msg` exists and
  // `core.hooksPath` points at it. `commitMsgHookWired` returns null when
  // there's no `.git` yet — nothing to warn about, `ai-learn update` will
  // wire it automatically once the learner runs `git init`.
  const hookWired = commitMsgHookWired(dir);

  if (hookWired === false) {
    issues.warnings.push({
      file: ".githooks/commit-msg",
      message: "commit-msg hook not wired (run `ai-learn update`) — commit message format is not enforced",
    });
  }

  // Structural, not self-reported: a `--no-verify` bypass (or a hook that was
  // never wired at all) leaves a trace in the commit subjects themselves —
  // read directly via git, not something the AI has to remember to log. See
  // templates/commit-msg's own PATTERN, mirrored here as CONVENTIONAL_COMMITS_RE.
  if (fs.existsSync(path.join(dir, ".git"))) {
    const log30 = spawnGit(["-C", dir, "log", "--format=%s", "-n", "30"], { encoding: "utf8" });

    if (log30.status === 0) {
      const subjects = log30.stdout.split("\n").filter(Boolean);
      const offenders = subjects.filter((subject) => !CONVENTIONAL_COMMITS_RE.test(subject));

      if (offenders.length > 0) {
        issues.warnings.push({
          file: ".git (log)",
          message:
            `${offenders.length}/${subjects.length} of the last commit subjects don't match the Conventional ` +
            "Commits format — either the hook was bypassed (`--no-verify`) or it isn't wired yet",
        });
      }
    }
  }

  // The guard blocks the AI from writing `src/**`, but the reveal it deposits
  // in docs/solutions/ is meant to be "non-collable" — written with holes
  // ([...], an incomplete line, a comment to finish) so a blind Cmd+A cannot
  // pass the checkpoint (see templates/AGENTS-apprentissage.md and the
  // solutions README in guard.js). That rule lived only as prose: nothing
  // checked it was actually followed. This is the same structural, not
  // semantic, guarantee as checkGeneratedSource below — it cannot tell a
  // thoughtfully-holed reveal from a lazily-holed one, it only catches the
  // degenerate case of zero hole markers anywhere in the file (a fully
  // complete, copy-pasteable solution).
  const solutionsDir = path.join(dir, "docs", "solutions");

  if (fs.existsSync(solutionsDir)) {
    for (const entry of fs.readdirSync(solutionsDir)) {
      if (entry === "README.md" || !entry.endsWith(".md")) {
        continue; // README.md is the generated index, not a reveal
      }

      const filePath = path.join(solutionsDir, entry);
      const content = fs.readFileSync(filePath, "utf8");

      if (!HOLE_MARKER_RE.test(content)) {
        issues.warnings.push({
          file: `docs/solutions/${entry}`,
          message:
            "no hole marker found ([...], …, TODO, or a truncated line) — this reveal may be copy-pasteable " +
            "as-is, defeating the \"non-collable\" guarantee. Rewrite it with real gaps to complete.",
        });
      }
    }
  }

  // Prediction journal (story 01.03): predictions.json is the source of truth
  // once it exists and is valid — never fall back silently when it exists but
  // is corrupted, that is exactly the drift this check must not hide.
  // Counting is per phase: summing across phases let 6 predictions on phase 0
  // satisfy phase 1's requirement too (the bug this story fixes).
  const required = (config.phases || []).reduce(
    (sum, phase) => sum + normalizePredictionsRequired(phase.predictionsRequired).total,
    0,
  );
  const journalMdPath = predictionsJournalPath(dir);
  const journalExists = fs.existsSync(journalMdPath);
  const predictions = readPredictions(dir);

  if (predictions.exists && !predictions.valid) {
    issues.errors.push({
      file: ".ai-learn/predictions.json",
      message: `predictions.json is corrupted, not silently accepted: ${predictions.issues.join("; ")}`,
    });
  }

  let countsByPhase = {};
  let iaTypedCount = 0;
  let countsSource = null;

  if (predictions.valid) {
    countsByPhase = countByPhase(predictions.data.entries);
    iaTypedCount = countIATyped(predictions.data.entries);
    countsSource = ".ai-learn/predictions.json";
  } else if (journalExists) {
    countsByPhase = countJournalEntriesByPhase(journalMdPath);
    iaTypedCount = countIATypedCorrections(journalMdPath);
    countsSource = "docs/plans/predictions.md";
  }

  // A predictions.json created empty by `update` on a project that already
  // had a filled-in legacy predictions.md silently outranks it ("JSON fait
  // foi dès qu'il existe", plan.md Decisions) — the first `check` after that
  // reports phases as newly missing predictions it used to consider covered.
  // Named here so the warning explains itself, instead of only being
  // mentioned once in `update`'s own output (found in review, story 01.03).
  const jsonEmptyOverNonEmptyLegacy =
    predictions.valid &&
    predictions.data.entries.length === 0 &&
    journalExists &&
    Object.keys(countJournalEntriesByPhase(journalMdPath)).length > 0;

  if (countsSource === null) {
    if (required > 0) {
      issues.warnings.push({
        file: "docs/plans/predictions.md",
        message: `predictions.md missing; ${required} prediction(s) required across phases`,
      });
    }
  } else {
    // Story 01.04: the JSON-source case defers to the same `predictionsReport`
    // `verify` uses, so the two never diverge on the same phase's count. The
    // legacy `.md`-only case has no JSON to feed that function, so it keeps
    // its own count here — informative only (a warning, never a block; see
    // predictionsReport's own retro-compat contract).
    for (const phase of config.phases || []) {
      const phaseRequired = normalizePredictionsRequired(phase.predictionsRequired).total;

      if (phaseRequired <= 0) {
        continue;
      }

      const have = countsByPhase[phase.id] || 0;
      const report = predictions.valid || predictions.exists
        ? predictionsReport({ dir, phase, predictions })
        : { required: phaseRequired, count: have, missing: Math.max(0, phaseRequired - have), missingByType: {} };

      if (report.missing > 0) {
        const legacyHint = jsonEmptyOverNonEmptyLegacy
          ? " (docs/plans/predictions.md has legacy entries, but .ai-learn/predictions.json now takes precedence — record new ones with `ai-learn predict`)"
          : "";

        issues.warnings.push({
          file: countsSource,
          message: `${formatPredictionsGap(phase, report)}${legacyHint}`,
        });
      }
    }
  }

  // The visible escape hatch: a correction the AI typed because the learner was
  // genuinely stuck. Legitimate, but worth surfacing so it never becomes the
  // default — the learner-file block exists to prevent exactly that drift.
  if (iaTypedCount > 0) {
    issues.warnings.push({
      file: countsSource || "docs/plans/predictions.md",
      message: `${iaTypedCount} correction(s) marked "Corrigé par : IA" — the learner-file block was bypassed for those bricks (visible escape hatch)`,
    });
  }

  for (const phase of config.phases || []) {
    const relative = (artifact) => normalizeRelative(dir, artifact);
    const ev = latestEvidenceForPhase(dir, phase.id);
    const checkpointFile = checkpointFilePath(dir, phase.checkpoint);

    checkDigest(dir, config, phase, issues);

    if (phase.status === "done") {
      if (!phase.checkpoint) {
        issues.warnings.push({
          file: "progress.json",
          message: `phase ${phase.id} ("${phase.name}") is done but has no checkpoint — it cannot be proven`,
        });
      } else {
        // Only cost a hash computation (a full walkSources) when the evidence
        // actually carries a sourceHash to compare against — proven-unhashed
        // (legacy evidence) and unproven (no evidence) don't need it.
        const currentHash = ev && ev.sourceHash ? computeSourceHash(dir, { checkpointFile }) : null;
        const verdict = phaseVerdict({ phase, evidence: ev, currentHash, checkpointFileExists: Boolean(checkpointFile) });

        if (verdict.state === "unproven") {
          issues.errors.push({
            file: "progress.json",
            message: `phase ${phase.id} ("${phase.name}") is marked done but has no passing evidence. Run \`ai-learn verify ${phase.id}\`.`,
          });
        } else if (verdict.state === "stale") {
          // `entries` is absent on evidence written before story 01.02 —
          // still detected as stale by the global digest, just not
          // nameable file-by-file; fall back to the untargeted wording.
          const changed = ev.sourceHash.entries ? changedSourceFiles(ev.sourceHash, currentHash) : [];
          const changeDetail =
            changed.length > 0
              ? `${changed.length} file(s) changed since \`ai-learn verify ${phase.id}\` last passed (${previewFileList(changed)})`
              : `learner files changed since \`ai-learn verify ${phase.id}\` last passed`;

          // `check` never recomputes mutation itself (spec.md Requirements —
          // a checkpoint-per-mutant run would break its read-only, fast
          // contract); the existing sourceHash staleness already covers it
          // indirectly, since evidence.mutation is part of the same stale
          // proof. This clause only makes that indirection explicit so a
          // learner doesn't read "stale" as clean-code-only (plan.md
          // Technical Notes).
          const mutationClause =
            phase.mutation === true
              ? " (inclut la preuve de mutation — un mutant qui survivait ou non n'est plus garanti)"
              : "";

          issues.errors.push({
            file: "progress.json",
            message: `phase ${phase.id} ("${phase.name}") is done but its proof is stale — ${changeDetail}.${mutationClause} Run \`ai-learn verify --stale\` to re-prove it.`,
          });
        } else {
          // Retention (story 07.02): the proof still covers the code, but the
          // learner has not redone the phase from memory within its
          // `reviewAfterDays`. A warning, never an error — forgetting is a
          // signal, not a lie, and the phase stays `done`.
          const revisit = revisitState({ phase, evidence: ev, now });

          if (revisit && revisit.due) {
            issues.warnings.push({
              file: "progress.json",
              message:
                `phase ${phase.id} ("${phase.name}") has not been revisited since ${revisit.lastProvenAt.slice(0, 10)} ` +
                `(more than ${revisit.reviewAfterDays} day(s)). Redo it from memory, without notes or the prediction journal: ` +
                `\`ai-learn verify ${phase.id} --revisit\`.`,
            });
          }
        }
      }

      for (const artifact of phase.artifacts || []) {
        if (!fs.existsSync(path.join(dir, artifact))) {
          issues.errors.push({ file: relative(artifact), message: `phase ${phase.id} requires artifact ${relative(artifact)}` });
        }
      }

      // Tier 6 ("read a stranger's diff") has no after-the-fact git/gh trace
      // to detect — reading a diff leaves nothing behind. Its only proof is
      // the phase's own artifact: it must cite a real PR URL, with the same
      // "presence + minimum substance, not truth" contract already applied
      // to a generated doc source's origin citation (see docCitesOrigin).
      if (phase.gitTier === 6) {
        checkTier6Artifact(dir, phase, issues, relative);
      }

      // In dirigeant mode the learner no longer types the implementation: the
      // only contribution left to prove is judgment. A done phase without a
      // sourced review (`docs/reviews/<brique>.md`) is not proven.
      if (guard.mode === "dirigeant") {
        checkReview(dir, phase, issues, guard.implementationFiles, duplicateReviewNames);
        // The other half of that judgment is the specification: the learner's
        // test must provably kill at least one mutant. Reported separately from
        // the review — they prove different things.
        checkMutationKilled(phase, ev, issues);
      }
    } else {
      // A `--no-mark` run deliberately writes passing evidence without
      // touching the ledger (see verify.js's `marking` field) — that is not
      // drift, it is the flag working as intended. Evidence written before
      // story 01.02 has no `marking` field and keeps the existing warning.
      //
      // Neither is a legitimate demotion: a failing verify is *why* the
      // phase left `done` (see verify.js), and that failing run is
      // necessarily the most recent evidence for this phase. Found while
      // manually reproducing the demotion — without this, every single
      // demotion would immediately trip this warning. Only warn when
      // passing evidence sits there with nothing more recent explaining why
      // the phase isn't done: evidence forged/copied in, or `progress.json`
      // edited by hand without a new verify run.
      const demoted = Boolean(ev) && latestAnyEvidenceForPhase(dir, phase.id).ok === false;

      if (ev && ev.marking !== "skipped" && !demoted) {
        issues.warnings.push({
          file: "progress.json",
          message: `phase ${phase.id} has passing evidence but is not marked done (stale or reverted?)`,
        });
      }

      // The structural backstop: a checkpoint test file that exists but has no
      // passing evidence means the agent wrote the proof but never ran it —
      // verify was skipped even though the work was done. This is what makes
      // verify non-skippable by omission, not just by word. Relaxed for
      // `in_progress` (still mid-phase, not a lie) — `phaseVerdict` keeps the
      // error only for `pending`.
      const verdict = phaseVerdict({ phase, evidence: ev, checkpointFileExists: Boolean(checkpointFile) });

      if (verdict.state === "unproven") {
        issues.errors.push({
          file: relative(checkpointFile),
          message: `checkpoint exists but no passing evidence — run \`ai-learn verify ${phase.id}\``,
        });
      }
    }
  }

  return { dir, config, issues };
}

// Story 06.02 — a generated digest is a snapshot of line ranges. The source
// can move under it (a doc update, a hand edit), so `check` re-resolves every
// citation and warns when a range no longer exists. A warning, never an error:
// the fix is `ai-learn docs digest --phase <id>`, not a broken project.
function checkDigest(dir, config, phase, issues) {
  const target = digestPath(dir, phase.id);

  if (!fs.existsSync(target)) {
    return;
  }

  const content = fs.readFileSync(target, "utf8");
  const relative = normalizePortable(path.relative(dir, target));

  for (const citation of digestCitations(content)) {
    const problem = digestCitationProblem(dir, config, citation);

    if (problem) {
      issues.warnings.push({
        file: relative,
        message: `phase ${phase.id} digest: ${problem} — regenerate with \`ai-learn docs digest --phase ${phase.id}\``,
      });
    }
  }

  // Story 06.03 — a declared reading budget turns the digest into a checked
  // promise: over it, the learner is back to pre-reading whole files. A
  // warning, never an error: the budget is a nudge, not a proof.
  if (Number.isInteger(phase.readingBudgetMin) && phase.readingBudgetMin > 0) {
    const words = (content.match(/\S+/g) || []).length;
    const minutes = Math.ceil(words / READING_WORDS_PER_MINUTE);

    if (minutes > phase.readingBudgetMin) {
      issues.warnings.push({
        file: relative,
        message:
          `phase ${phase.id} digest is ~${minutes} min of reading (${words} words at ` +
          `${READING_WORDS_PER_MINUTE} wpm), over the declared readingBudgetMin (${phase.readingBudgetMin} min)`,
      });
    }
  }
}

// A `generated` source was never cloned — the AI had to recreate the doc
// locally from a verified origin. The origin is either a URL (`--regen`) or a
// local file (ex. a PDF book: the file is embedded whole, the AI distills only
// what the plan needs into a .md). Same structural guards, mirroring the way
// verify proves phases: the origin is the provenance, a non-empty .md must
// exist (the recreation actually happened), and it must cite its origin with
// real content around the citation — not just a trailing "Source: X" line
// stapled onto an otherwise empty or hallucinated file. This is a presence +
// minimum-substance check, not a truth check: it cannot tell a faithful
// distillation from a hallucinated one that happens to cite its source
// correctly. It only refuses the degenerate, cheap-to-fake case.
function checkGeneratedSource(dirPath, source, issues) {
  const origin = source.url || source.file;

  if (!origin) {
    issues.errors.push({
      file: "progress.json",
      message: `generated source "${source.name}" has no origin — nothing to verify it against`,
    });
  }

  if (!findTranscript(dirPath)) {
    issues.errors.push({
      file: "progress.json",
      message: `generated source "${source.name}" is empty — no essential .md yet; the AI must recreate it locally from its verified origin (${origin || "no origin recorded"})`,
    });
    return;
  }

  if (origin && !docCitesOrigin(dirPath, String(origin))) {
    issues.warnings.push({
      file: source.path,
      message:
        `generated source "${source.name}" does not cite its origin with enough real content around it — ` +
        `a bare "Source: ${origin}" line is not enough (this check verifies presence and minimum ` +
        `substance, not that the content is accurate)`,
    });
  }
}

// The first non-empty markdown file in a generated source directory. A
// generated source is only "recreated" once the AI has written a real
// transcript — the origin file itself (a PDF, say) does not count.
function findTranscript(dirPath) {
  let entries;

  try {
    entries = fs.readdirSync(dirPath, { withFileTypes: true });
  } catch {
    return null;
  }

  for (const entry of entries) {
    if (!entry.isFile() || path.extname(entry.name).toLowerCase() !== ".md") {
      continue;
    }

    try {
      if (fs.statSync(path.join(dirPath, entry.name)).size > 0) {
        return path.join(dirPath, entry.name);
      }
    } catch {
      // unreadable file — skip
    }
  }

  return null;
}

// Does any file in the generated source mention its origin URL, with enough
// content around the citation to not be the degenerate case of a hallucinated
// (or empty) file with a citation stapled onto it? The AI may write the URL
// with or without scheme/trailing slash, so compare normalized. Presence
// check only — it cannot verify the surrounding content is *accurate*, only
// that there is a non-trivial amount of it next to a real citation.
function docCitesOrigin(dirPath, url) {
  const needle = normalizeOrigin(url);
  let entries;

  try {
    entries = fs.readdirSync(dirPath, { withFileTypes: true });
  } catch {
    return false;
  }

  for (const entry of entries) {
    if (!entry.isFile() || entry.name.startsWith(".")) {
      continue;
    }

    let content;

    try {
      content = fs.readFileSync(path.join(dirPath, entry.name), "utf8");
    } catch {
      continue; // unreadable file — skip
    }

    if (!content.includes(needle)) {
      continue;
    }

    if (hasSubstantialBody(content, needle)) {
      return true;
    }
  }

  return false;
}

function normalizeOrigin(url) {
  return String(url).replace(/^https?:\/\//, "").replace(/\/+$/, "");
}

// Same presence-check shape as `docCitesOrigin`, applied to a phase artifact
// instead of a doc-source directory: a real PR URL, plus enough real content
// around it that the citation isn't stapled onto an empty or hallucinated file.
// The core lives in citation.js — the dirigeant review reuses it for file:line.
function checkTier6Artifact(dir, phase, issues, relative) {
  const artifacts = phase.artifacts || [];
  let found = false;

  for (const artifact of artifacts) {
    const full = path.join(dir, artifact);

    if (!fs.existsSync(full)) {
      continue; // already flagged by the artifact-existence check above
    }

    let content;

    try {
      content = fs.readFileSync(full, "utf8");
    } catch {
      continue;
    }

    if (citesRealPRUrl(content)) {
      found = true;
      break;
    }
  }

  if (!found) {
    issues.errors.push({
      file: artifacts.length > 0 ? relative(artifacts[0]) : "progress.json",
      message:
        `phase ${phase.id} ("${phase.name}") is a gitTier 6 phase marked done but no artifact cites a real ` +
        "PR URL (https://github.com/<org>/<repo>/pull/<n>) with enough real content around it — " +
        "reading a stranger's diff leaves no other trace to verify against",
    });
  }
}

// The dirigeant review tier: one sourced review per done phase. Presence is
// not enough — the review must cite a real, resolvable `file:line` and state a
// decision. Same "presence + minimum substance, not truth" contract as a tier-6
// PR URL (see citation.js); the tool proves the citation resolves, never that
// the judgment is good.
function checkReview(dir, phase, issues, scope, duplicates) {
  const review = reviewState(dir, phase, scope, duplicates);

  if (review.state === "valid") {
    return;
  }

  const reasons = {
    missing: "is missing — the learner's sourced review is the proof of judgment",
    unreadable: "is unreadable — a review must cite a real file:line and a decision",
    "no-citation":
      "cites no real file:line from the diff — a review without a resolvable citation proves nothing",
    "no-decision": "states no decision (accepter, rejeter, demander un changement)",
    "insufficient-substance":
      `has too little content around its citation (${review.citation || "file:line"}) — ` +
      "same presence + minimum-substance contract as a PR URL",
    "ambiguous-name":
      "is shared with another phase of the same name — rename one phase so each review is unique",
  };

  issues.errors.push({
    file: review.path,
    message: `phase ${phase.id} ("${phase.name}") is done in dirigeant mode but ${review.path} ` +
      `${reasons[review.reason] || "is invalid"}`,
  });
}

// The dirigeant mutation-killer tier (story 03.04): a done phase must show at
// least one mutant killed by the learner's test. `verify` already wrote
// `evidence.mutation` (story 02.03); check only reads it — recomputing would run
// the checkpoint once per mutant on every `check`, the same fast/read-only
// contract story 02.04 preserved. `killed === 0` proves no specification, and
// `required: false` means `verify` never measured mutation for this phase, so
// it proves nothing either. A phase with no passing evidence is already an
// error ("marked done but has no passing evidence") — do not double-report.
function checkMutationKilled(phase, ev, issues) {
  if (!ev) {
    return;
  }

  const measured = ev.mutation && ev.mutation.required === true;
  const killed = measured ? ev.mutation.killed || 0 : 0;

  if (killed >= 1) {
    return;
  }

  const truncatedNote = measured && ev.mutation.truncated ? " — measure truncated, not every site was tried" : "";
  const detail = measured ? `${killed} mutant(s) killed${truncatedNote}` : "mutation never measured for this phase";

  issues.errors.push({
    file: "progress.json",
    message: `phase ${phase.id} ("${phase.name}") is done in dirigeant mode yet no mutant killed by the learner's test ` +
      `is proven (${detail}) — the specification is the learner's only contribution; write a test that kills at ` +
      `least one mutant, then run \`ai-learn verify ${phase.id}\``,
  });
}

// Evidence journal format: one `### Phase <N> — prédiction <k>/<total>` heading per
// recorded prediction. Structural count only — honesty is the learner's.
// `gm`: `g` to count every heading, not just the first; `m` so `^` anchors each
// line instead of only the start of the whole file (without it, both bugs
// combined into a verdict that was structurally always ~0, never the real count).
// Separator is `[—–-]`: a project without predictions.json is counted from
// this legacy `.md` alone, and it must not fail on a plain hyphen where the
// learner (or an older ai-learn) typed one instead of the em dash.
function countJournalEntries(journalPath) {
  const content = fs.readFileSync(journalPath, "utf8");
  return (content.match(/^###\s+Phase\s+\d+\s+[—–-]\s+prédiction/gim) || []).length;
}

// Same heading, grouped by phase — the regex already captures the phase
// number, the legacy total-only count above just never kept it. Used only
// when there is no valid predictions.json (see checkProject).
function countJournalEntriesByPhase(journalPath) {
  const content = fs.readFileSync(journalPath, "utf8");
  const counts = {};
  const re = /^###\s+Phase\s+(\d+)\s+[—–-]\s+prédiction/gim;
  let match = re.exec(content);

  while (match) {
    const phaseId = Number(match[1]);
    counts[phaseId] = (counts[phaseId] || 0) + 1;
    match = re.exec(content);
  }

  return counts;
}

// Corrections the learner explicitly handed to the AI ("Corrigé par : IA").
// Structural count only; a legitimate stuck-learner exception, not a proof.
function countIATypedCorrections(journalPath) {
  const content = fs.readFileSync(journalPath, "utf8");
  return (content.match(/^-\s*Corrigé par\s*:\s*IA\b/gim) || []).length;
}

// Friction journal entries: one `### <severity> — <title>` heading per entry,
// same convention as docs/DOGFOODING.md. Purely informational — see
// printProjectReport: zero entries is a legitimate outcome, never flagged.
function countDogfoodEntries(dogfoodPath) {
  const content = fs.readFileSync(dogfoodPath, "utf8");
  return (content.match(/^###\s+(?:low|medium|high)\s+—/gim) || []).length;
}

// Is the `ai-learn guard` PreToolUse hook wired into the project's
// .claude/settings.json? The block is only real when the hook is installed.
function guardHookWired(dir) {
  const settingsPath = path.join(dir, ".claude", "settings.json");
  let settings = null;

  try {
    if (fs.existsSync(settingsPath)) {
      settings = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
    }
  } catch {
    return false;
  }

  const preToolUse =
    settings && settings.hooks && Array.isArray(settings.hooks.PreToolUse) ? settings.hooks.PreToolUse : [];

  return preToolUse.some(
    (entry) =>
      entry &&
      Array.isArray(entry.hooks) &&
      entry.hooks.some((h) => h && isOwnGuardCommand(h.command)),
  );
}

// Is Codex's mechanical guard (a .codex/config.toml permissions profile)
// wired for this project? Only true for a file ai-learn generated itself —
// see ensureCodexGuard's marker convention in guard.js.
function codexGuardWired(dir) {
  const configPath = path.join(dir, ".codex", "config.toml");

  try {
    return fs.readFileSync(configPath, "utf8").startsWith(CODEX_GUARD_MARKER);
  } catch {
    return false;
  }
}

function normalizeRelative(dir, value) {
  return path.relative(dir, path.resolve(dir, value)).replace(/\\/g, "/");
}

// The first few changed paths named in a stale message, plus how many more —
// naming every path on a large rename would bury the point in noise.
function previewFileList(paths, limit = 3) {
  const shown = paths.slice(0, limit).join(", ");
  return paths.length > limit ? `${shown}, and ${paths.length - limit} more` : shown;
}

function printProjectReport(entry) {
  const { config, issues } = entry;

  log(`\n${path.basename(entry.dir)}`);

  if (!config) {
    log("  ✗ progress.json invalid");
    return;
  }

  const done = config.phases.filter((phase) => phase.status === "done").length;
  log(`  ${done}/${config.phases.length} phases done`);

  for (const error of issues.errors) {
    log(`  ✗ ${error.file ? `${error.file}: ` : ""}${error.message}`);
  }

  for (const warning of issues.warnings) {
    log(`  ⚠ ${warning.file ? `${warning.file}: ` : ""}${warning.message}`);
  }

  // The learner-file block, when active, reports how many AI writes it has
  // refused so far — the reassurance that the block is real, not decorative.
  if (fs.existsSync(path.join(entry.dir, ".ai-learn", "guard.json"))) {
    const blocks = countGuardBlocks(entry.dir);
    const wired = guardHookWired(entry.dir);
    log(`  guard (claude): ${wired ? `actif — ${blocks} écriture(s) IA bloquée(s) sur les fichiers de l'apprenant` : "configuré mais hook non câblé"}`);
    log(`  guard (codex): ${codexGuardWired(entry.dir) ? "actif (bac à sable OS)" : "configuré mais profil non câblé"}`);

    if (usesOpenCode(entry.dir)) {
      const openCode = inspectOpenCodeGuard(entry.dir);
      log(`  guard (opencode): ${openCode.state === "current" ? "actif (plugin tool.execute.before)" : `inactif — plugin ${openCode.state}`}`);
    }
  }

  // Purely informational: zero entries is a legitimate outcome (no friction
  // encountered), never a warning — see countDogfoodEntries.
  const dogfoodPath = path.join(entry.dir, ".ai-learn", "dogfood.md");

  if (fs.existsSync(dogfoodPath)) {
    log(`  dogfood: ${countDogfoodEntries(dogfoodPath)} entrée(s) de friction consignée(s)`);
  }
}

function countGuardBlocks(dir) {
  const logPath = path.join(dir, ".ai-learn", "guard.log");

  try {
    if (!fs.existsSync(logPath)) {
      return 0;
    }
    return fs.readFileSync(logPath, "utf8").split("\n").filter(Boolean).length;
  } catch {
    return 0;
  }
}

// The JSON-facing calc: the same `checkProject` result as the text report,
// reshaped into a stable, versioned object instead of printed lines. Paths go
// through `normalizePortable` so a Windows separator never leaks into the
// contract (see spec.md's edge cases).
function buildCheckReport(root) {
  const projects = findLearningProjects(root);
  const entries = [];
  let errors = 0;
  let warnings = 0;

  for (const project of projects) {
    const entry = checkProject(project);

    if (!entry) {
      continue;
    }

    const report = {
      dir: normalizePortable(path.relative(root, entry.dir) || path.basename(entry.dir)),
      errorList: entry.issues.errors,
      warningList: entry.issues.warnings,
    };

    if (entry.config) {
      report.phasesDone = entry.config.phases.filter((phase) => phase.status === "done").length;
      report.phasesTotal = entry.config.phases.length;
    }

    entries.push(report);
    errors += entry.issues.errors.length;
    warnings += entry.issues.warnings.length;
  }

  return { version: 1, root: normalizePortable(root), projects: entries, errors, warnings, ok: errors === 0 };
}

function checkCommand({ root, json }) {
  if (json) {
    const report = buildCheckReport(root);
    log(JSON.stringify(report));

    if (!report.ok) {
      process.exitCode = 1;
    }
    return;
  }

  const projects = findLearningProjects(root);

  if (projects.length === 0) {
    log(`No learning projects (no progress.json) under ${root}.`);
    return;
  }

  log(`Checking ${projects.length} learning project(s) under ${root}:`);

  let errors = 0;
  let warnings = 0;

  for (const project of projects) {
    const entry = checkProject(project);

    if (entry) {
      printProjectReport(entry);
      errors += entry.issues.errors.length;
      warnings += entry.issues.warnings.length;
    }
  }

  log(`\n${errors} error(s), ${warnings} warning(s).`);

  if (errors > 0) {
    log("✗ check FAILED");
    process.exitCode = 1;
  } else {
    log("✓ check passed");
  }
}

module.exports = {
  checkCommand,
  buildCheckReport,
  checkProject,
  countJournalEntries,
  countIATypedCorrections,
  countDogfoodEntries,
  guardHookWired,
  codexGuardWired,
};
