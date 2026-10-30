"use strict";

const { test, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const {
  checkProject,
  checkCommand,
  buildCheckReport,
  countDogfoodEntries,
  countJournalEntries,
  guardHookWired,
} = require("../bin/lib/check");
const { ensureGuardHook } = require("../bin/lib/guard");
const { verifyCommand } = require("../bin/lib/verify");
const { readProgress, latestEvidenceForPhase } = require("../bin/lib/progress");
const { ensureCommitMsgHook } = require("../bin/lib/git-hooks");
const { capture, sampleProgress, tmpProject, writeFile, spawnGit, withHome } = require("./helpers");
const { scaffold } = require("../bin/lib/init");
const { generateDigest } = require("../bin/lib/docs");
const { findLearningProjects } = require("../bin/lib/util");

function initRepo(dir) {
  spawnGit(["init", "-b", "main"], { cwd: dir });
  spawnGit(["-C", dir, "config", "user.name", "t"]);
  spawnGit(["-C", dir, "config", "user.email", "t@t"]);
}

function commitNoVerify(dir, message) {
  fs.writeFileSync(path.join(dir, `f-${Date.now()}-${Math.random()}.txt`), "x");
  spawnGit(["-C", dir, "add", "."]);
  spawnGit(["-C", dir, "commit", "--no-verify", "-m", message]);
}

// A checkpoint that fails when the mutated literal flips — the one mutant
// found (`src/index.js`'s `true`) is killed, so a real `verify` marks the
// phase done. A checkpoint that never inspects the return value instead
// leaves the mutant surviving (same fixtures as test/verify.test.js).
const STRONG_CHECKPOINT = "node -e \"const { isReady } = require('./src/index.js'); if (isReady() !== true) process.exit(1)\"";
const WEAK_CHECKPOINT = 'node -e "require(\'./src/index.js\')"';

function mutationPhase(checkpoint, overrides = {}) {
  return sampleProgress({
    phases: [
      { id: 0, name: "Phase zero", status: "pending", checkpoint, artifacts: [], predictionsRequired: 0, mutation: true, ...overrides },
    ],
  });
}

// Long enough to clear the citation content floor (200 chars) without ever
// containing a `file:line` or a decision word — the scaffold the dirigeant
// review tests add one ingredient to at a time.
const REVIEW_FILLER =
  "Cette revue détaille le raisonnement du relecteur sur le diff de la brique : " +
  "ce qu'il a vérifié, ce qui tient, ce qui ne tient pas, et pourquoi. ".repeat(2);

// A done phase in dirigeant mode with real passing evidence and a one-line
// source file, so a citation to line 1-3 resolves. The review file is left to
// each test — its absence is itself a case under test.
function dirigeantProject() {
  const progress = sampleProgress();
  progress.phases[0].status = "done";
  const dir = tmpProject(progress);
  writeFile(dir, ".ai-learn/guard.json", JSON.stringify({ version: 1, mode: "dirigeant", implementationFiles: ["src/**"] }));
  writeFile(dir, "src/index.js", "const one = 1;\nconst two = 2;\nconst three = 3;\n");
  capture(() => verifyCommand({ dir, phaseId: 0 }));
  return dir;
}

// Story 03.04: a dirigeant done phase whose evidence was written by a real
// `verify` run. The review is valid so only the mutation-killer tier is under
// test; pass `checkpoint`/`source` to control what mutation measured (the
// strong fixture kills one mutant, the no-op one has no mutable site).
function dirigeantMutationProject({ checkpoint = STRONG_CHECKPOINT, source, overrides = {} } = {}) {
  const dir = tmpProject(mutationPhase(checkpoint, overrides));
  writeFile(dir, ".ai-learn/guard.json", JSON.stringify({ version: 1, mode: "dirigeant", implementationFiles: ["src/**"] }));
  writeFile(
    dir,
    "src/index.js",
    source || "function isReady() {\n  return true;\n}\n\nmodule.exports = { isReady };\n",
  );
  capture(() => verifyCommand({ dir, phaseId: 0 }));
  writeFile(dir, "docs/reviews/phase-zero.md", `${REVIEW_FILLER}\n\nCitation : \`src/index.js:1\`\n\nDécision : accepter.\n`);
  return dir;
}

// A source with no mutable site (no boolean/comparison literal), so a real
// verify marks the phase done with `mutation.required: true` and `killed: 0`.
const NO_MUTABLE_SITE_SOURCE = "module.exports = { add: (a, b) => a + b };\n";

const NO_KILLED_MUTANT_RE = /no mutant killed by the learner's test/;

beforeEach(() => {
  process.exitCode = 0;
});

afterEach(() => {
  // A test that intentionally fails a check leaves exitCode at 1; the file must
  // still exit cleanly or node --test reports the whole file as broken.
  process.exitCode = 0;
});

test("guardHookWired recognises the quoted command written by ensureGuardHook (and the legacy unquoted form)", () => {
  // Regression guard for story 08.04: quoting the binary path must not make
  // `check`/`status` believe the hook is missing (they used a regex that did not
  // tolerate the quote between `.js` and `guard`).
  const dir = tmpProject(sampleProgress());
  ensureGuardHook(dir);
  assert.strictEqual(guardHookWired(dir), true);

  const legacy = tmpProject(sampleProgress());
  writeFile(
    legacy,
    ".claude/settings.json",
    JSON.stringify({
      hooks: { PreToolUse: [{ matcher: "Write", hooks: [{ type: "command", command: "node /tmp/ai-learn.js guard" }] }] },
    }),
  );
  assert.strictEqual(guardHookWired(legacy), true);

  const globalInstall = tmpProject(sampleProgress());
  writeFile(
    globalInstall,
    ".claude/settings.json",
    JSON.stringify({
      hooks: { PreToolUse: [{ matcher: "Write", hooks: [{ type: "command", command: "ai-learn guard" }] }] },
    }),
  );
  assert.strictEqual(guardHookWired(globalInstall), true);
});

test("a phase marked done without evidence is an error", () => {
  const progress = sampleProgress();
  progress.phases[0].status = "done";
  const dir = tmpProject(progress);

  const entry = checkProject(dir);
  assert.ok(entry.issues.errors.some((e) => /marked done but has no passing evidence/.test(e.message)));
  assert.strictEqual(entry.issues.warnings.length, 0);
});

test("check warns when a phase digest cites lines the source no longer has", () => {
  const progress = sampleProgress({
    docSource: {
      type: "local",
      sources: [{ name: "fastify-docs", mode: "local", path: "docs/sources/fastify-docs" }],
    },
    phases: [
      {
        id: 1,
        name: "Routes",
        status: "pending",
        checkpoint: 'node -e "process.exit(0)"',
        artifacts: [],
        predictionsRequired: 0,
        sections: [{ source: "fastify-docs", file: "Reference/Routes.md", from: 2, to: 4 }],
      },
    ],
  });
  const dir = tmpProject(progress);
  writeFile(dir, "docs/sources/fastify-docs/Reference/Routes.md", "# Routes\nline two\nline three\nline four\n");
  generateDigest({ dir, phaseId: "1" });

  writeFile(dir, "docs/sources/fastify-docs/Reference/Routes.md", "# Routes\nline two\n");

  const entry = checkProject(dir);

  assert.ok(
    entry.issues.warnings.some(
      (warning) => /phase 1 digest/.test(warning.message) && /past the end of the file/.test(warning.message),
    ),
  );
});

test("a norm violation in the learner's files is an error (hard block), not a warning", () => {
  const progress = sampleProgress();
  const dir = tmpProject(progress);
  writeFile(dir, ".ai-learn/norm.json", JSON.stringify({ version: 1, maxFunctionLines: 3 }));
  writeFile(
    dir,
    "src/index.js",
    "function tooLong() {\n  const a = 1;\n  const b = 2;\n  const c = 3;\n  return a + b + c;\n}\n",
  );

  const entry = checkProject(dir);
  assert.ok(entry.issues.errors.some((e) => /function-length/.test(e.message)));
  assert.ok(entry.issues.errors.some((e) => e.file === "src/index.js:1"));
});

test("a project with no norm violation reports none (no regression on the clean-fixture path)", () => {
  const progress = sampleProgress();
  const dir = tmpProject(progress);
  writeFile(dir, "src/index.js", "function fine() {\n  return 1;\n}\n");

  const entry = checkProject(dir);
  assert.ok(!entry.issues.errors.some((e) => /\[function-length\]|\[file-length\]|\[nesting-depth\]|\[param-count\]/.test(e.message)));
});

test("check warns when a phase digest exceeds its declared reading budget", () => {
  const progress = sampleProgress({
    phases: [
      {
        id: 1,
        name: "Routes",
        status: "pending",
        checkpoint: 'node -e "process.exit(0)"',
        artifacts: [],
        predictionsRequired: 0,
        readingBudgetMin: 30,
      },
    ],
  });
  const dir = tmpProject(progress);
  writeFile(dir, "docs/digests/phase-1.md", "word ".repeat(12000));

  const entry = checkProject(dir);

  assert.ok(
    entry.issues.warnings.some(
      (warning) =>
        /~60 min of reading/.test(warning.message) &&
        /12000 words/.test(warning.message) &&
        /readingBudgetMin \(30 min\)/.test(warning.message),
    ),
  );
});

test("a phase without readingBudgetMin keeps check silent about reading time", () => {
  const progress = sampleProgress({
    phases: [
      {
        id: 1,
        name: "Routes",
        status: "pending",
        checkpoint: 'node -e "process.exit(0)"',
        artifacts: [],
        predictionsRequired: 0,
      },
    ],
  });
  const dir = tmpProject(progress);
  writeFile(dir, "docs/digests/phase-1.md", "word ".repeat(12000));

  const entry = checkProject(dir);

  assert.ok(!entry.issues.warnings.some((warning) => /reading/.test(warning.message)));
});

test("a digest within its reading budget stays silent", () => {
  const progress = sampleProgress({
    phases: [
      {
        id: 1,
        name: "Routes",
        status: "pending",
        checkpoint: 'node -e "process.exit(0)"',
        artifacts: [],
        predictionsRequired: 0,
        readingBudgetMin: 30,
      },
    ],
  });
  const dir = tmpProject(progress);
  writeFile(dir, "docs/digests/phase-1.md", "word ".repeat(100));

  const entry = checkProject(dir);

  assert.ok(!entry.issues.warnings.some((warning) => /reading/.test(warning.message)));
});

test("a digest exactly at its reading budget stays silent", () => {
  const progress = sampleProgress({
    phases: [
      {
        id: 1,
        name: "Routes",
        status: "pending",
        checkpoint: 'node -e "process.exit(0)"',
        artifacts: [],
        predictionsRequired: 0,
        readingBudgetMin: 30,
      },
    ],
  });
  const dir = tmpProject(progress);
  writeFile(dir, "docs/digests/phase-1.md", "word ".repeat(6000));

  const entry = checkProject(dir);

  assert.ok(!entry.issues.warnings.some((warning) => /reading/.test(warning.message)));
});

test("readingBudgetMin accepts a positive integer and rejects anything else", () => {
  const phase = (readingBudgetMin) => ({
    id: 1,
    name: "Routes",
    status: "pending",
    checkpoint: 'node -e "process.exit(0)"',
    artifacts: [],
    predictionsRequired: 0,
    readingBudgetMin,
  });

  const valid = tmpProject(sampleProgress({ phases: [phase(30)] }));
  assert.ok(!checkProject(valid).issues.errors.some((error) => /readingBudgetMin/.test(error.message)));

  for (const bad of [0, -5, 1.5, "30"]) {
    const dir = tmpProject(sampleProgress({ phases: [phase(bad)] }));
    assert.ok(
      checkProject(dir).issues.errors.some((error) => /invalid readingBudgetMin/.test(error.message)),
      `expected an error for ${JSON.stringify(bad)}`,
    );
  }
});

test("an out-of-range gitTier is a warning, not an error; a valid one is silent", () => {
  const progress = sampleProgress();
  progress.phases[0].gitTier = 9;
  const dir = tmpProject(progress);

  const entry = checkProject(dir);
  assert.strictEqual(entry.issues.errors.length, 0);
  assert.ok(entry.issues.warnings.some((w) => /out-of-range gitTier/.test(w.message)));

  progress.phases[0].gitTier = 3;
  const dirValid = tmpProject(progress);
  const entryValid = checkProject(dirValid);
  assert.ok(!entryValid.issues.warnings.some((w) => /gitTier/.test(w.message)));
});

test("a non-boolean phase.mutation is a warning, not an error; a real boolean is silent", () => {
  const progress = sampleProgress();
  progress.phases[0].mutation = "true";
  const dir = tmpProject(progress);

  const entry = checkProject(dir);
  assert.strictEqual(entry.issues.errors.length, 0);
  assert.ok(entry.issues.warnings.some((w) => /non-boolean mutation flag/.test(w.message)));

  progress.phases[0].mutation = true;
  const dirValid = tmpProject(progress);
  const entryValid = checkProject(dirValid);
  assert.ok(!entryValid.issues.warnings.some((w) => /mutation flag/.test(w.message)));
});

test("a done phase with a green evidence passes", () => {
  // An isolated home: verify syncs into it, so check finds the project there.
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "ai-learn-check-home-"));
  const progress = sampleProgress();
  const dir = tmpProject(progress);

  capture(() => verifyCommand({ dir, phaseId: 0, home }));

  const entry = checkProject(dir, { home });
  assert.deepStrictEqual(entry.issues.errors, []);
  assert.deepStrictEqual(entry.issues.warnings, []);
});

