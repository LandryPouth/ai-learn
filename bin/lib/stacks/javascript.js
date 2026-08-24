"use strict";

// JavaScript/TypeScript stack pack for `ai-learn scan`. Deliberately
// framework-neutral: markers and samples name Node core APIs or idioms shared
// across common web frameworks (app.use, app.get, async/await), never one
// specific framework's branded vocabulary or its docs — a project using any
// of them, or none, gets the same concept bank. See bin/lib/scan.js for the
// shape these three arrays must follow.

const concepts = [
  {
    id: "js-modules",
    name: "Modules (ESM/CJS)",
    tier: 1,
    markers: [
      { pattern: /^\s*(?:import|export)\s+\S/, sample: 'import { readFile } from "node:fs/promises"' },
      { pattern: /^\s*const\s+\w+\s*=\s*require\(/, sample: "const http = require('http')" },
    ],
  },
  {
    id: "js-routes",
    name: "Routes / API",
    tier: 2,
    markers: [
      { pattern: /\.(?:get|post|put|patch|delete|route)\s*\(\s*["'`]/, sample: 'app.get("/health", …)' },
      { pattern: /\b(?:app|server)\.[A-Za-z]+\(/, sample: "server.listen(port)" },
    ],
  },
  {
    id: "js-async",
    name: "async/await",
    tier: 2,
    markers: [{ pattern: /\basync\b|\bawait\b/, sample: "async (req, res) => …" }],
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
    name: "Middleware (use)",
    tier: 3,
    // No standalone `next(`/`done()` marker: it appears in any plain Node
    // callback, unrelated to middleware — too generic to be evidence on its
    // own. No `.on(` either: EventEmitter listeners (`process.on("SIGTERM",
    // …)`, a stream's `.on("data", …)`) are unrelated to middleware
    // registration — grouping them here previously let an ordinary shutdown
    // handler count as "middleware mastered".
    markers: [{ pattern: /\.use\s*\(/, sample: "app.use(logger)" }],
  },
  {
    id: "js-workers",
    name: "worker_threads / processus",
    tier: 4,
    markers: [{ pattern: /worker_threads|new\s+Worker|child_process|cluster\b/, sample: "new Worker(path)" }],
  },
];

const directions = [
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
];

const recipes = [
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
];

const stresses = [
  {
    id: "js-load-concurrency",
    title: "10x connexions concurrentes",
    why: "Les routes tiennent en usage normal — à 10x connexions simultanées, un handler synchrone ou une opération bloquante sature l'event loop. La casse est observée pour de vrai (timeouts, process qui ne répond plus) avant d'apprendre le fix (limitation de concurrence, file d'attente, ou déport du travail bloquant).",
    anchor: "src/index.ts (routes détectées)",
    tier: 3,
    deepens: "js-concurrency-limit",
    requires: ["js-routes"],
    stressCheckpoint: "un script envoie ~200 requêtes concurrentes vers une même route — sans fix, une partie timeout ou le process devient inutilisable",
    doc: "Node.js event loop docs (nodejs.org/en/docs/guides/event-loop-timers-and-nexttick)",
  },
];

// Clean-code thresholds for `ai-learn norm` — same numbers as generic.js's
// fallback for v1, declared explicitly here (not inherited) so this stack
// stays independently tunable later. See bin/lib/norm.js.
const norm = { maxFileLines: 400, maxFunctionLines: 50, maxNestingDepth: 4, maxParams: 5 };

module.exports = { concepts, directions, recipes, stresses, norm };
