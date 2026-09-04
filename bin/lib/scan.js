"use strict";

// `ai-learn scan` — analyse an existing project and propose a deepening path.
//
// A learner who is already advanced (a C RPG with threads, sockets, a Makefile,
// tests, hundreds of commits) does not need `init`'s from-scratch plan — that
// would feel like starting over. `scan` reads the codebase objectively (stack,
// structure, tests, git, which *concepts* are already mobilized), estimates the
// current level, and proposes a set of deepening directions from a per-stack
// bank. The invariant is structural, not a slogan: a direction survives only if
// it goes strictly deeper than the deepest concept already present, is anchored
// in real files, and targets a concept the learner does not already own.
//
// `scan` is read-only: it never writes progress.json and never touches source.
// Its only artifact is `.ai-learn/scan.json`, which the AI then turns into real
// phases via `ai-learn init --phases '<JSON>'` (init is non-destructive).

const fs = require("fs");
const path = require("path");
const { log, fail, writeJson, normalizePortable, spawnGit } = require("./util");
const { progressPath, readProgress, latestEvidenceForPhase } = require("./progress");

// ---------------------------------------------------------------------------
// Stack packs — one file per language under bin/lib/stacks/, each exporting
// `{ concepts, directions, recipes }`. The engine below never hardcodes a
// language or a framework: it only knows how to load a pack by key and run
// the same generic detection/filtering/level logic over whatever it finds.
// Adding a new language means adding a new file in stacks/, not touching this
// file. A concept is a marker the scanner proves is used by grepping source
// lines; each carries a depth tier so the level estimate and the direction
// filter have something structural to compare. `deepens` is the concept id a
// direction would introduce — deliberately NOT present in the concept bank,
// so it can never be "already used" and the filter only ever kills
// directions whose target is already mastered. `requires` are concept ids
// that must be present for the direction to be anchored in real code.
// Recipes (from build-your-own-x) follow the same non-regression shape as
// directions, but add a concrete step-by-step ladder with a checkpoint per
// step. `generic.js` is the fallback for any language without a dedicated
// pack: no concept bank (nothing verified to grep for), only the five
// language-agnostic directions.
// ---------------------------------------------------------------------------

const EMPTY_STACK = { concepts: [], directions: [], recipes: [], stresses: [] };

function loadStack(key) {
  try {
    return require(`./stacks/${key}.js`);
  } catch {
    try {
      return require("./stacks/generic.js");
    } catch {
      return EMPTY_STACK;
    }
  }
}

const LEVEL_LABELS = {
  1: "Débutant",
  2: "Intermédiaire",
  3: "Confirmé",
  4: "Avancé",
  5: "Expert",
};

// ---------------------------------------------------------------------------
// Walking
// ---------------------------------------------------------------------------

const NOISE_DIRS = new Set([
  "node_modules",
  "dist",
  "build",
  "out",
  ".next",
  "target",
  ".venv",
  "coverage",
  "vendor",
  "tmp",
  ".cache",
]);

// Extensions that carry concept markers, per stack key.
const SOURCE_EXTS = {
  c: new Set([".c", ".h"]),
  cpp: new Set([".cpp", ".hpp", ".cc", ".cxx", ".h"]),
  rust: new Set([".rs"]),
  go: new Set([".go"]),
  python: new Set([".py"]),
  javascript: new Set([".js", ".mjs", ".cjs", ".jsx"]),
  typescript: new Set([".ts", ".tsx"]),
  csharp: new Set([".cs"]),
};

const ALL_SOURCE_EXTS = new Set(Object.values(SOURCE_EXTS).flatMap((set) => [...set]));

