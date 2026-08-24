"use strict";

// C stack pack for `ai-learn scan` — concepts, deepening directions, and
// build-your-own-x recipes. See bin/lib/scan.js for the shape these three
// arrays must follow and the non-regression contract that filters them.

const concepts = [
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

const directions = [
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
];

const recipes = [
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
];

const stresses = [
  {
    id: "c-malloc-stress",
    title: "10x le volume d'allocations",
    why: "malloc/free fonctionnent sur un cas simple — à 10x le volume normal d'allocations (ou un chemin d'erreur qui saute un free), les fuites et la fragmentation deviennent visibles. On observe la casse réelle (valgrind qui hurle) avant d'apprendre le pattern de gestion systématique.",
    anchor: "src/*.c (malloc détecté)",
    tier: 3,
    deepens: "c-memory-advanced",
    requires: ["c-memory"],
    stressCheckpoint: "valgrind --leak-check=full sur un scénario qui alloue 10x le volume normal révèle des fuites réelles",
    doc: "valgrind --leak-check=full; CS:APP chap. 9",
  },
];

// Clean-code thresholds for `ai-learn norm`, explicitly inspired by (not a
// copy of) École 42's Norminette: maxParams kept at its exact real value (4),
// maxFunctionLines loosened from the literal 25 to 30 to absorb this
// heuristic's raw-physical-line counting (no comment/blank stripping in v1).
// See bin/lib/norm.js.
const norm = { maxFileLines: 250, maxFunctionLines: 30, maxNestingDepth: 4, maxParams: 4 };

module.exports = { concepts, directions, recipes, stresses, norm };
