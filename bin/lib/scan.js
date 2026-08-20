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
const { spawnSync } = require("child_process");
const { log, fail, writeJson, normalizePortable } = require("./util");
const { progressPath, readProgress } = require("./progress");
const { latestEvidenceForPhase } = require("./status");

// ---------------------------------------------------------------------------
// Per-stack concept banks. A concept is a marker the scanner proves is used by
// grepping source lines; each carries a depth tier so the level estimate and
// the direction filter have something structural to compare.
// ---------------------------------------------------------------------------

const C_CONCEPTS = [
  {
    id: "c-modules",
    name: "Découpage modules (headers / .c multiples)",
    tier: 1,
    markers: [{ pattern: /\b#include\s+"[\w./-]+\.h"/, sample: '#include "entities.h"' }],
  },
  {
    id: "c-memory",
    name: "Allocation mémoire (malloc/calloc/realloc/free)",
    tier: 2,
    markers: [{ pattern: /\b(?:malloc|calloc|realloc|free)\s*\(/, sample: "malloc(sizeof(Node))" }],
  },
  {
    id: "c-build",
    name: "Build (Makefile/CMake)",
    tier: 2,
    scanFiles: ["Makefile", "CMakeLists.txt"],
    markers: [{ pattern: /^(?:CC|CFLAGS|LDFLAGS|gcc|clang|cc)\b/m, sample: "CC=gcc" }],
  },
  {
    id: "c-files",
    name: "Entrées-sorties fichiers",
    tier: 2,
    markers: [{ pattern: /\b(?:fopen|fclose|fread|fwrite|fprintf|open|read|write|close)\s*\(/, sample: "fopen(path, \"r\")" }],
  },
  {
    id: "c-struct-fn-ptr",
    name: "struct + pointeurs de fonction",
    tier: 3,
    markers: [{ pattern: /\b\w+(?:\s*\(?\s*\*\s*\w+\s*\))\s*\(/, sample: "int (*cmp)(const void*, const void*)" }],
  },
  {
    id: "c-parsing",
    name: "Parsing texte (strtok/sscanf/strsep)",
    tier: 3,
    markers: [{ pattern: /\b(?:strtok|sscanf|strsep|strchr|strstr)\s*\(/, sample: "sscanf(line, \"%s %d\", buf, &n)" }],
  },
  {
    id: "c-threads",
    name: "Threads (pthread)",
    tier: 4,
    markers: [{ pattern: /\bpthread_(?:create|join|detach|mutex_lock|mutex_unlock|cond_wait)\s*\(/, sample: "pthread_create(&t, NULL, worker, arg)" }],
  },
  {
    id: "c-sockets",
    name: "Réseau (socket/bind/listen/accept)",
    tier: 4,
    markers: [{ pattern: /\b(?:socket|bind|listen|accept|connect|send|recv)\s*\(/, sample: "socket(AF_INET, SOCK_STREAM, 0)" }],
  },
  {
    id: "c-signals",
    name: "Signaux (signal/sigaction)",
    tier: 4,
    markers: [{ pattern: /\b(?:signal|sigaction|sigemptyset|kill)\s*\(/, sample: "sigaction(SIGINT, &sa, NULL)" }],
  },
];

const JS_CONCEPTS = [
  {
    id: "js-modules",
    name: "Modules (ESM/CJS)",
    tier: 1,
    markers: [
      { pattern: /^\s*(?:import|export)\s+\S/, sample: 'import fastify from "fastify"' },
      { pattern: /^\s*const\s+\w+\s*=\s*require\(/, sample: "const http = require('http')" },
    ],
  },
  {
    id: "js-routes",
    name: "Routes / API",
    tier: 2,
    markers: [
      { pattern: /\.(?:get|post|put|patch|delete|route)\s*\(\s*["'`]/, sample: 'app.get("/health", …)' },
      { pattern: /\b(?:app|server|fastify)\.[A-Za-z]+\(/, sample: "fastify.register(…)" },
    ],
  },
  {
    id: "js-async",
    name: "async/await",
    tier: 2,
    markers: [{ pattern: /\basync\b|\bawait\b/, sample: "async (request, reply) => …" }],
  },
  {
    id: "js-tests",
    name: "Tests (test runner)",
    tier: 2,
    markers: [{ pattern: /\b(?:describe|it|test)\s*\(/, sample: 'test("…", …)' }],
  },
  {
    id: "js-schema-validation",
    name: "Validation de schéma (JSON Schema / zod / joi)",
    tier: 3,
    markers: [{ pattern: /\b(?:schema|typebox|zod|joi|ajv)\b/i, sample: "schema: { body: … }" }],
  },
  {
    id: "js-hooks",
    name: "Hooks / middleware",
    tier: 3,
    markers: [
      { pattern: /\.(?:addHook|use|beforeHandler|preHandler)\s*\(/, sample: 'server.addHook("onRequest", …)' },
      { pattern: /\b(?:next\(|done\(\))/, sample: "next()" },
    ],
  },
  {
    id: "js-workers",
    name: "worker_threads / processus",
    tier: 4,
    markers: [{ pattern: /worker_threads|new\s+Worker|child_process|cluster\b/, sample: "new Worker(path)" }],
  },
];

// No concepts for an unknown language — level comes from structure only.
const GENERIC_CONCEPTS = [];

const CONCEPTS_BY_STACK = { c: C_CONCEPTS, javascript: JS_CONCEPTS, generic: GENERIC_CONCEPTS };

// ---------------------------------------------------------------------------
// Per-stack deepening directions. `deepens` is the concept id a direction would
// introduce — deliberately NOT present in the concept banks, so it can never be
// "already used" and the filter only ever kills directions whose target is
// already mastered. `requires` are concept ids that must be present for the
// direction to be anchored in real code.
// ---------------------------------------------------------------------------

const DIRECTIONS = {
  c: [
    {
      id: "c-concurrency",
      title: "Concurrence réelle : mutex, cond vars, thread pool",
      why: "Tu as déjà pthread_create — l'étape suivante est la synchronisation et les patterns de concurrence (pool, producteur-consommateur).",
      anchor: "src/net.c (pthread_create détecté)",
      tier: 5,
      deepens: "c-thread-sync",
      requires: ["c-threads"],
      doc: "man pthread_mutex_init, pthread_cond_wait; The Linux Programming Interface chap. 30-31; CS:APP chap. 12",
    },
    {
      id: "c-event-loop",
      title: "Loop d'événements / epoll + I/O non-bloquante",
      why: "Tu fais du socket bloquant (1 thread par connexion) — la montée en charge passe par epoll et l'I/O multiplexée.",
      anchor: "src/net.c (socket/bind/listen détecté)",
      tier: 5,
      deepens: "c-epoll",
      requires: ["c-sockets"],
      doc: "man epoll_wait, man 7 epoll; TLPI chap. 63",
    },
    {
      id: "c-memory-pools",
      title: "Allocation maîtrisée : pools, arènes, valgrind, ASan",
      why: "malloc est présent — on passe à l'allocation contrôlée et à la chasse aux fuites/UB systématique.",
      anchor: "src/*.c (malloc détecté)",
      tier: 4,
      deepens: "c-memory-advanced",
      requires: ["c-memory"],
      doc: "valgrind --leak-check=full; -fsanitize=address,undefined; CS:APP chap. 9",
    },
    {
      id: "c-arch",
      title: "Architecture en couches : parser → moteur → I/O",
      why: "Le découpage src/ + headers existe — on pousse la séparation des préoccupations et l'ABI interne.",
      anchor: "src/ (découpage modules détecté)",
      tier: 4,
      deepens: "c-arch",
      requires: ["c-build"],
      doc: "D.L. Parnas, « On the Criteria To Be Used in Decomposing Systems into Modules »",
    },
  ],
  javascript: [
    {
      id: "js-lifecycle",
      title: "Fastify lifecycle & hooks (onRequest → preHandler → onSend)",
      why: "Tes routes marchent — la profondeur suivante est l'ordre d'exécution du lifecycle et les hooks.",
      anchor: "src/index.ts (routes détectées)",
      tier: 4,
      deepens: "js-lifecycle",
      requires: ["js-routes"],
      doc: "docs/sources/fastify-docs — Lifecycle; Hooks",
    },
    {
      id: "js-schema-first",
      title: "JSON Schema + TypeBox : validation & sérialisation",
      why: "Tu réponds en JSON brut — le passage à un schéma (TypeBox) valide, sérialise et documente.",
      anchor: "src/index.ts (routes détectées)",
      tier: 4,
      deepens: "js-schema",
      requires: ["js-routes"],
      doc: "docs/sources/fastify-docs — Validation & Serialization; @sinclair/typebox",
    },
    {
      id: "js-plugins",
      title: "Plugins & encapsulation",
      why: "Une seule app — on découpe en plugins Fastify (encapsulation, décorateurs, registre).",
      anchor: "src/ (structure modules détectée)",
      tier: 4,
      deepens: "js-plugins",
      requires: ["js-routes"],
      doc: "docs/sources/fastify-docs — Plugins, Encapsulation",
    },
    {
      id: "js-workers",
      title: "worker_threads : sortir le CPU-bound du loop",
      why: "async/await est là — le calcul intensif reste bloquant, on le déporte sur worker_threads.",
      anchor: "src/index.ts (async/await détecté)",
      tier: 5,
      deepens: "js-workers",
      requires: ["js-async"],
      doc: "node:worker_threads docs",
    },
  ],
  generic: [
    {
      id: "g-perf",
      title: "Profiling & performance",
      why: "Le code est là — la suite mesure et optimise ce qui compte (hot paths, allocations).",
      anchor: "code existant (hot paths)",
      tier: 4,
      deepens: "__generic__",
      requires: [],
      doc: "profiler de la stack + mesure avant optimisation",
    },
    {
      id: "g-arch",
      title: "Architecture & modularité",
      why: "Le projet grossit — on découpe en couches/plugins et on formalise les interfaces internes.",
      anchor: "structure de dossiers existante",
      tier: 4,
      deepens: "__generic__",
      requires: [],
      doc: "patterns d'architecture de la stack",
    },
    {
      id: "g-tests",
      title: "Durcissement des tests",
      why: "La régression devient un coût — on couvre les cas limites et on automatise l'exécution.",
      anchor: "tests existants ou à créer",
      tier: 4,
      deepens: "__generic__",
      requires: [],
      doc: "bonnes pratiques de test de la stack",
    },
    {
      id: "g-tooling",
      title: "CI & outillage",
      why: "Le build manuel sature — on automatise lint, test, build, release.",
      anchor: "scripts de build existants",
      tier: 5,
      deepens: "__generic__",
      requires: [],
      doc: "CI de la stack (GitHub Actions, Makefile…)",
    },
    {
      id: "g-docs",
      title: "Documentation & API publique",
      why: "Le code est dense — on documente l'usage et le design pour le rendre transmissible.",
      anchor: "README / doc existante",
      tier: 4,
      deepens: "__generic__",
      requires: [],
      doc: "comment écrire une doc d'usage utile",
    },
  ],
};

// ---------------------------------------------------------------------------
// Deepening recipes (from build-your-own-x). Where a DIRECTIONS entry says
// *why* to go deeper, a recipe says *how*: a short executable ladder, each step
// with a checkpoint the learner can actually run. Same non-regression shape as
// DIRECTIONS (`requires` are concept ids, `deepens` is a target that never sits
// in a concept bank). Kept small and curated — only well-known, guidable
// projects (git, http, redis, a tiny database), never an invented project.
// ---------------------------------------------------------------------------

const RECIPES = {
  c: [
    {
      id: "c-http-server",
      title: "Serveur HTTP from scratch (parser + keep-alive)",
      why: "Tu sais socket/bind/listen — un serveur HTTP complet prouve la couche protocole sous tout framework.",
      anchor: "src/net.c (socket détecté)",
      tier: 5,
      deepens: "c-http",
      requires: ["c-sockets", "c-parsing"],
      steps: [
        { title: "Lire la requête (ligne de requête + headers)", checkpoint: "curl -v 127.0.0.1:8080/ répond 200 avec un body" },
        { title: "Servir des fichiers + headers (Content-Length, Content-Type)", checkpoint: "curl -I montre un Content-Length exact" },
        { title: "Keep-alive : plusieurs requêtes sur une connexion", checkpoint: "2 requêtes sur la même connexion TCP répondent toutes les deux" },
      ],
      doc: "man 2 socket/accept/read/write; RFC 9110",
    },
    {
      id: "c-mini-git",
      title: "Mini-git : objets, refs, commits",
      why: "malloc/free + fichiers sont là — un format de sauvegarde versionné (objets hash-adressés) est la montée en profondeur naturelle.",
      anchor: "src/ (malloc/fopen détectés)",
      tier: 5,
      deepens: "c-git-objects",
      requires: ["c-memory", "c-files", "c-parsing"],
      steps: [
        { title: "Objets blob/tree + hash SHA-1", checkpoint: "./sgit cat-file -p <hash> affiche le contenu du blob" },
        { title: "Refs + index (staging)", checkpoint: "./sgit add puis ./sgit ls-files listent le même fichier" },
        { title: "Commits + graphe", checkpoint: "./sgit log affiche le graphe des commits" },
        { title: "Packfile/delta (bonus)", checkpoint: "un 2e commit ne stocke que le delta" },
      ],
      doc: "git-scm.com/book (The Git Book)",
    },
    {
      id: "c-database",
      title: "Petite base : persistance paginée + index",
      why: "Parsing + fichiers maîtrisés — un moteur de stockage persistant avec index est un classique de montée en profondeur.",
      anchor: "src/main.c (sscanf/fopen détectés)",
      tier: 5,
      deepens: "c-sql-engine",
      requires: ["c-memory", "c-files", "c-parsing"],
      steps: [
        { title: "Parser des commandes simples (CREATE/INSERT/SELECT)", checkpoint: "./db accepte une commande et répond ok" },
        { title: "Stockage paginé dans un fichier", checkpoint: "redémarrer lit les données écrites (persistance)" },
        { title: "Index par clé : requête sans scan complet", checkpoint: "SELECT … WHERE id= ne scanne pas tout le fichier (logs)" },
      ],
      doc: "SQLite file format; CS:APP chap. 9",
    },
  ],
  javascript: [
    {
      id: "js-http-server",
      title: "Serveur HTTP from scratch (node:http)",
      why: "async/await est là — un serveur http brut montre la couche qu'un framework abstrait.",
      anchor: "src/index.ts (async/await détecté)",
      tier: 3,
      deepens: "js-http",
      requires: ["js-async"],
      steps: [
        { title: "Écouter + répondre 200", checkpoint: "curl -i 127.0.0.1:8080/ → 200" },
        { title: "Routing + réponse JSON", checkpoint: "GET /items renvoie un JSON valide" },
        { title: "Streaming/compression", checkpoint: "curl --compressed décompresse" },
      ],
      doc: "node:http docs",
    },
    {
      id: "js-redis",
      title: "Mini-redis : RESP, SET/GET, persistance",
      why: "async + tests sont là — un serveur mémoire avec un protocole texte parsé et une persistance est un projet guidé classique.",
      anchor: "test/ + async détectés",
      tier: 4,
      deepens: "js-redis",
      requires: ["js-async", "js-tests"],
      steps: [
        { title: "Parseur RESP", checkpoint: "un test injecte *3\\r\\n$3\\r\\nSET… et reçoit +OK" },
        { title: "SET/GET + expiration", checkpoint: "test EXPIRE → après N ms, GET renvoie null" },
        { title: "Persistance (dump)", checkpoint: "redémarrer le serveur, les données sont là" },
      ],
      doc: "redis.io/topics/protocol",
    },
    {
      id: "js-mini-git",
      title: "Mini-git en JS : objets + commits",
      why: "async + tests sont là — les objets hash-adressés en JS, avec tests, est une bonne profondeur.",
      anchor: "test/ + async détectés",
      tier: 4,
      deepens: "js-git-objects",
      requires: ["js-async", "js-tests"],
      steps: [
        { title: "Objets + SHA-1 (node:crypto)", checkpoint: "test cat-file affiche le blob" },
        { title: "Refs + commits", checkpoint: "test log affiche le graphe" },
      ],
      doc: "git-scm.com/book (The Git Book)",
    },
  ],
};

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
    if (!file.binary && file.size <= maxBytes) {
      totalLoc += countLines(file.abs, maxBytes);
    }
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
      const res = spawnSync("git", ["-C", dir, ...args], { encoding: "utf8" });
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
  fastify: "Fastify",
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
  express: "Express",
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

  if (basenames.has("package.json") && !language) {
    language = "JavaScript";
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

function detectConcepts(language, files) {
  const bank = CONCEPTS_BY_STACK[stackKey(language)] || GENERIC_CONCEPTS;
  const used = [];

  for (const concept of bank) {
    const scannable = conceptFiles(concept, files, language);
    const evidence = [];
    let matched = false;

    for (const file of scannable) {
      if (evidence.length >= 5) {
        break;
      }

      const content = readScannable(file.abs);
      if (content === null) {
        continue;
      }

      const lines = content.split("\n");

      for (let i = 0; i < lines.length; i += 1) {
        const line = lines[i];

        for (const marker of concept.markers) {
          if (marker.pattern.test(line)) {
            evidence.push({ file: file.rel, line: i + 1, excerpt: line.trim().slice(0, 120) });
            matched = true;
            break;
          }
        }

        if (matched && evidence.length) {
          break;
        }
      }
    }

    if (matched) {
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

  // Structural signals alone can never claim more than level 3: without concept
  // evidence there is no way to tell a deep codebase from a broad one. They only
  // raise a low base, never lower a high one — a repo already at concept tier 4
  // stays Avancé even if it has no tests.
  let structuralTier = 0;
  const bumps = [];
  if (tests.count >= 1) {
    bumps.push("tests");
    structuralTier = Math.max(structuralTier, 2);
  }
  if (git.commits !== null && git.commits >= 50) {
    bumps.push("git");
    structuralTier = Math.max(structuralTier, 2);
  }
  if (size.totalLoc >= 2000) {
    bumps.push("taille");
    structuralTier = Math.max(structuralTier, 2);
  }
  structuralTier = Math.min(structuralTier, 3);

  const tier = Math.max(conceptTier, structuralTier);

  const top = usedConcepts.slice(0, 2).map((concept) => `${concept.name} (niveau ${concept.tier})`);
  const rationale =
    top.length > 0
      ? `${usedConcepts.length} concept(s) mobilisé(s), dont ${top.join(", ")}.`
      : `Peu de marqueurs de concepts détectés — niveau estimé sur la structure (${bumps.join(", ") || "taille, git, tests"}).`;

  return { tier, label: LEVEL_LABELS[tier] || "Inconnu", rationale };
}

function suggestDirections({ language, usedConcepts }) {
  // Directions say why to go deeper; recipes (build-your-own-x ladders) say how.
  // Both obey the same non-regression contract, so they share one filter.
  const key = stackKey(language);
  const bank = [...(DIRECTIONS[key] || DIRECTIONS.generic), ...(RECIPES[key] || [])];
  const usedIds = new Set(usedConcepts.map((concept) => concept.id));
  const maxUsedTier = usedConcepts.reduce((max, concept) => Math.max(max, concept.tier), 0);

  const eligible = bank.filter((direction) => {
    if (!direction.requires.every((id) => usedIds.has(id))) {
      return false; // not anchored in real code
    }
    if (usedIds.has(direction.deepens)) {
      return false; // target already mastered — never re-teach
    }
    if (direction.tier <= maxUsedTier) {
      return false; // strictly deeper, never a step back
    }
    return true;
  });

  eligible.sort((a, b) => {
    const aNext = a.tier === maxUsedTier + 1 ? 0 : 1;
    const bNext = b.tier === maxUsedTier + 1 ? 0 : 1;
    return aNext - bNext || b.tier - a.tier || (a.id < b.id ? -1 : 1);
  });

  return eligible.slice(0, 5);
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
  const suggestions = suggestDirections({ language: stack.language, usedConcepts: concepts.used });

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
      log(`  ${index + 1}. ${direction.title}   — niveau ${direction.tier}`);
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
  C_CONCEPTS,
  JS_CONCEPTS,
  DIRECTIONS,
  RECIPES,
};