// Walk the tree, skipping the usual noise. Files are collected as metadata; a
// NUL-byte probe marks binaries so content scans never read them raw.
function walkSources(dir, opts = {}) {
  const maxFiles = opts.maxFiles || 1000;
  const maxBytes = opts.maxBytesPerFile || 1024 * 1024;
  const files = [];
  let capped = false;

  const walk = (current) => {
    if (files.length >= maxFiles) {
      capped = true;
      return;
    }

    let entries;

    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      return; // unreadable dir → skip silently
    }

    entries.sort((a, b) => (a.name < b.name ? -1 : 1));

    for (const entry of entries) {
      if (files.length >= maxFiles) {
        capped = true;
        return;
      }

      if (entry.name.startsWith(".")) {
        continue; // .git, .ai-learn, hidden files
      }

      const abs = path.join(current, entry.name);
      const rel = normalizePortable(path.relative(dir, abs));

      if (entry.isDirectory()) {
        if (NOISE_DIRS.has(entry.name)) {
          continue;
        }
        if (rel === "docs/sources" || rel.startsWith("docs/sources/")) {
          continue; // reference docs vendored by `ai-learn docs` — third-party
          // samples, not the learner's own code; scanning them would fake the
          // concept picture.
        }
        walk(abs);
        continue;
      }

      if (!entry.isFile()) {
        continue;
      }

      let size = 0;
      let binary = false;

      try {
        size = fs.statSync(abs).size;
        binary = isBinaryFile(abs);
      } catch {
        // unreadable file → record metadata only
      }

      files.push({ rel, abs, ext: path.extname(rel).toLowerCase(), size, binary });
    }
  };

  walk(dir);

  const byExt = {};
  let totalLoc = 0;

  for (const file of files) {
    byExt[file.ext] = (byExt[file.ext] || 0) + 1;
    // Per-file LOC (0 for binaries/oversized files, same exclusion as the
    // aggregate below) — feeds the `mandatoryAt: { metric: "locInFile" }`
    // check (suggestDirections) and the `stresses` bank's size-shaped
    // dimensions, not just the project-wide total.
    file.loc = !file.binary && file.size <= maxBytes ? countLines(file.abs, maxBytes) : 0;
    totalLoc += file.loc;
  }

  return { files, byExt, totalLoc, capped };
}

function isBinaryFile(abs) {
  const fd = fs.openSync(abs, "r");
  try {
    const buffer = Buffer.alloc(8192);
    const read = fs.readSync(fd, buffer, 0, buffer.length, 0);
    return read > 0 && buffer.subarray(0, read).includes(0);
  } finally {
    fs.closeSync(fd);
  }
}

function countLines(abs, maxBytes) {
  try {
    const buffer = fs.readFileSync(abs, { encoding: "utf8" });
    let count = 0;

    for (let i = 0; i < buffer.length && i < maxBytes; i += 1) {
      if (buffer.charCodeAt(i) === 10) {
        count += 1;
      }
    }

    return count;
  } catch {
    return 0;
  }
}

// ---------------------------------------------------------------------------
// Git — best-effort, never throws.
// ---------------------------------------------------------------------------

function gitState(dir) {
  const read = (args) => {
    try {
      const res = spawnGit(["-C", dir, ...args], { encoding: "utf8" });
      return res.status === 0 ? res.stdout.trim() : null;
    } catch {
      return null;
    }
  };

  const commits = read(["rev-list", "--count", "HEAD"]);
  const lastCommit = read(["log", "-1", "--format=%ci"]);
  const branch = read(["branch", "--show-current"]);

  if (commits === null && lastCommit === null && branch === null) {
    return { isRepo: false, commits: null, lastCommit: null, branch: null };
  }

  return {
    isRepo: true,
    commits: commits !== null ? Number(commits) : null,
    lastCommit: lastCommit || null,
    branch: branch || null,
  };
}

// ---------------------------------------------------------------------------
// Stack detection.
// ---------------------------------------------------------------------------

const FRAMEWORK_ALIASES = {
  express: "Express",
  react: "React",
  "react-dom": "React",
  next: "Next.js",
  vue: "Vue",
  "@nestjs/core": "NestJS",
  koa: "Koa",
  django: "Django",
  flask: "Flask",
  fastapi: "FastAPI",
};

function stackKey(language) {
  if (language === "TypeScript" || language === "JavaScript") {
    return "javascript";
  }
  if (language === "C" || language === "C++") {
    return "c";
  }
  return language ? language.toLowerCase() : "generic";
}