test("check auto-writes a dogfood entry when the claude/codex guard isn't wired, deduplicated across runs", () => {
  const dir = tmpProject(sampleProgress());
  writeFile(dir, ".ai-learn/guard.json", JSON.stringify({ version: 1, learnerFiles: ["src/**"] }));
  writeFile(dir, ".ai-learn/dogfood.md", "# Journal de friction\n\n## Entrées\n\n<!-- Nouvelle entrée en haut, sous cette ligne. -->\n");

  checkProject(dir);
  const afterFirst = fs.readFileSync(path.join(dir, ".ai-learn", "dogfood.md"), "utf8");
  assert.match(afterFirst, /<!-- auto:claude-code:hook-guard:/);
  assert.match(afterFirst, /<!-- auto:codex:config:/);
  assert.match(afterFirst, /écrite automatiquement par `ai-learn check`, pas par l'agent/);

  checkProject(dir); // second run: must not duplicate the same finding
  const afterSecond = fs.readFileSync(path.join(dir, ".ai-learn", "dogfood.md"), "utf8");
  assert.strictEqual(afterSecond, afterFirst);
});

test("a guard policy without a wired codex profile is a warning, not an error", () => {
  const dir = tmpProject(sampleProgress());
  writeFile(dir, ".ai-learn/guard.json", JSON.stringify({ version: 1, learnerFiles: ["src/**"] }));

  const entry = checkProject(dir);
  assert.deepStrictEqual(entry.issues.errors, []);
  assert.ok(entry.issues.warnings.some((w) => /ai-learn permissions profile/.test(w.message)));
});

test("a git repo without the commit-msg hook wired is a warning", () => {
  const dir = tmpProject(sampleProgress());
  initRepo(dir);

  const entry = checkProject(dir);
  assert.deepStrictEqual(entry.issues.errors, []);
  assert.ok(entry.issues.warnings.some((w) => /commit-msg hook not wired/.test(w.message)));
});

test("a project with no .git yet is silent on the commit-msg hook", () => {
  const dir = tmpProject(sampleProgress());
  const entry = checkProject(dir);
  assert.ok(!entry.issues.warnings.some((w) => /commit-msg hook/.test(w.message)));
});

test("a wired hook with clean Conventional Commits history is silent", () => {
  const dir = tmpProject(sampleProgress());
  initRepo(dir);
  ensureCommitMsgHook(dir);
  fs.writeFileSync(path.join(dir, "a.txt"), "x");
  spawnGit(["-C", dir, "add", "."]);
  spawnGit(["-C", dir, "commit", "-m", "feat: add a"]);

  const entry = checkProject(dir);
  assert.ok(!entry.issues.warnings.some((w) => /commit-msg hook not wired/.test(w.message)));
  assert.ok(!entry.issues.warnings.some((w) => /Conventional Commits format/.test(w.message)));
});

test("non-conventional commit subjects (a --no-verify bypass) are a structural warning", () => {
  const dir = tmpProject(sampleProgress());
  initRepo(dir);
  ensureCommitMsgHook(dir);
  commitNoVerify(dir, "bad message one");
  commitNoVerify(dir, "bad message two");
  fs.writeFileSync(path.join(dir, "good.txt"), "x");
  spawnGit(["-C", dir, "add", "."]);
  spawnGit(["-C", dir, "commit", "-m", "feat: a good one"]);

  const entry = checkProject(dir);
  assert.ok(entry.issues.warnings.some((w) => /2\/3 of the last commit subjects/.test(w.message)));
});

test("gitTier 6 done phase without a real PR citation in its artifact is an error", () => {
  const progress = sampleProgress();
  progress.phases[0].gitTier = 6;
  progress.phases[0].status = "done";
  progress.phases[0].artifacts = ["docs/plans/tier6-review.md"];
  const dir = tmpProject(progress);
  writeFile(dir, "docs/plans/tier6-review.md", "Just some notes, no PR link.");
  writeFile(dir, ".ai-learn/runs/x-phase-0-verify.json", JSON.stringify({ phaseId: 0, ok: true }));

  const entry = checkProject(dir);
  assert.ok(entry.issues.errors.some((e) => /gitTier 6 phase marked done but no artifact cites a real PR URL/.test(e.message)));
});

test("gitTier 6 done phase with a real, well-substantiated PR citation passes cleanly", () => {
  const progress = sampleProgress();
  progress.phases[0].gitTier = 6;
  progress.phases[0].status = "done";
  progress.phases[0].artifacts = ["docs/plans/tier6-review.md"];
  const dir = tmpProject(progress);
  const filler = "x".repeat(250);
  writeFile(
    dir,
    "docs/plans/tier6-review.md",
    `Ma prédiction avant lecture : ${filler}\n\nSource : https://github.com/nodejs/node/pull/12345\n`,
  );
  writeFile(dir, ".ai-learn/runs/x-phase-0-verify.json", JSON.stringify({ phaseId: 0, ok: true }));

  const entry = checkProject(dir);
  assert.ok(!entry.issues.errors.some((e) => /gitTier 6/.test(e.message)));
});

// -----------------------------------------------------------------------
// Dirigeant review tier (story 03.03): docs/reviews/<brique>.md must cite a
// real file:line and state a decision — presence + minimum substance, same
// contract as a tier-6 PR URL. Absent in apprenti.
// -----------------------------------------------------------------------

test("dirigeant: a done phase with a sourced review (real file:line + decision) passes", () => {
  const dir = dirigeantProject();
  writeFile(dir, "docs/reviews/phase-zero.md", `${REVIEW_FILLER}\n\nCitation : \`src/index.js:3\`\n\nDécision : accepter.\n`);

  const entry = checkProject(dir);
  // Every review-tier failure (missing, no-citation, no-decision,
  // insufficient-substance, ambiguous-name) is phrased with this prefix, so
  // checking it alone proves the review passed for the right reason.
  assert.ok(!entry.issues.errors.some((e) => /in dirigeant mode but/.test(e.message)));
});

test("dirigeant: a done phase without its review is an error", () => {
  const dir = dirigeantProject();

  const entry = checkProject(dir);
  assert.ok(
    entry.issues.errors.some((e) =>
      /phase 0 \("Phase zero"\) is done in dirigeant mode but docs\/reviews\/phase-zero\.md is missing/.test(e.message),
    ),
  );
});

test("dirigeant: a review with no citation is an error (presence, not only substance)", () => {
  const dir = dirigeantProject();
  writeFile(dir, "docs/reviews/phase-zero.md", `${REVIEW_FILLER}\n\nDécision : rejeter.\n`);

  const entry = checkProject(dir);
  assert.ok(entry.issues.errors.some((e) => /cites no real file:line/.test(e.message)));
});

test("dirigeant: a review citing a line that does not exist is an error", () => {
  const dir = dirigeantProject();
  writeFile(dir, "docs/reviews/phase-zero.md", `${REVIEW_FILLER}\n\nCitation : \`src/index.js:99\`\n\nDécision : accepter.\n`);

  const entry = checkProject(dir);
  assert.ok(entry.issues.errors.some((e) => /cites no real file:line/.test(e.message)));
});

test("dirigeant: citing the line right after the last real line is an error (trailing newline)", () => {
  const dir = dirigeantProject();
  // src/index.js has three lines and ends with a newline: line 4 does not exist.
  writeFile(dir, "docs/reviews/phase-zero.md", `${REVIEW_FILLER}\n\nCitation : \`src/index.js:4\`\n\nDécision : accepter.\n`);

  const entry = checkProject(dir);
  assert.ok(entry.issues.errors.some((e) => /cites no real file:line/.test(e.message)));
});

test("dirigeant: a citation outside implementationFiles is an error", () => {
  const dir = dirigeantProject();
  writeFile(dir, "README.md", "readme\n");
  writeFile(dir, "docs/reviews/phase-zero.md", `${REVIEW_FILLER}\n\nCitation : \`README.md:1\`\n\nDécision : accepter.\n`);

  const entry = checkProject(dir);
  assert.ok(entry.issues.errors.some((e) => /cites no real file:line/.test(e.message)));
});

test("dirigeant: the citation scope follows implementationFiles, not a hard-coded src/**", () => {
  const progress = sampleProgress();
  progress.phases[0].status = "done";
  const dir = tmpProject(progress);
  writeFile(dir, ".ai-learn/guard.json", JSON.stringify({ version: 1, mode: "dirigeant", implementationFiles: ["lib/**"] }));
  writeFile(dir, "lib/app.js", "const one = 1;\n");
  capture(() => verifyCommand({ dir, phaseId: 0 }));
  writeFile(dir, "docs/reviews/phase-zero.md", `${REVIEW_FILLER}\n\nCitation : \`lib/app.js:1\`\n\nDécision : accepter.\n`);

  const entry = checkProject(dir);
  assert.ok(!entry.issues.errors.some((e) => /dirigeant mode but/.test(e.message)));
});

test("dirigeant: a citation escaping the project root is an error", () => {
  const dir = dirigeantProject();
  writeFile(dir, "docs/reviews/phase-zero.md", `${REVIEW_FILLER}\n\nCitation : \`../outside.js:1\`\n\nDécision : accepter.\n`);

  const entry = checkProject(dir);
  assert.ok(entry.issues.errors.some((e) => /cites no real file:line/.test(e.message)));
});

test("dirigeant: a review citing a real line but stating no decision is an error", () => {
  const dir = dirigeantProject();
  writeFile(dir, "docs/reviews/phase-zero.md", `${REVIEW_FILLER}\n\nCitation : \`src/index.js:1\`\n`);

  const entry = checkProject(dir);
  assert.ok(entry.issues.errors.some((e) => /states no decision/.test(e.message)));
});

test("dirigeant: a review with a bare citation and no substance is an error (degenerate case)", () => {
  const dir = dirigeantProject();
  writeFile(dir, "docs/reviews/phase-zero.md", "Citation : `src/index.js:1`\n\nDécision : accepter.\n");

  const entry = checkProject(dir);
  assert.ok(entry.issues.errors.some((e) => /too little content around its citation/.test(e.message)));
});

test("dirigeant: two phases sharing a name cannot share one review file", () => {
  const phase = { ...sampleProgress().phases[0], status: "done" };
  const progress = sampleProgress({ phases: [{ ...phase, id: 0 }, { ...phase, id: 1 }] });
  const dir = tmpProject(progress);
  writeFile(dir, ".ai-learn/guard.json", JSON.stringify({ version: 1, mode: "dirigeant", implementationFiles: ["src/**"] }));
  writeFile(dir, "src/index.js", "const one = 1;\n");
  capture(() => verifyCommand({ dir, phaseId: 0 }));
  capture(() => verifyCommand({ dir, phaseId: 1 }));
  writeFile(dir, "docs/reviews/phase-zero.md", `${REVIEW_FILLER}\n\nCitation : \`src/index.js:1\`\n\nDécision : accepter.\n`);

  const entry = checkProject(dir);
  const reviewErrors = entry.issues.errors.filter((e) => /in dirigeant mode but/.test(e.message));

  assert.strictEqual(reviewErrors.length, 2);
  assert.ok(reviewErrors.every((e) => /shared with another phase of the same name/.test(e.message)));
});

test("apprenti never requires the dirigeant reviews (non-regression)", () => {
  const progress = sampleProgress();
  progress.phases[0].status = "done";
  const dir = tmpProject(progress);
  writeFile(dir, "src/index.js", "const one = 1;\n");
  capture(() => verifyCommand({ dir, phaseId: 0 }));

  const entry = checkProject(dir);
  assert.ok(!entry.issues.errors.some((e) => /dirigeant mode but/.test(e.message)));
});

// -----------------------------------------------------------------------
// Dirigeant mutation-killer tier (story 03.04): a done phase must prove at
// least one mutant killed by the learner's test. Reads `evidence.mutation`
// already written by `verify`; apprenti is untouched.
// -----------------------------------------------------------------------

test("dirigeant: a done phase whose evidence kills at least one mutant passes the mutation tier", () => {
  const dir = dirigeantMutationProject();

  const entry = checkProject(dir);
  assert.ok(!entry.issues.errors.some((e) => NO_KILLED_MUTANT_RE.test(e.message)));
});

test("dirigeant: a done phase with zero killed mutants is an error naming the phase", () => {
  const dir = dirigeantMutationProject({
    checkpoint: 'node -e "process.exit(0)"',
    source: NO_MUTABLE_SITE_SOURCE,
  });

  const error = checkProject(dir).issues.errors.find((e) => NO_KILLED_MUTANT_RE.test(e.message));
  assert.ok(error);
  assert.match(error.message, /phase 0 \("Phase zero"\)/);
  assert.match(error.message, /0 mutant\(s\) killed/);
});

test("dirigeant: a done phase whose mutation was never required is an error", () => {
  const dir = dirigeantMutationProject({ overrides: { mutation: false } });

  const error = checkProject(dir).issues.errors.find((e) => NO_KILLED_MUTANT_RE.test(e.message));
  assert.ok(error);
  assert.match(error.message, /mutation never measured/);
});

test("dirigeant: a zero-kill error mentions when the mutation measure was truncated", () => {
  const dir = dirigeantMutationProject({
    checkpoint: 'node -e "process.exit(0)"',
    source: NO_MUTABLE_SITE_SOURCE,
  });
  const runs = path.join(dir, ".ai-learn", "runs");
  const files = fs.readdirSync(runs).filter((f) => f.endsWith("-verify.json"));
  assert.ok(files.length > 0);
  for (const f of files) {
    const file = path.join(runs, f);
    const ev = JSON.parse(fs.readFileSync(file, "utf8"));
    ev.mutation.truncated = true;
    fs.writeFileSync(file, JSON.stringify(ev));
  }

  const error = checkProject(dir).issues.errors.find((e) => NO_KILLED_MUTANT_RE.test(e.message));
  assert.ok(error);
  assert.match(error.message, /measure truncated/);
});

test("apprenti never requires the mutation-killer tier (non-regression)", () => {
  const dir = tmpProject(mutationPhase('node -e "process.exit(0)"'));
  writeFile(dir, "src/index.js", NO_MUTABLE_SITE_SOURCE);
  capture(() => verifyCommand({ dir, phaseId: 0 }));

  const entry = checkProject(dir);
  assert.ok(!entry.issues.errors.some((e) => NO_KILLED_MUTANT_RE.test(e.message)));
});

test("dirigeant: the review and mutation tiers are reported as separate errors", () => {
  const dir = dirigeantMutationProject({
    checkpoint: 'node -e "process.exit(0)"',
    source: NO_MUTABLE_SITE_SOURCE,
  });
  fs.rmSync(path.join(dir, "docs/reviews/phase-zero.md"));

  const errors = checkProject(dir).issues.errors;
  assert.ok(errors.some((e) => /docs\/reviews\/phase-zero\.md is missing/.test(e.message)));
  assert.ok(errors.some((e) => NO_KILLED_MUTANT_RE.test(e.message)));
});

test("check --json exposes both dirigeant verdicts as distinct entries", () => {
  const dir = dirigeantMutationProject({
    checkpoint: 'node -e "process.exit(0)"',
    source: NO_MUTABLE_SITE_SOURCE,
  });
  fs.rmSync(path.join(dir, "docs/reviews/phase-zero.md"));

  const report = buildCheckReport(dir);
  const messages = report.projects[0].errorList.map((entry) => entry.message);

  assert.ok(messages.some((message) => /docs\/reviews\/phase-zero\.md is missing/.test(message)));
  assert.ok(messages.some((message) => NO_KILLED_MUTANT_RE.test(message)));
  assert.strictEqual(report.ok, false);
});

test("the friction journal is counted but never gates check", () => {
  const dir = tmpProject(sampleProgress());
  writeFile(
    dir,
    ".ai-learn/dogfood.md",
    "### low — message confus\n- Surface : next\n- Problème : pas clair\n- Workaround : aucun\n- Version de l'outil : 0.1.0\n\n" +
      "### medium — checkpoint lent\n- Surface : verify\n- Problème : timeout\n- Workaround : relancé\n- Version de l'outil : 0.1.0\n",
  );

  assert.strictEqual(countDogfoodEntries(path.join(dir, ".ai-learn", "dogfood.md")), 2);

  const entry = checkProject(dir);
  assert.deepStrictEqual(entry.issues.errors, []);
  assert.deepStrictEqual(entry.issues.warnings, []);
});

test("a missing artifact blocks a done phase", () => {
  const progress = sampleProgress();
  progress.phases[0].status = "done";
  progress.phases[0].artifacts = ["docs/phase-0-notes.md"];
  const dir = tmpProject(progress);

  // The artifact must exist before verify runs — verify itself now refuses to
  // mark a phase done (i.e. record passing evidence) when a declared artifact
  // is missing, so this fixture only reaches "passing evidence" once written.
  writeFile(dir, "docs/phase-0-notes.md", "# notes");
  capture(() => verifyCommand({ dir, phaseId: 0 }));

  const entry = checkProject(dir);
  assert.deepStrictEqual(entry.issues.errors, []);

  // Artifact deleted *after* a successful verify — drift check still catches it.
  fs.rmSync(path.join(dir, "docs", "phase-0-notes.md"));

  const entry2 = checkProject(dir);
  assert.ok(entry2.issues.errors.some((e) => /requires artifact/.test(e.message)));
});

// Was "stale evidence on a pending phase is a warning" before story 01.02:
// `--no-mark` is a deliberate "observe without touching the ledger" run, not
// drift — verify.js now writes `marking: "skipped"` on it, and check.js
// reads that field to stop flagging normal `--no-mark` usage as regression.
test("verify --no-mark leaves passing evidence unflagged (not drift)", () => {
  const dir = tmpProject(sampleProgress());

  capture(() => verifyCommand({ dir, phaseId: 0, noMark: true }));

  const entry = checkProject(dir);
  assert.deepStrictEqual(entry.issues.errors, []);
  assert.ok(!entry.issues.warnings.some((w) => /passing evidence but is not marked done/.test(w.message)));
});

test("passing evidence without a marking field (legacy, pre-01.02) still warns as drift (non-regression)", () => {
  const dir = tmpProject(sampleProgress());
  writeFile(dir, "src/index.js", "console.log('hi');\n");

  capture(() => verifyCommand({ dir, phaseId: 0, noMark: true }));

  const runsDirPath = path.join(dir, ".ai-learn", "runs");
  const runFile = fs.readdirSync(runsDirPath).find((f) => f.endsWith("-verify.json"));
  const evidence = JSON.parse(fs.readFileSync(path.join(runsDirPath, runFile), "utf8"));
  delete evidence.marking;
  fs.writeFileSync(path.join(runsDirPath, runFile), `${JSON.stringify(evidence, null, 2)}\n`);

  const entry = checkProject(dir);
  assert.ok(entry.issues.warnings.some((w) => /passing evidence but is not marked done/.test(w.message)));
});

// Found while manually reproducing the demotion for the story's own Result
// notes: right after a legitimate demotion, the phase's earlier passing
// evidence is still on disk (verify.js never deletes it), and status is
// no longer "done" — exactly the shape the drift warning above was
// watching for. Without this, every single demotion would immediately trip
// it, which is not drift, it is the feature working.
test("a legitimately demoted phase is not flagged as drift (its own failing verify explains the status)", () => {
  const dir = tmpProject(sampleProgress());
  capture(() => verifyCommand({ dir, phaseId: 0 }));

  let { config } = readProgress(dir);
  config.phases[0].checkpoint = 'node -e "process.exit(1)"';
  writeFile(dir, "progress.json", JSON.stringify(config, null, 2));

  capture(() => verifyCommand({ dir, phaseId: 0 }));

  const entry = checkProject(dir);
  assert.ok(!entry.issues.warnings.some((w) => /passing evidence but is not marked done/.test(w.message)));
});

test("passing evidence with the phase reset by hand (no new verify run since) still warns as drift (non-regression)", () => {
  const dir = tmpProject(sampleProgress());
  capture(() => verifyCommand({ dir, phaseId: 0 }));

  let { config } = readProgress(dir);
  config.phases[0].status = "pending";
  writeFile(dir, "progress.json", JSON.stringify(config, null, 2));

  const entry = checkProject(dir);
  assert.ok(entry.issues.warnings.some((w) => /passing evidence but is not marked done/.test(w.message)));
});

test("a declared local doc source that vanished is a warning", () => {
  const progress = sampleProgress();
  progress.docSource = { type: "local", value: "/definitely/not/a/real/path" };
  const dir = tmpProject(progress);

  const entry = checkProject(dir);
  assert.ok(entry.issues.warnings.some((w) => /declared doc source does not exist/.test(w.message)));
});

test("local doc sources without a friction bank is a warning", () => {
  const progress = sampleProgress();
  progress.docSource = {
    type: "local",
    sources: [{ name: "fastify-docs", mode: "local", path: "docs/sources/fastify-docs" }],
  };
  const dir = tmpProject(progress);
  writeFile(dir, "docs/sources/fastify-docs/Reference/Routes.md", "# Routes\n");

  const entry = checkProject(dir);

  assert.ok(entry.issues.warnings.some((w) => /friction bank/.test(w.message)));
});

test("a docs/solutions reveal with no hole marker is a warning (copy-pasteable as-is)", () => {
  const dir = tmpProject(sampleProgress());
  writeFile(
    dir,
    "docs/solutions/routes.md",
    "# Routes\n\n```js\napp.get('/health', (req, reply) => reply.send({ ok: true }));\n```\n",
  );

  const entry = checkProject(dir);
  assert.ok(entry.issues.warnings.some((w) => /docs\/solutions\/routes\.md/.test(w.file) && /hole marker/.test(w.message)));
});

test("a docs/solutions reveal with a hole marker passes cleanly, README.md is never flagged", () => {
  const dir = tmpProject(sampleProgress());
  writeFile(
    dir,
    "docs/solutions/routes.md",
    "# Routes\n\n```js\napp.get('/health', (req, reply) => reply.send({ [...] }));\n```\n",
  );
  writeFile(dir, "docs/solutions/README.md", "# Solutions de référence — où l'IA dépose le code\n\nComplete text, no holes needed here.\n");

  const entry = checkProject(dir);
  assert.ok(!entry.issues.warnings.some((w) => /docs\/solutions/.test(w.file)));
});

test("hole markers: ellipsis, TODO and a trailing truncated line all count; a fenced code block with no gap does not", () => {
  const dir = tmpProject(sampleProgress());
  writeFile(dir, "docs/solutions/a.md", "# A\n\n```js\nconst x = 1; // …\n```\n");
  writeFile(dir, "docs/solutions/b.md", "# B\n\n```js\n// TODO: complète le handler\n```\n");
  writeFile(dir, "docs/solutions/c.md", "# C\n\n```js\nconst payload = {\n  status: ...\n```\n");
  writeFile(dir, "docs/solutions/d.md", "# D\n\n```js\nconst x = 1;\nconsole.log(x);\n```\n");

  const entry = checkProject(dir);
  const flagged = entry.issues.warnings.filter((w) => /docs\/solutions/.test(w.file)).map((w) => w.file);

  assert.deepStrictEqual(flagged, ["docs/solutions/d.md"]);
});

test("countJournalEntries counts every recorded prediction, not just the first (regex needs both g and m flags)", () => {
  const dir = tmpProject(sampleProgress());
  const journalPath = writeFile(
    dir,
    "docs/plans/predictions.md",
    "# Journal\n\n" +
      "### Phase 0 — prédiction 1/2\n- Prédiction : x\n\n" +
      "### Phase 0 — prédiction 2/2\n- Prédiction : y\n",
  );

  assert.strictEqual(countJournalEntries(journalPath), 2);
});

test("missing predictions in the journal is a warning", () => {
  const progress = sampleProgress();
  progress.phases[0].predictionsRequired = 2;
  const dir = tmpProject(progress);

  writeFile(dir, "docs/plans/predictions.md", "# Journal\n");

  const entry = checkProject(dir);
  assert.ok(entry.issues.warnings.some((w) => /recorded predictions/.test(w.message)));
});

// -----------------------------------------------------------------------
// Predictions as data (story 01.03) — per-phase counting, predictions.json
// as source of truth once valid, legacy .md as the fallback otherwise.
// -----------------------------------------------------------------------

function twoPhaseProgress() {
  return sampleProgress({
    phases: [
      { id: 0, name: "Phase zero", status: "pending", checkpoint: "node -e \"\"", artifacts: [], predictionsRequired: 2 },
      { id: 1, name: "Phase one", status: "pending", checkpoint: "node -e \"\"", artifacts: [], predictionsRequired: 2 },
    ],
  });
}

function predictionsData(entries) {
  return { version: 1, entries };
}

function fourEntriesOnPhaseZero() {
  return [0, 0, 0, 0].map((phaseId, i) => ({
    id: `e${i}`,
    phaseId,
    at: `2026-01-01T00:00:0${i}.000Z`,
    prediction: `p${i}`,
    correctedBy: "apprenant",
  }));
}

test("the comptage des prédictions est par phase — 4 entries on phase 0 do not cover phase 1", () => {
  const dir = tmpProject(twoPhaseProgress());
  writeFile(dir, ".ai-learn/predictions.json", JSON.stringify(predictionsData(fourEntriesOnPhaseZero())));

  const entry = checkProject(dir);

  assert.ok(!entry.issues.warnings.some((w) => /phase 0:.*recorded predictions/.test(w.message)));
  assert.ok(entry.issues.warnings.some((w) => /phase 1: 0\/2 recorded predictions; 2 missing/.test(w.message)));
});

test("le séparateur tiret ordinaire est compté — legacy .md with a plain hyphen, no predictions.json", () => {
  const dir = tmpProject(twoPhaseProgress());
  writeFile(
    dir,
    "docs/plans/predictions.md",
    "# Journal\n\n### Phase 0 - prédiction 1/2\n- Prédiction : x\n\n### Phase 0 - prédiction 2/2\n- Prédiction : y\n",
  );

  const entry = checkProject(dir);

  assert.ok(!entry.issues.warnings.some((w) => /phase 0:.*recorded predictions/.test(w.message)));
  assert.ok(entry.issues.warnings.some((w) => /phase 1: 0\/2 recorded predictions/.test(w.message)));
});

test("predictions.json corrompu est une erreur, jamais silencieusement accepté", () => {
  const dir = tmpProject(sampleProgress());
  writeFile(dir, ".ai-learn/predictions.json", "{ not json");
  writeFile(dir, "docs/plans/predictions.md", "# Journal des prédictions\n");

  const entry = checkProject(dir);

  assert.ok(entry.issues.errors.some((e) => /predictions\.json is corrupted/.test(e.message)));
});

test("corrigé par IA est signalé — from predictions.json data", () => {
  const dir = tmpProject(sampleProgress());
  writeFile(
    dir,
    ".ai-learn/predictions.json",
    JSON.stringify(predictionsData([{ id: "a", phaseId: 0, at: "2026-01-01T00:00:00.000Z", prediction: "x", correctedBy: "IA" }])),
  );

  const entry = checkProject(dir);

  assert.ok(entry.issues.warnings.some((w) => /Corrigé par : IA/.test(w.message)));
});

test("un projet ayant les deux fichiers — le JSON fait foi, même vide, sur un .md hérité non vide", () => {
  const progress = sampleProgress();
  progress.phases[0].predictionsRequired = 1;
  const dir = tmpProject(progress);

  writeFile(dir, "docs/plans/predictions.md", "# Journal\n\n### Phase 0 — prédiction 1/1\n- Prédiction : x\n");
  writeFile(dir, ".ai-learn/predictions.json", JSON.stringify(predictionsData([])));

  const entry = checkProject(dir);

  // The legacy .md alone would satisfy phase 0's requirement; the (empty but
  // valid) JSON taking precedence means it is reported as missing instead.
  // Found in review (story 01.03): the warning must explain itself — the
  // legacy .md's entries didn't vanish, an empty predictions.json just now
  // outranks them.
  const warning = entry.issues.warnings.find((w) => /phase 0: 0\/1 recorded predictions/.test(w.message));
  assert.ok(warning);
  assert.match(warning.message, /legacy entries.*takes precedence/);
});

// Story 01.04: check's message and verify's blocking message are built by
// the same `formatPredictionsGap(phase, predictionsReport(...))` call — this
// proves they report the identical count for the identical scenario, not
// just a similar-looking one.
test("check's missing-predictions message reports the same count verify's blocking message would", () => {
  const progress = twoPhaseProgress();
  progress.phases[1].checkpoint = 'node -e "process.exit(0)"';
  const dir = tmpProject(progress);
  writeFile(dir, ".ai-learn/predictions.json", JSON.stringify(predictionsData(fourEntriesOnPhaseZero())));

  const entry = checkProject(dir);
  const checkWarning = entry.issues.warnings.find((w) => /^phase 1:/.test(w.message));
  assert.ok(checkWarning);

  const verifyOut = capture(() => verifyCommand({ dir, phaseId: 1 }));

  assert.match(verifyOut, new RegExp(checkWarning.message.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
});

test("a checkpoint file written but never verified is an error", () => {
  const progress = sampleProgress();
  progress.phases[0].checkpoint = "node --test checkpoint/phase-0.test.mjs";
  const dir = tmpProject(progress);

  writeFile(dir, "checkpoint/phase-0.test.mjs", "import { test } from 'node:test'; test('ok', () => {});");

  const entry = checkProject(dir);
  assert.ok(entry.issues.errors.some((e) => /checkpoint exists but no passing evidence/.test(e.message)));
});

test("in_progress with a checkpoint file but no passing evidence is not an error (story 01.01)", () => {
  const progress = sampleProgress();
  progress.phases[0].status = "in_progress";
  progress.phases[0].checkpoint = "node --test checkpoint/phase-0.test.mjs";
  const dir = tmpProject(progress);

  writeFile(dir, "checkpoint/phase-0.test.mjs", "import { test } from 'node:test'; test('ok', () => {});");

  const entry = checkProject(dir);
  assert.deepStrictEqual(entry.issues.errors, []);
});

test("pending with a checkpoint file but no passing evidence stays an error (non-regression)", () => {
  const progress = sampleProgress();
  progress.phases[0].status = "pending";
  progress.phases[0].checkpoint = "node --test checkpoint/phase-0.test.mjs";
  const dir = tmpProject(progress);

  writeFile(dir, "checkpoint/phase-0.test.mjs", "import { test } from 'node:test'; test('ok', () => {});");

  const entry = checkProject(dir);
  assert.ok(entry.issues.errors.some((e) => /checkpoint exists but no passing evidence/.test(e.message)));
});

test("a modification to src/ after a passing verify makes the proof stale", () => {
  const progress = sampleProgress();
  const dir = tmpProject(progress);
  writeFile(dir, "src/index.js", "console.log('hi');\n");

  capture(() => verifyCommand({ dir, phaseId: 0 }));
  assert.deepStrictEqual(checkProject(dir).issues.errors, []);

  writeFile(dir, "src/index.js", "console.log('changed');\n");

  const entry = checkProject(dir);
  assert.ok(entry.issues.errors.some((e) => /is done but its proof is stale/.test(e.message)));
});

test("the stale message names the changed file and the total count", () => {
  const progress = sampleProgress();
  const dir = tmpProject(progress);
  writeFile(dir, "src/index.js", "console.log('hi');\n");

  capture(() => verifyCommand({ dir, phaseId: 0 }));
  writeFile(dir, "src/index.js", "console.log('changed');\n");

  const entry = checkProject(dir);
  const stale = entry.issues.errors.find((e) => /is done but its proof is stale/.test(e.message));

  assert.ok(stale);
  assert.match(stale.message, /1 file\(s\) changed/);
  assert.match(stale.message, /src\/index\.js/);
});

test("a file removed from the proof's scope (and nothing else) is detected as a change", () => {
  const progress = sampleProgress();
  const dir = tmpProject(progress);
  writeFile(dir, "src/a.js", "const a = 1;\n");
  writeFile(dir, "src/b.js", "const b = 2;\n");

  capture(() => verifyCommand({ dir, phaseId: 0 }));
  fs.rmSync(path.join(dir, "src", "b.js"));

  const entry = checkProject(dir);
  const stale = entry.issues.errors.find((e) => /is done but its proof is stale/.test(e.message));

  assert.ok(stale);
  assert.match(stale.message, /src\/b\.js/);
});

test("a file added to the proof's scope (and nothing existing changed) is detected as a change", () => {
  const progress = sampleProgress();
  const dir = tmpProject(progress);
  writeFile(dir, "src/a.js", "const a = 1;\n");

  capture(() => verifyCommand({ dir, phaseId: 0 }));
  writeFile(dir, "src/c.js", "const c = 3;\n");

  const entry = checkProject(dir);
  const stale = entry.issues.errors.find((e) => /is done but its proof is stale/.test(e.message));

  assert.ok(stale);
  assert.match(stale.message, /src\/c\.js/);
});

test("a stale proof and a missing artifact on the same phase are both reported, not just the first", () => {
  const progress = sampleProgress();
  progress.phases[0].artifacts = ["docs/phase-0-notes.md"];
  const dir = tmpProject(progress);
  writeFile(dir, "src/index.js", "console.log('hi');\n");
  writeFile(dir, "docs/phase-0-notes.md", "# Notes\n");

  capture(() => verifyCommand({ dir, phaseId: 0 }));
  writeFile(dir, "src/index.js", "console.log('changed');\n");
  fs.rmSync(path.join(dir, "docs", "phase-0-notes.md"));

  const entry = checkProject(dir);
  assert.ok(entry.issues.errors.some((e) => /is done but its proof is stale/.test(e.message)));
  assert.ok(entry.issues.errors.some((e) => /requires artifact/.test(e.message)));
});

test("proof stays valid when nothing covered by it changed", () => {
  const progress = sampleProgress();
  const dir = tmpProject(progress);
  writeFile(dir, "src/index.js", "console.log('hi');\n");

  capture(() => verifyCommand({ dir, phaseId: 0 }));

  const entry = checkProject(dir);
  assert.deepStrictEqual(entry.issues.errors, []);
});

test("legacy evidence without a sourceHash field is never marked stale", () => {
  const progress = sampleProgress();
  const dir = tmpProject(progress);
  writeFile(dir, "src/index.js", "console.log('hi');\n");

  capture(() => verifyCommand({ dir, phaseId: 0 }));

  const runsDirPath = path.join(dir, ".ai-learn", "runs");
  const runFile = fs.readdirSync(runsDirPath).find((f) => f.endsWith("-verify.json"));
  const evidence = JSON.parse(fs.readFileSync(path.join(runsDirPath, runFile), "utf8"));
  delete evidence.sourceHash;
  fs.writeFileSync(path.join(runsDirPath, runFile), `${JSON.stringify(evidence, null, 2)}\n`);

  writeFile(dir, "src/index.js", "console.log('changed after stripping sourceHash');\n");

  const entry = checkProject(dir);
  assert.deepStrictEqual(entry.issues.errors, []);
});

test("a verified checkpoint file passes cleanly", () => {
  // An isolated home: verify syncs into it, so check finds the project there.
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "ai-learn-check-home-"));
  const progress = sampleProgress();
  progress.phases[0].checkpoint = "node --test checkpoint/phase-0.test.mjs";
  const dir = tmpProject(progress);

  writeFile(dir, "checkpoint/phase-0.test.mjs", "import { test } from 'node:test'; test('ok', () => {});");

  capture(() => verifyCommand({ dir, phaseId: 0, home }));

  const entry = checkProject(dir, { home });
  assert.deepStrictEqual(entry.issues.errors, []);
  assert.deepStrictEqual(entry.issues.warnings, []);
});

test("a non-file checkpoint (inline command) is not flagged", () => {
  const dir = tmpProject(sampleProgress());

  const entry = checkProject(dir);
  assert.deepStrictEqual(entry.issues.errors, []);
});

function generatedProgress(overrides = {}) {
  const progress = sampleProgress();
  progress.docSource = {
    type: "local",
    sources: [
      { name: "gen", mode: "local", path: "docs/sources/gen", generated: true, url: "https://roadmap.sh/backend", ...overrides },
    ],
  };
  return progress;
}

test("a generated source without an origin is an error", () => {
  const progress = generatedProgress({ url: undefined });
  const dir = tmpProject(progress);

  const entry = checkProject(dir);
  assert.ok(entry.issues.errors.some((e) => /has no origin/.test(e.message)));
});

test("an empty generated source (recreation never happened) is an error", () => {
  const progress = generatedProgress();
  const dir = tmpProject(progress);
  // scaffold exists (docs add --regen created it) but the AI never filled it
  fs.mkdirSync(path.join(dir, "docs", "sources", "gen"), { recursive: true });

  const entry = checkProject(dir);
  assert.ok(entry.issues.errors.some((e) => /is empty.*must recreate it locally/.test(e.message)));
});

test("a generated source whose doc does not cite its origin is a warning", () => {
  const progress = generatedProgress();
  const dir = tmpProject(progress);
  writeFile(dir, "docs/sources/gen/backend.md", "# Notes\nTranscrit sans origine.\n");

  const entry = checkProject(dir);
  assert.deepStrictEqual(entry.issues.errors, []);
  assert.ok(entry.issues.warnings.some((w) => /does not cite its origin/.test(w.message)));
});

const SUBSTANTIAL_NOTES =
  "Le backend roadmap distingue 4 étapes : comprendre le protocole HTTP, choisir un langage, " +
  "apprendre les bases de données relationnelles et NoSQL, puis l'architecture (cache, files de " +
  "messages, scalabilité horizontale). Chaque étape est détaillée avec les concepts clés à maîtriser " +
  "avant de passer à la suivante, et des exemples concrets d'outils utilisés en production.";

test("a generated source that cites its origin passes cleanly", () => {
  const progress = generatedProgress();
  const dir = tmpProject(progress);
  writeFile(dir, "docs/sources/gen/backend.md", `# Notes\n${SUBSTANTIAL_NOTES}\nSource : https://roadmap.sh/backend\n`);
  writeFile(dir, ".ai-learn/traps.json", "{}\n"); // friction bank present

  const entry = checkProject(dir);
  assert.deepStrictEqual(entry.issues.errors, []);
  assert.deepStrictEqual(entry.issues.warnings, []);
});

test("origin citation matching is robust to scheme and trailing slash", () => {
  const progress = generatedProgress({ url: "https://roadmap.sh/backend/" });
  const dir = tmpProject(progress);
  // no scheme, no trailing slash
  writeFile(dir, "docs/sources/gen/backend.md", `${SUBSTANTIAL_NOTES}\nSource : roadmap.sh/backend\n`);
  writeFile(dir, ".ai-learn/traps.json", "{}\n"); // friction bank present

  const entry = checkProject(dir);
  assert.deepStrictEqual(entry.issues.errors, []);
  assert.deepStrictEqual(entry.issues.warnings, []);
});

test("a generated source with only a trailing citation and no real content is a warning (degenerate case)", () => {
  const progress = generatedProgress();
  const dir = tmpProject(progress);
  // The exact failure mode the content floor exists to catch: a citation
  // stapled onto near-nothing (or, in the real risk case, onto a
  // hallucinated file that happens to be short).
  writeFile(dir, "docs/sources/gen/backend.md", "# Notes\nSource : https://roadmap.sh/backend\n");

  const entry = checkProject(dir);
  assert.deepStrictEqual(entry.issues.errors, []);
  assert.ok(entry.issues.warnings.some((w) => /does not cite its origin/.test(w.message)));
});

function fileProgress(overrides = {}) {
  const progress = sampleProgress();
  progress.docSource = {
    type: "local",
    sources: [
      { name: "livre", mode: "local", path: "docs/sources/livre", file: "book.pdf", src: "/origin/book.pdf", generated: true, ...overrides },
    ],
  };
  return progress;
}

test("a generated file source with only the origin file (no transcript) is an error", () => {
  const progress = fileProgress();
  const dir = tmpProject(progress);
  writeFile(dir, "docs/sources/livre/book.pdf", "%PDF-1.4 fake\n");

  const entry = checkProject(dir);

  assert.ok(entry.issues.errors.some((e) => /is empty.*must recreate it locally/.test(e.message)));
});

test("a generated file source whose transcript does not cite the file is a warning", () => {
  const progress = fileProgress();
  const dir = tmpProject(progress);
  writeFile(dir, "docs/sources/livre/book.pdf", "%PDF-1.4 fake\n");
  writeFile(dir, "docs/sources/livre/essentiel.md", "# Essentiel\nSans citation de page.\n");

  const entry = checkProject(dir);

  assert.deepStrictEqual(entry.issues.errors, []);
  assert.ok(entry.issues.warnings.some((w) => /does not cite its origin/.test(w.message)));
});

test("a generated file source whose transcript cites the file passes cleanly", () => {
  const progress = fileProgress();
  const dir = tmpProject(progress);
  writeFile(dir, "docs/sources/livre/book.pdf", "%PDF-1.4 fake\n");
  writeFile(dir, "docs/sources/livre/essentiel.md", `# Essentiel\n${SUBSTANTIAL_NOTES}\nVoir book.pdf:page 12.\n`);
  writeFile(dir, ".ai-learn/traps.json", "{}\n"); // friction bank present

  const entry = checkProject(dir);

  assert.deepStrictEqual(entry.issues.errors, []);
  assert.deepStrictEqual(entry.issues.warnings, []);
});

test("checkCommand scans every learning project under a root", () => {
  const root = fs.mkdtempSync(path.join(require("os").tmpdir(), "ai-learn-root-"));

  const good = path.join(root, "proj-a");
  fs.mkdirSync(good, { recursive: true });
  writeFile(good, "progress.json", JSON.stringify(sampleProgress({ project: "proj-a" }), null, 2));

  const bad = path.join(root, "proj-b");
  fs.mkdirSync(bad, { recursive: true });
  const badProgress = sampleProgress({ project: "proj-b" });
  badProgress.phases[0].status = "done";
  writeFile(bad, "progress.json", JSON.stringify(badProgress, null, 2));

  capture(() => verifyCommand({ dir: good, phaseId: 0 }));

  const out = capture(() => checkCommand({ root }));

  assert.match(out, /proj-a/);
  assert.match(out, /proj-b/);
  assert.match(out, /1 error\(s\)/);
  assert.match(out, /check FAILED/);
  assert.strictEqual(process.exitCode, 1);

  assert.strictEqual(findLearningProjects(root).length, 2);
});

// Non-regression: the text renderer must produce the exact same bytes it did
// before --json existed (story 01.05, plan.md's "sortie texte inchangée").
test("the text output is unchanged when --json is not passed", () => {
  const root = fs.mkdtempSync(path.join(require("os").tmpdir(), "ai-learn-root-"));
  const good = path.join(root, "proj-a");
  fs.mkdirSync(good, { recursive: true });
  writeFile(good, "progress.json", JSON.stringify(sampleProgress({ project: "proj-a" }), null, 2));

  const out = capture(() => checkCommand({ root }));

  assert.match(out, /Checking 1 learning project\(s\) under/);
  assert.match(out, /\nproj-a\n/);
  assert.match(out, /0\/1 phases done/);
  assert.match(out, /✓ check passed/);
  assert.doesNotMatch(out, /[{}[\]]/); // no stray JSON leaking into the text path
});

test("check --json produces a single valid JSON object on stdout, with the same exit code as text mode", () => {
  const root = fs.mkdtempSync(path.join(require("os").tmpdir(), "ai-learn-root-"));

  const good = path.join(root, "proj-a");
  fs.mkdirSync(good, { recursive: true });
  writeFile(good, "progress.json", JSON.stringify(sampleProgress({ project: "proj-a" }), null, 2));

  const bad = path.join(root, "proj-b");
  fs.mkdirSync(bad, { recursive: true });
  const badProgress = sampleProgress({ project: "proj-b" });
  badProgress.phases[0].status = "done";
  writeFile(bad, "progress.json", JSON.stringify(badProgress, null, 2));

  const out = capture(() => checkCommand({ root, json: true }));

  const parsed = JSON.parse(out); // throws if this isn't exactly one JSON value
  assert.strictEqual(parsed.version, 1);
  assert.strictEqual(parsed.ok, false);
  assert.strictEqual(parsed.errors, 1);
  assert.strictEqual(parsed.projects.length, 2);
  assert.strictEqual(process.exitCode, 1);
});

test("check --json exits 0 on a clean project, same as text mode", () => {
  const root = fs.mkdtempSync(path.join(require("os").tmpdir(), "ai-learn-root-"));
  const good = path.join(root, "proj-a");
  fs.mkdirSync(good, { recursive: true });
  writeFile(good, "progress.json", JSON.stringify(sampleProgress({ project: "proj-a" }), null, 2));

  const out = capture(() => checkCommand({ root, json: true }));
  const parsed = JSON.parse(out);

  assert.strictEqual(parsed.ok, true);
  assert.strictEqual(process.exitCode, 0);
});

test("buildCheckReport normalizes paths and reports per-phase counts", () => {
  const root = fs.mkdtempSync(path.join(require("os").tmpdir(), "ai-learn-root-"));
  const good = path.join(root, "proj-a");
  fs.mkdirSync(good, { recursive: true });
  writeFile(good, "progress.json", JSON.stringify(sampleProgress({ project: "proj-a" }), null, 2));

  const report = buildCheckReport(root);

  assert.strictEqual(report.projects[0].dir, "proj-a");
  assert.strictEqual(report.projects[0].phasesDone, 0);
  assert.strictEqual(report.projects[0].phasesTotal, 1);
  assert.doesNotMatch(report.root, /\\/);
});

// ---------------------------------------------------------------------------
// Mutation audit (story 02.04) — `check` never recomputes mutation itself
// (spec.md Requirements); it only enriches the existing sourceHash staleness
// message when `phase.mutation === true`.
// ---------------------------------------------------------------------------

test("check reports nothing for a phase whose mutation proof is still valid (code unchanged)", () => {
  const dir = tmpProject(mutationPhase(STRONG_CHECKPOINT));
  writeFile(dir, "src/index.js", "function isReady() {\n  return true;\n}\nmodule.exports = { isReady };\n");

  capture(() => verifyCommand({ dir, phaseId: 0 }));

  const entry = checkProject(dir);
  assert.deepStrictEqual(entry.issues.errors, []);
});

test("check's stale message names the mutation proof as part of what's périmé when phase.mutation is required", () => {
  const dir = tmpProject(mutationPhase(STRONG_CHECKPOINT));
  writeFile(dir, "src/index.js", "function isReady() {\n  return true;\n}\nmodule.exports = { isReady };\n");

  capture(() => verifyCommand({ dir, phaseId: 0 }));
  writeFile(dir, "src/index.js", "function isReady() {\n  return true;\n}\nfunction extra() {}\nmodule.exports = { isReady };\n");

  const entry = checkProject(dir);
  const stale = entry.issues.errors.find((e) => /is done but its proof is stale/.test(e.message));

  assert.ok(stale);
  assert.match(stale.message, /inclut la preuve de mutation/);
});

test("check's stale message has no mutation clause for a phase that never required mutation (non-regression)", () => {
  const progress = sampleProgress();
  const dir = tmpProject(progress);
  writeFile(dir, "src/index.js", "console.log('hi');\n");

  capture(() => verifyCommand({ dir, phaseId: 0 }));
  writeFile(dir, "src/index.js", "console.log('changed');\n");

  const entry = checkProject(dir);
  const stale = entry.issues.errors.find((e) => /is done but its proof is stale/.test(e.message));

  assert.ok(stale);
  assert.doesNotMatch(stale.message, /inclut la preuve de mutation/);
});

// Defense-in-depth (plan.md Test Plan): a `progress.json` hand-edited to
// force `done` on a phase whose only evidence has `mutation.ok: false` (so
// the whole verify run is `ok: false`, and never returned by
// `latestEvidenceForPhase`) must stay coherent — the existing "no passing
// evidence" error, not a crash or a mutation-specific special case.
test("check stays coherent when done is forced by hand despite a failing mutation proof", () => {
  const dir = tmpProject(mutationPhase(WEAK_CHECKPOINT));
  writeFile(dir, "src/index.js", "function isReady() {\n  return true;\n}\nmodule.exports = { isReady };\n");

  capture(() => verifyCommand({ dir, phaseId: 0 }));
  assert.strictEqual(readProgress(dir).config.phases[0].status, "pending");

  const { config } = readProgress(dir);
  config.phases[0].status = "done";
  fs.writeFileSync(path.join(dir, "progress.json"), `${JSON.stringify(config, null, 2)}\n`);

  const entry = checkProject(dir);
  assert.ok(entry.issues.errors.some((e) => /marked done but has no passing evidence/.test(e.message)));
});

test("check never launches a checkpoint command to audit mutation (fast, read-only contract)", () => {
  const dir = tmpProject(mutationPhase(STRONG_CHECKPOINT));
  writeFile(dir, "src/index.js", "function isReady() {\n  return true;\n}\nmodule.exports = { isReady };\n");
  capture(() => verifyCommand({ dir, phaseId: 0 }));

  const childProcess = require("child_process");
  const original = childProcess.spawnSync;
  let calls = 0;
  childProcess.spawnSync = (...args) => {
    calls += 1;
    return original(...args);
  };

  try {
    checkProject(dir);
  } finally {
    childProcess.spawnSync = original;
  }

  assert.strictEqual(calls, 0);
});

test("check warns when a detected platform's native memory stub is missing", () => {
  const dir = tmpProject(sampleProgress());
  writeFile(dir, "AGENTS.md", "# protocol\n");
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "ai-learn-check-home-"));
  writeFile(home, ".claude/commands/next.md", "# next\n");

  const entry = checkProject(dir, { home });

  assert.deepStrictEqual(entry.issues.errors, []);
  assert.ok(entry.issues.warnings.some((w) => w.file === "CLAUDE.md" && /learning protocol/.test(w.message)));
});