function detectStack(dir, files) {
  const rels = new Set(files.map((file) => file.rel));
  const basenames = new Set(files.map((file) => path.basename(file.rel)));

  const has = (name) => rels.has(name) || (rels.has(name.toLowerCase()));

  let language = null;
  const frameworks = [];
  const manifests = [];

  const checkManifest = (name, lang, framework) => {
    if (basenames.has(name) && !language) {
      language = lang;
      manifests.push(name);

      if (framework) {
        frameworks.push(framework);
      }
      return true;
    }
    return false;
  };

  checkManifest("tsconfig.json", "TypeScript", null);
  checkManifest("Cargo.toml", "Rust", "Cargo");
  checkManifest("go.mod", "Go", null);
  checkManifest("pyproject.toml", "Python", null);
  checkManifest("requirements.txt", "Python", null);

  // Framework detection from package.json deps must run whenever package.json
  // exists, independently of who won the language race: a TypeScript project
  // (tsconfig.json sets language first) is still a package.json project, and
  // its Express/React/etc dependency must not go undetected just because
  // TypeScript already claimed `language`.
  if (basenames.has("package.json")) {
    if (!language) {
      language = "JavaScript";
    }
    manifests.push("package.json");

    const pkg = JSON.parse(
      fs.existsSync(path.join(dir, "package.json")) ? fs.readFileSync(path.join(dir, "package.json"), "utf8") : "{}",
    );
    const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };

    for (const [name, label] of Object.entries(FRAMEWORK_ALIASES)) {
      if (deps[name] && !frameworks.includes(label)) {
        frameworks.push(label);
      }
    }
  }

  if (basenames.has("CMakeLists.txt") && !language) {
    language = "C++";
    manifests.push("CMakeLists.txt");
    frameworks.push("CMake");
  }

  if (basenames.has("Makefile") && !language) {
    language = "C";
    manifests.push("Makefile");
    frameworks.push("Makefile");
  }

  for (const name of files.map((file) => file.rel)) {
    if (/\.(sln|csproj)$/.test(name) && !language) {
      language = "C#";
      manifests.push(name);
      break;
    }
  }

  // No manifest → dominant source extension decides.
  if (!language) {
    let bestExt = null;
    let bestCount = 0;

    for (const [ext, count] of Object.entries(files.reduce((acc, file) => {
      if (ALL_SOURCE_EXTS.has(file.ext)) {
        acc[file.ext] = (acc[file.ext] || 0) + 1;
      }
      return acc;
    }, {}))) {
      if (count > bestCount) {
        bestCount = count;
        bestExt = ext;
      }
    }

    const EXT_LANGUAGE = {
      ".c": "C",
      ".h": "C",
      ".cpp": "C++",
      ".hpp": "C++",
      ".rs": "Rust",
      ".go": "Go",
      ".py": "Python",
      ".js": "JavaScript",
      ".mjs": "JavaScript",
      ".cjs": "JavaScript",
      ".jsx": "JavaScript",
      ".ts": "TypeScript",
      ".tsx": "TypeScript",
      ".cs": "C#",
    };

    if (bestExt && EXT_LANGUAGE[bestExt]) {
      language = EXT_LANGUAGE[bestExt];
    }
  }

  const entryPoints = [];
  const ENTRY_NAMES = {
    TypeScript: ["src/index.ts", "src/main.ts", "server.ts", "index.ts"],
    JavaScript: ["src/index.js", "src/main.js", "server.js", "index.js"],
    C: ["src/main.c", "main.c"],
    Cpp: ["src/main.cpp", "main.cpp"],
    Rust: ["src/main.rs"],
    Go: ["main.go", "cmd/main.go"],
    Python: ["main.py", "app.py", "src/main.py"],
  };

  for (const name of ENTRY_NAMES[language] || []) {
    if (rels.has(name)) {
      entryPoints.push(name);
    }
  }

  return { language, frameworks, manifests, entryPoints };
}