test("check does not warn about a native memory stub that imports AGENTS.md", () => {
  const dir = tmpProject(sampleProgress());
  writeFile(dir, "AGENTS.md", "# protocol\n");
  writeFile(dir, "CLAUDE.md", "@AGENTS.md\n");
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "ai-learn-check-home-"));
  writeFile(home, ".claude/commands/next.md", "# next\n");

  const entry = checkProject(dir, { home });

  assert.deepStrictEqual(entry.issues.errors, []);
  assert.ok(!entry.issues.warnings.some((w) => w.file === "CLAUDE.md"));
});

test("check reports a legacy-only command install as a migration warning, never an error", () => {
  const dir = tmpProject(sampleProgress());
  writeFile(dir, "AGENTS.md", "# protocol\n");
  writeFile(dir, "CLAUDE.md", "@AGENTS.md\n");
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "ai-learn-check-home-"));
  writeFile(home, ".claude/commands/next.md", "# next\n"); // pre-04.05 install: old names only

  const entry = checkProject(dir, { home });

  assert.deepStrictEqual(entry.issues.errors, []);
  assert.ok(entry.issues.warnings.some((w) => /anciens noms/.test(w.message) && /migration/.test(w.message)));
});

test("init then check is clean; deleting the native memory stub makes check warn", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ai-learn-check-init-"));
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "ai-learn-check-home-"));

  withHome(home, () =>
    scaffold({ dir, project: "demo", technology: "Fastify", docSource: null, phases: [], platform: "claude" }),
  );

  assert.ok(!checkProject(dir, { home }).issues.warnings.some((w) => w.file === "CLAUDE.md"));

  fs.unlinkSync(path.join(dir, "CLAUDE.md"));

  assert.ok(checkProject(dir, { home }).issues.warnings.some((w) => w.file === "CLAUDE.md"));
});

// -----------------------------------------------------------------------
// Story 05.01 — a done phase that required a reality check but only has code
// predictions must be signalled, with the missing type named.
// -----------------------------------------------------------------------

test("check signals a done phase missing its required reality prediction", () => {
  const dir = tmpProject(sampleProgress({
    phases: [
      {
        id: 0,
        name: "Zero",
        status: "done",
        checkpoint: 'node -e "process.exit(0)"',
        artifacts: [],
        predictionsRequired: { code: 1, reality: 1 },
      },
    ],
  }));
  writeFile(
    dir,
    ".ai-learn/predictions.json",
    JSON.stringify(predictionsData([{ id: "a", phaseId: 0, at: "2026-01-01T00:00:00.000Z", type: "code", prediction: "x" }])),
  );

  const entry = checkProject(dir);
  const warning = entry.issues.warnings.find((w) => /^phase 0:/.test(w.message));

  assert.ok(warning);
  assert.match(warning.message, /reality 0\/1/);
});

test("check names the missing reality type even when predictions.json is corrupted", () => {
  const dir = tmpProject(sampleProgress({
    phases: [
      {
        id: 0,
        name: "Zero",
        status: "done",
        checkpoint: 'node -e "process.exit(0)"',
        artifacts: [],
        predictionsRequired: { code: 1, reality: 1 },
      },
    ],
  }));
  writeFile(dir, ".ai-learn/predictions.json", "{ not json");
  writeFile(dir, "docs/plans/predictions.md", "# Journal des prédictions\n");

  const entry = checkProject(dir);
  const warning = entry.issues.warnings.find((w) => /^phase 0:/.test(w.message));

  assert.ok(warning);
  assert.match(warning.message, /reality 0\/1/);
});