// ---------------------------------------------------------------------------
// Tests detection — structural only.
// ---------------------------------------------------------------------------

const TEST_SUFFIX_RE = /(?:^|[_-])(?:test|spec)(?:\.|$)|\.test\.|\.spec\.|^test_/i;

function detectTests(files) {
  const testFiles = [];

  for (const file of files) {
    const rel = file.rel;

    if (/(^|\/)test(s)?\//.test(rel)) {
      testFiles.push({ rel, kind: "dir" });
    } else if (TEST_SUFFIX_RE.test(path.basename(rel))) {
      testFiles.push({ rel, kind: "suffix" });
    }
  }

  return { count: testFiles.length, files: testFiles };
}

// ---------------------------------------------------------------------------
// Concept detection.
// ---------------------------------------------------------------------------

// Files a concept's markers run over: the concept's own `scanFiles` list (by
// basename) when present, otherwise the language's source extensions.
function conceptFiles(concept, files, language) {
  if (concept.scanFiles) {
    const wanted = new Set(concept.scanFiles);
    return files.filter((file) => wanted.has(path.basename(file.rel)));
  }

  const exts = SOURCE_EXTS[language] || ALL_SOURCE_EXTS;
  return files.filter((file) => exts.has(file.ext) && !file.binary);
}

// A single fortuitous line — a comment, a pasted tutorial snippet, an
// unrelated callback — is not evidence of mastery. Requiring at least two
// occurrences makes an accidental one-off much less likely to pass on its
// own. But raw count is not enough either: two `addHook(...)` calls pasted
// together from a tutorial (different event names, same call) also produce
// two occurrences with zero real understanding. Line/file proximity cannot
// tell them apart from genuine code — a real socket/bind/listen sequence or
// two function-pointer typedefs are legitimately adjacent lines too. What
// *does* distinguish them: whether the evidence actually matched two
// different substrings (malloc vs free, socket vs listen, addHook vs
// preHandler) rather than the same call twice — see `evidenceIsDiverse`.
const MIN_CONCEPT_EVIDENCE = 2;

// True if the evidence isn't just the same call site duplicated: either it
// spans two different files (definitely independent), or at least two
// distinct substrings were matched (different operations of the concept, not
// the identical function call repeated with only its arguments changing —
// arguments aren't part of the match, so two `addHook("onRequest", …)` /
// `addHook("onSend", …)` calls both match the literal text "addHook(").
function evidenceIsDiverse(evidence) {
  const files = new Set(evidence.map((entry) => entry.file));
  if (files.size >= 2) {
    return true;
  }
  const matches = new Set(evidence.map((entry) => entry.match));
  return matches.size >= 2;
}

// Diversity is only meaningful for concepts whose marker enumerates distinct
// *named operations* of an API (malloc vs free, socket vs listen) — reusing
// the identical one there really is a weaker signal. It is NOT applied by
// default: for a marker that's a grammatical pair for one single feature
// (async/await both just mean "this code is async"), whose match text is an
// incidental prefix (`import f...` vs `import c...`, which collide or differ
// by pure chance of which letter a module name starts with), or that has
// only one possible alternative at all (`.use(` alone — there's no second
// distinct operation to require), text-identity is not a meaningful proxy
// and produces false negatives on completely ordinary code (two `async`
// handlers with no `await`, several `import` lines, two `.use()` calls
// registering two different real middlewares). `js-hooks` used to be here
// when its marker also matched `.on(` — removed alongside `.on(` itself
// (see stacks/javascript.js): grouping two matched substrings from two
// *different* concepts (middleware registration vs. an unrelated
// EventEmitter listener) as "diverse evidence of one concept" let
// `process.on("SIGTERM", …)` alone count as "middleware mastered". Opted in
// only where verified safe.
const DIVERSE_EVIDENCE_CONCEPTS = new Set([
  "c-memory",
  "c-files",
  "c-parsing",
  "c-threads",
  "c-sockets",
  "c-signals",
]);