test("check errors on an unknown tutor assistance or proof value", () => {
  const dir = tmpProject(sampleProgress());
  writeFile(dir, ".ai-learn/tutor.json", JSON.stringify({ version: 1, assistance: "moyen", proof: "magie" }));

  const entry = checkProject(dir);

  assert.ok(entry.issues.errors.some((issue) => issue.file === ".ai-learn/tutor.json" && /unknown assistance "moyen"/.test(issue.message)));
  assert.ok(entry.issues.errors.some((issue) => issue.file === ".ai-learn/tutor.json" && /unknown proof "magie"/.test(issue.message)));
});

// -----------------------------------------------------------------------
// Story 07.02 — a proven phase past its revisit delay is a warning, not a lie
// -----------------------------------------------------------------------

const REVISIT_DAY_MS = 24 * 60 * 60 * 1000;

function provenRevisitProject() {
  const progress = sampleProgress({
    phases: [
      { id: 0, name: "Zero", status: "pending", checkpoint: "node -e \"\"", artifacts: [], predictionsRequired: 0, reviewAfterDays: 7 },
    ],
  });
  const dir = tmpProject(progress);
  capture(() => verifyCommand({ dir, phaseId: 0 }));
  return dir;
}

test("check warns (never errors) when a proven phase is past its revisit delay, naming it", () => {
  const dir = provenRevisitProject();
  const evidence = latestEvidenceForPhase(dir, 0);
  const now = new Date(Date.parse(evidence.lastProvenAt) + 8 * REVISIT_DAY_MS);

  const entry = checkProject(dir, { now });

  assert.strictEqual(entry.issues.errors.length, 0);
  assert.ok(
    entry.issues.warnings.some(
      (warning) => /phase 0 \("Zero"\) has not been revisited/.test(warning.message) && /--revisit/.test(warning.message),
    ),
  );
});

test("check stays silent before the revisit delay (non-regression)", () => {
  const dir = provenRevisitProject();
  const evidence = latestEvidenceForPhase(dir, 0);
  const now = new Date(Date.parse(evidence.lastProvenAt) + 1 * REVISIT_DAY_MS);

  const entry = checkProject(dir, { now });

  assert.ok(!entry.issues.warnings.some((warning) => /revisited/.test(warning.message)));
});