function globalPattern(pattern) {
  return new RegExp(pattern.source, pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`);
}

function detectConcepts(language, files) {
  const bank = loadStack(stackKey(language)).concepts;
  const used = [];

  for (const concept of bank) {
    const scannable = conceptFiles(concept, files, language);
    const evidence = [];

    outer: for (const file of scannable) {
      const content = readScannable(file.abs);
      if (content === null) {
        continue;
      }

      const lines = content.split("\n");

      for (let i = 0; i < lines.length; i += 1) {
        const line = lines[i];

        for (const marker of concept.markers) {
          // Collect every match on the line, not just the first — a line
          // like `async function f() { await g(); }` legitimately contains
          // two distinct signals (async, await), and stopping at the first
          // would undercount real diversity that's actually present.
          for (const match of line.matchAll(globalPattern(marker.pattern))) {
            evidence.push({
              file: file.rel,
              line: i + 1,
              excerpt: line.trim().slice(0, 120),
              match: match[0].trim().toLowerCase(),
            });
            if (evidence.length >= 5) {
              break outer;
            }
          }
        }
      }
    }

    const diverseEnough = !DIVERSE_EVIDENCE_CONCEPTS.has(concept.id) || evidenceIsDiverse(evidence);

    if (evidence.length >= MIN_CONCEPT_EVIDENCE && diverseEnough) {
      used.push({ id: concept.id, name: concept.name, tier: concept.tier, evidence });
    }
  }

  used.sort((a, b) => b.tier - a.tier || (a.id < b.id ? -1 : 1));

  const byTier = {};
  for (const concept of used) {
    byTier[concept.tier] = byTier[concept.tier] || [];
    byTier[concept.tier].push(concept);
  }

  return { used, byTier };
}

function readScannable(abs) {
  try {
    const buffer = fs.readFileSync(abs, { encoding: "utf8", maxLength: 1024 * 1024 });

    if (buffer.includes("\0")) {
      return null;
    }

    return buffer;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Level estimation + direction suggestion.
// ---------------------------------------------------------------------------

function estimateLevel({ usedConcepts, tests, git, size }) {
  const conceptTier = usedConcepts.reduce((max, concept) => Math.max(max, concept.tier), 0);

  // Structural signals alone can never claim more than level 2: without concept
  // evidence there is no way to tell a deep codebase from a broad one, and a
  // single cheap proxy (just commit count, say) is too weak a basis on its own
  // — quantity is not quality. At least two independent signals must agree
  // before the structural floor bumps at all. They only raise a low base,
  // never lower a high one — a repo already at concept tier 4 stays Avancé
  // even if it has no tests.
  //
  // `tests` and `git` are not actually independent: a single empty test file
  // plus 50 commits are both just proxies for "some time has passed", and an
  // AI-assisted workflow naturally produces dozens of small commits regardless
  // of whether anything was understood — that pair co-occurs in nearly any
  // repo that has existed for more than a few days. `taille` (real LOC
  // written) is the one signal that actually tracks volume of work rather
  // than elapsed time or commit habits, so it's required in the pair: the
  // bump needs `taille` plus at least one of the other two, never `tests` +
  // `git` alone.
  const bumps = [];
  if (tests.count >= 1) {
    bumps.push("tests");
  }
  if (git.commits !== null && git.commits >= 50) {
    bumps.push("git");
  }
  if (size.totalLoc >= 2000) {
    bumps.push("taille");
  }
  const structuralTier = bumps.includes("taille") && bumps.length >= 2 ? 2 : 0;

  const tier = Math.max(conceptTier, structuralTier);

  const top = usedConcepts.slice(0, 2).map((concept) => `${concept.name} (niveau ${concept.tier})`);
  const rationale =
    top.length > 0
      ? `${usedConcepts.length} concept(s) mobilisé(s), dont ${top.join(", ")}.`
      : structuralTier > 0
        ? `Peu de marqueurs de concepts détectés — niveau estimé sur la structure (${bumps.join(", ")}).`
        : `Peu de marqueurs de concepts détectés, et pas assez de signaux structurels convergents (${bumps.join(", ") || "aucun"}) pour estimer un niveau au-delà du débutant.`;

  return { tier, label: LEVEL_LABELS[tier] || "Débutant", rationale };
}

// A direction's `doc` may cite a local vendored path (`docs/sources/<name>`).
// That path only exists once the learner ran `ai-learn docs add` for it — if
// the project never added the source, the citation is a promise, not a fact.
// Fall back to the direction's `docUrl` (a public, always-resolvable
// reference) when the local path is absent, same "never an unverifiable
// citation" contract as `propose.js`.
function resolveDirectionDoc(direction, dir) {
  const localMatch = direction.doc && direction.doc.match(/^docs\/sources\/[^\s—]+/);

  if (localMatch && dir) {
    const localPath = path.resolve(dir, localMatch[0]);

    if (!fs.existsSync(localPath)) {
      return direction.docUrl || direction.doc;
    }
  }

  return direction.doc;
}

// Shared non-regression filter: an entry (direction, recipe, or stress)
// survives only if it's anchored in real code (`requires`), strictly deeper
// than the deepest concept already used (`tier`), and its target isn't
// already mastered (`deepens`) — never a step back, never a re-teach. Sorted
// so the next-tier-up entries come first.
function filterByNonRegression(bank, { usedIds, maxUsedTier, frameworks }) {
  const eligible = bank.filter((entry) => {
    // `requiresFramework` is generic infrastructure, not tied to any specific
    // framework: a stack pack can gate an entry on a detected dependency (see
    // `frameworks`, populated by package.json deps) when its content only
    // makes sense for that framework. No pack uses it today.
    if (entry.requiresFramework && !frameworks.includes(entry.requiresFramework)) {
      return false; // content is specific to a framework this project doesn't use
    }
    if (!entry.requires.every((id) => usedIds.has(id))) {
      return false; // not anchored in real code
    }
    if (usedIds.has(entry.deepens)) {
      return false; // target already mastered — never re-teach
    }
    if (entry.tier <= maxUsedTier) {
      return false; // strictly deeper, never a step back
    }
    return true;
  });

  eligible.sort((a, b) => {
    const aNext = a.tier === maxUsedTier + 1 ? 0 : 1;
    const bNext = b.tier === maxUsedTier + 1 ? 0 : 1;
    return aNext - bNext || b.tier - a.tier || (a.id < b.id ? -1 : 1);
  });

  return eligible;
}

// Whether a direction's `mandatoryAt` predicate is satisfied by the
// project's real, measured size stats (per-file `loc`, see walkSources) —
// the clean-code/architecture seuil obligatoire (Partie D). No `mandatoryAt`
// on an entry (the common case) is simply never mandatory.
function evaluateMandatoryAt(mandatoryAt, { walked }) {
  if (!mandatoryAt || !walked) {
    return false;
  }
  if (mandatoryAt.metric === "locInFile") {
    return walked.files.some((file) => file.loc > mandatoryAt.gt);
  }
  return false;
}

function suggestDirections({ language, usedConcepts, dir = null, frameworks = [], walked = null }) {
  // Directions say why to go deeper; recipes (build-your-own-x ladders) say how.
  // Both obey the same non-regression contract, so they share one filter.
  const pack = loadStack(stackKey(language));
  const bank = [...pack.directions, ...pack.recipes];
  const usedIds = new Set(usedConcepts.map((concept) => concept.id));
  const maxUsedTier = usedConcepts.reduce((max, concept) => Math.max(max, concept.tier), 0);

  const filtered = filterByNonRegression(bank, { usedIds, maxUsedTier, frameworks }).map((direction) => ({
    ...direction,
    mandatory: evaluateMandatoryAt(direction.mandatoryAt, { walked }),
  }));

  // Mandatory entries surface first — Array#sort is stable, so this only
  // ever promotes them ahead of the existing tier-proximity order, never
  // reshuffles the rest.
  filtered.sort((a, b) => (b.mandatory ? 1 : 0) - (a.mandatory ? 1 : 0));

  return filtered.slice(0, 5).map((direction) => ({ ...direction, doc: resolveDirectionDoc(direction, dir) }));
}

// The "10x" reinforcement bank (see docs/plans/git-gh-renforcement-domaine.md
// — Partie B): a stress is the
// same shape as a direction (requires/deepens/tier), plus a `stressCheckpoint`
// that actually applies the load/malformed-input/concurrency and is expected
// to fail before the fix — the tweet's mechanism, but the casse is executed,
// never narrated. Same non-regression filter, same "never a step back".
function suggestStresses({ language, usedConcepts, dir = null, frameworks = [] }) {
  const pack = loadStack(stackKey(language));
  const usedIds = new Set(usedConcepts.map((concept) => concept.id));
  const maxUsedTier = usedConcepts.reduce((max, concept) => Math.max(max, concept.tier), 0);

  return filterByNonRegression(pack.stresses || [], { usedIds, maxUsedTier, frameworks })
    .slice(0, 5)
    .map((stress) => ({ ...stress, doc: resolveDirectionDoc(stress, dir) }));
}

// ---------------------------------------------------------------------------
// Report composition.
// ---------------------------------------------------------------------------

function scanProject(dir) {
  const abs = path.resolve(dir);
  const { config, exists } = readProgress(abs);
  const walked = walkSources(abs);
  const stack = detectStack(abs, walked.files);
  const git = gitState(abs);
  const tests = detectTests(walked.files);
  const concepts = detectConcepts(stack.language, walked.files);
  const level = estimateLevel({ usedConcepts: concepts.used, tests, git, size: walked });
  const suggestions = suggestDirections({ language: stack.language, usedConcepts: concepts.used, dir: abs, frameworks: stack.frameworks, walked });
  const stresses = suggestStresses({ language: stack.language, usedConcepts: concepts.used, dir: abs, frameworks: stack.frameworks });

  let learning = null;

  if (exists) {
    if (!config) {
      learning = { invalid: true };
    } else {
      const evidenceDate = (phaseId) => {
        const ev = latestEvidenceForPhase(abs, phaseId);
        return ev ? String(ev.generatedAt).slice(0, 10) : null;
      };

      learning = {
        project: config.project,
        technology: config.technology,
        doneCount: config.phases.filter((phase) => phase.status === "done").length,
        totalCount: config.phases.length,
        phases: config.phases.map((phase) => ({
          id: phase.id,
          name: phase.name,
          status: phase.status,
          checkpoint: phase.checkpoint || null,
          artifacts: phase.artifacts || [],
          predictionsRequired: phase.predictionsRequired || 0,
          evidenceDate: phase.status === "done" ? evidenceDate(phase.id) : null,
        })),
      };
    }
  }

  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    dir: abs,
    learningProject: exists,
    learning,
    stack,
    size: {
      files: walked.files.length,
      totalLoc: walked.totalLoc,
      byExt: walked.byExt,
      capped: walked.capped,
    },
    git,
    tests,
    concepts,
    level,
    suggestions,
    stresses,
  };
}

// ---------------------------------------------------------------------------
// Human report.
// ---------------------------------------------------------------------------

function printReport(report) {
  const projectName = path.basename(report.dir);

  log(`Où tu en es — ${projectName}`);
  log("");

  const stackParts = [
    report.stack.language || "inconnu",
    ...(report.stack.frameworks.length > 0 ? [report.stack.frameworks.join(", ")] : []),
    `${report.size.files} fichier(s)`,
    `${report.size.totalLoc} LOC`,
  ];

  if (report.stack.manifests.length > 0) {
    stackParts.push(`manifests: ${report.stack.manifests.join(", ")}`);
  }

  log(`Stack : ${stackParts.join(" · ")}`);

  const gitParts = report.git.isRepo
    ? [`${report.git.commits} commit(s)`, report.git.lastCommit ? `dernière ${report.git.lastCommit.slice(0, 10)}` : null, report.git.branch ? `branche ${report.git.branch}` : null]
        .filter(Boolean)
        .join(" · ")
    : "pas de dépôt git";
  log(`Git   : ${gitParts}`);
  log(`Tests : ${report.tests.count === 0 ? "aucun fichier de test détecté" : `${report.tests.count} fichier(s) de test détecté(s)`}`);

  if (report.size.capped) {
    log("  (analyse plafonnée — projet trop gros, résultats approximatifs)");
  }

  log("");
  log("Concepts déjà mobilisés :");

  if (report.concepts.used.length === 0) {
    log("  (aucun concept de la banque détecté — niveau estimé sur la structure)");
  } else {
    for (const concept of report.concepts.used) {
      const first = concept.evidence[0];
      const where = first ? `${first.file}:${first.line}` : "";
      log(`  [${concept.tier}] ${concept.name}   ${where}   ${first ? first.excerpt : ""}`.trimEnd());
    }
  }

  log("");
  log(`Niveau estimé : ${report.level.tier} — ${report.level.label}`);
  log(`  (${report.level.rationale})`);

  log("");
  log("Suite proposée (à affiner par l'IA — doc citée, phases réelles) :");

  if (report.suggestions.length === 0) {
    log("  (aucune direction de la banque au-delà du niveau actuel — l'IA proposera des directions personnalisées)");
  } else {
    report.suggestions.forEach((direction, index) => {
      const marker = direction.mandatory ? "⚠ OBLIGATOIRE —" : `${index + 1}.`;
      log(`  ${marker} ${direction.title}   — niveau ${direction.tier}`);
      log(`     Pourquoi : ${direction.why}`);
      log(`     Ancre : ${direction.anchor}`);
      log(`     Doc   : ${direction.doc}`);

      if (direction.steps && direction.steps.length > 0) {
        log(`     Étapes concrètes :`);

        for (const step of direction.steps) {
          log(`       • ${step.title}  (checkpoint : ${step.checkpoint})`);
        }
      }
    });
  }

  log("");
  log("Non-régression : ces directions prolongent ton code existant. Aucune reprise à zéro — rien ne recommence.");

  log("");
  log("Stress réels proposés (renfort méthode — casse exécutée, pas racontée ; 1-2 max par projet) :");

  if (report.stresses.length === 0) {
    log("  (aucun stress de la banque au-delà du niveau actuel)");
  } else {
    report.stresses.forEach((stress, index) => {
      log(`  ${index + 1}. ${stress.title}   — niveau ${stress.tier}`);
      log(`     Pourquoi : ${stress.why}`);
      log(`     Casse    : ${stress.stressCheckpoint}`);
      log(`     Doc      : ${stress.doc}`);
    });
  }

  if (report.learningProject) {
    log("");
    log(`Parcours existant : ${report.learning.doneCount}/${report.learning.totalCount} phases done`);

    for (const phase of report.learning.phases) {
      const mark = phase.status === "done" ? "✓" : phase.status === "in_progress" ? "●" : "○";
      const evidence = phase.evidenceDate ? `   (evidence ${phase.evidenceDate})` : "";
      log(`  ${mark} Phase ${phase.id} — ${phase.name}${evidence}`);
    }

    log("La suite proposée prolonge ce parcours : elle ajoute des phases, elle n'en efface aucune.");
  }

  log("");
  log("Pour transformer ces directions en parcours suivi :");
  log("  ai-learn init --phases '<JSON>'   (l'IA le fait pour toi)");
}

function scanCommand({ dir }) {
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) {
    fail(`No such directory: ${dir}`);
  }

  const report = scanProject(dir);
  printReport(report);

  const outPath = path.join(dir, ".ai-learn", "scan.json");
  writeJson(outPath, report);
  log(`\nRapport écrit : ${normalizePortable(path.relative(dir, outPath))}`);
}

module.exports = {
  scanProject,
  scanCommand,
  walkSources,
  gitState,
  detectStack,
  detectTests,
  detectConcepts,
  estimateLevel,
  suggestDirections,
  suggestStresses,
  evaluateMandatoryAt,
  resolveDirectionDoc,
  loadStack,
  stackKey,
  SOURCE_EXTS,
  ALL_SOURCE_EXTS,
};
