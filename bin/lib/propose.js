"use strict";

// `ai-learn propose` — suggérer des projets à construire quand l'apprenant ne
// sait pas quoi faire. Suit les standards codecrafters : un vrai artefact avec
// un format précis (protocole, format de fichier, RFC), des étapes progressives,
// et un checkpoint vérifiable par étape.
//
// La garantie « assez de ressources fiables pour bâtir le plan d'apprentissage »
// est structurelle : chaque étape est adossée à une ressource vérifiable (URL
// http(s), RFC, man page, livre, source locale docs/sources/). Un projet dont
// une étape n'a pas de ressource est refusé — même contrat que `docs add --regen`
// du côté forme. Le tool vérifie la forme et l'existence locale, pas le réseau :
// une URL plausible mais fausse passe ici, le vrai contrôle réseau se fait au
// moment du plan (`ai-learn docs add` pour chaque ressource). On ne bâtit pas un
// plan sur du vide, mais on ne prétend pas confirmer le réseau.

const fs = require("fs");
const path = require("path");
const { log, fail, writeJson } = require("./util");

// Banque de projets (standards codecrafters). `stack` : null = n'importe quel
// langage, sinon un tableau de clés de stack (c, javascript, python, go…).
// Chaque `stage` relie un pas d'apprentissage à un checkpoint concret et à une
// ressource vérifiable — c'est cette ressource qui permettra de citer le plan.
const PROJECTS = [
  {
    id: "http-server",
    title: "Serveur HTTP from scratch (parser + keep-alive)",
    difficulty: 3,
    stack: ["c", "javascript", "python", "go", "rust"],
    why: "La couche protocole que tous les frameworks cachent : on comprend enfin ce que fastify/express font pour nous.",
    stages: [
      { title: "Lire la requête (ligne de requête + headers)", checkpoint: "curl -v 127.0.0.1:8080/ répond 200 avec un body", resource: { name: "RFC 9110", ref: "https://www.rfc-editor.org/rfc/rfc9110" } },
      { title: "Servir des fichiers + headers (Content-Length, Content-Type)", checkpoint: "curl -I montre un Content-Length exact", resource: { name: "man 2 stat", ref: "https://man7.org/linux/man-pages/man2/stat.2.html" } },
      { title: "Keep-alive : plusieurs requêtes sur une connexion", checkpoint: "2 requêtes sur la même connexion TCP répondent toutes les deux", resource: { name: "RFC 9110 § persistance", ref: "https://www.rfc-editor.org/rfc/rfc9110#section-9.3" } },
    ],
    doc: "RFC 9110; man 2 socket/accept/read/write",
  },
  {
    id: "shell",
    title: "Shell minimal : tokenizer, builtins, pipes",
    difficulty: 3,
    stack: ["c", "go"],
    why: "Le shell relie parsing de texte, exécution de processus et I/O — un concentré de ce qu'un système met en œuvre.",
    stages: [
      { title: "Tokenizer : commandes + arguments (guillemets)", checkpoint: "l'entrée echo \"hello world\" produit les bons tokens", resource: { name: "man 7 bash (lexing)", ref: "https://man7.org/linux/man-pages/man7/bash.1.html" } },
      { title: "Builtins (cd, exit, echo) + recherche via PATH", checkpoint: "./sh exécute ls depuis le PATH", resource: { name: "man 3 execvp", ref: "https://man7.org/linux/man-pages/man3/execvp.3.html" } },
      { title: "Pipes : relier deux commandes", checkpoint: "cmd1 | cmd2 envoie la sortie de cmd1 à l'entrée de cmd2", resource: { name: "man 2 pipe", ref: "https://man7.org/linux/man-pages/man2/pipe.2.html" } },
    ],
    doc: "man 7 bash; man 2 pipe; The Linux Programming Interface chap. 44",
  },
  {
    id: "redis",
    title: "Mini-Redis : RESP, SET/GET, persistance",
    difficulty: 4,
    stack: ["javascript", "python", "go", "rust"],
    why: "Un serveur mémoire avec un protocole texte parsé et une persistance : parsing, réseau et format de fichier dans un projet court.",
    stages: [
      { title: "Parseur RESP (commandes, arity)", checkpoint: "un client envoie *3\\r\\n$3\\r\\nSET… et reçoit +OK", resource: { name: "Redis protocol", ref: "https://redis.io/topics/protocol" } },
      { title: "SET/GET + expiration en mémoire", checkpoint: "SET k v puis GET k → v, GET inconnu → $-1", resource: { name: "Redis protocol", ref: "https://redis.io/topics/protocol" } },
      { title: "Persistance append-only", checkpoint: "redémarrer le serveur retrouve les SET écrits", resource: { name: "Redis persistence (AOF)", ref: "https://redis.io/docs/latest/operate/oss_and_stack/management/persistence/" } },
    ],
    doc: "redis.io/topics/protocol",
  },
  {
    id: "grep",
    title: "Moteur regex (grep) : littéral, classes, quantifieurs",
    difficulty: 4,
    stack: ["c", "rust", "javascript"],
    why: "Un moteur regex est un mini-compilateur : parser un pattern, le transformer en machine, l'exécuter sur des lignes.",
    stages: [
      { title: "Matching littéral + . et classes []", checkpoint: "le pattern a.c matche abc", resource: { name: "man 7 regex", ref: "https://man7.org/linux/man-pages/man7/regex.7.html" } },
      { title: "Quantifieurs * + ? et groupes", checkpoint: "a*, b+, c? matchent les bonnes chaînes", resource: { name: "man 7 regex", ref: "https://man7.org/linux/man-pages/man7/regex.7.html" } },
      { title: "Alternance + ancres, recherche par lignes", checkpoint: "grep -E '^(foo|bar)$' trie les lignes du fichier", resource: { name: "man 1 grep", ref: "https://man7.org/linux/man-pages/man1/grep.1.html" } },
    ],
    doc: "man 1 grep; man 7 regex; Russ Cox « Regular Expression Matching Can Be Simple And Fast »",
  },
  {
    id: "git",
    title: "Mini-git : objets, refs, commits",
    difficulty: 5,
    stack: ["c", "javascript", "python", "go"],
    why: "Le format de stockage d'un VCS — objets hash-adressés — est la meilleure leçon de conception de données persistantes.",
    stages: [
      { title: "Objets blob/tree + hash SHA-1", checkpoint: "./sgit cat-file -p <hash> affiche le contenu du blob", resource: { name: "Pro Git chap. 10 (Git Internals)", ref: "https://git-scm.com/book/en/v2/Git-Internals-Git-Objects" } },
      { title: "Refs + index (staging)", checkpoint: "./sgit add puis ./sgit ls-files listent le même fichier", resource: { name: "Pro Git chap. 10", ref: "https://git-scm.com/book/en/v2/Git-Internals-Git-References" } },
      { title: "Commits + graphe + log", checkpoint: "./sgit log affiche le graphe des commits", resource: { name: "Pro Git chap. 10", ref: "https://git-scm.com/book/en/v2/Git-Internals-Git-References" } },
    ],
    doc: "git-scm.com/book (The Git Book)",
  },
  {
    id: "sqlite",
    title: "Petite base : format de fichier, B-tree, SQL simple",
    difficulty: 5,
    stack: ["c", "go"],
    why: "SQLite publie son format de fichier : on construit un vrai moteur de stockage paginé avec index — le cœur de tout CRUD.",
    stages: [
      { title: "Format de fichier : pages, en-têtes", checkpoint: "ouvrir un .db réel et lire l'en-tête de la page 1", resource: { name: "SQLite file format", ref: "https://www.sqlite.org/fileformat2.html" } },
      { title: "B-tree : parcourir les pages d'une table", checkpoint: "lister les enregistrements d'une table via son B-tree", resource: { name: "SQLite file format (B-tree)", ref: "https://www.sqlite.org/fileformat2.html#btree" } },
      { title: "SQL simple : CREATE/INSERT/SELECT", checkpoint: "./db accepte une commande et répond ok", resource: { name: "SQLite language", ref: "https://www.sqlite.org/lang.html" } },
    ],
    doc: "sqlite.org/fileformat2.html; CS:APP chap. 9",
  },
  {
    id: "docker",
    title: "Conteneur minimal : namespaces, cgroups, couches",
    difficulty: 5,
    stack: ["c", "go", "rust"],
    why: "Un « docker » fait maison démystifie l'isolation : namespace, cgroups et overlayfs sont trois pages de man qu'on lit enfin.",
    stages: [
      { title: "Namespace + chroot : isoler un processus", checkpoint: "le processus voit un / différent de l'hôte", resource: { name: "man 7 namespaces", ref: "https://man7.org/linux/man-pages/man7/namespaces.7.html" } },
      { title: "cgroups : plafonner CPU/mémoire", checkpoint: "un processus de test est limité en mémoire", resource: { name: "man 7 cgroups", ref: "https://man7.org/linux/man-pages/man7/cgroups.7.html" } },
      { title: "Couches d'image (overlayfs) : image → container", checkpoint: "un container voit les couches read-only + une couche RW", resource: { name: "man 5 overlayfs", ref: "https://man7.org/linux/man-pages/man5/overlayfs.5.html" } },
    ],
    doc: "man 7 namespaces; man 7 cgroups",
  },
  {
    id: "rest-api",
    title: "API REST avec validation : routes, JSON Schema, erreurs",
    difficulty: 2,
    stack: ["javascript", "typescript"],
    why: "Le pain quotidien du web : méthode + chemin → handler, entrée validée, erreurs propres. On comprend ce qu'un framework comme Fastify automatise — et pourquoi la validation change tout.",
    stages: [
      { title: "Routes : méthode + chemin → handler", checkpoint: "curl -X POST /items répond 201 et crée la ressource", resource: { name: "Fastify routes", ref: "https://fastify.dev/docs/latest/Reference/Routes/" } },
      { title: "Validation d'entrée (JSON Schema)", checkpoint: "POST /items avec un body invalide répond 400 avec les erreurs de schéma", resource: { name: "JSON Schema 2020-12", ref: "https://json-schema.org/draft/2020-12/json-schema-core.html" } },
      { title: "Erreurs propres : 404 structuré, 5xx honnête", checkpoint: "une ressource inconnue répond 404 avec un corps JSON structuré", resource: { name: "Fastify errors", ref: "https://fastify.dev/docs/latest/Reference/Errors/" } },
    ],
    doc: "fastify.dev/docs; json-schema.org; RFC 9110",
  },
  {
    id: "frontend-reactive",
    title: "Mini-framework réactif : rendu, state, diff",
    difficulty: 4,
    stack: ["javascript", "typescript"],
    why: "État → DOM : un mini framework réactif montre ce que Vue/React cachent — réactivité, rendu, et le diff qui évite de tout re-render.",
    stages: [
      { title: "Rendu : state → DOM (vnode)", checkpoint: "changer le state re-rend la vue avec les nouvelles valeurs", resource: { name: "Build your own React", ref: "https://pomb.us/build-your-own-react/" } },
      { title: "Réactivité : effets + subscribers", checkpoint: "muter le state déclenche le rendu, sans re-render manuel", resource: { name: "Vue reactivity in depth", ref: "https://vuejs.org/guide/extras/reactivity-in-depth.html" } },
      { title: "Commit : ne muter que ce qui change", checkpoint: "un seul nœud change → seul ce nœud est touché dans le DOM", resource: { name: "React render & commit", ref: "https://react.dev/learn/render-and-commit" } },
    ],
    doc: "pomb.us; vuejs.org/guide/extras/reactivity-in-depth; react.dev/learn",
  },
  {
    id: "websocket",
    title: "Chat temps réel : serveur WebSocket (RFC 6455)",
    difficulty: 4,
    stack: ["javascript", "typescript", "python", "go"],
    why: "Le passage du HTTP au full-duplex : handshake, trames masquées, fermeture propre. Un serveur WebSocket from scratch relie protocole et web en un projet court.",
    stages: [
      { title: "Handshake : HTTP → 101 (Sec-WebSocket-Key)", checkpoint: "un client ws:// se connecte et reçoit un 101 Switching Protocols", resource: { name: "RFC 6455 §4 (handshake)", ref: "https://www.rfc-editor.org/rfc/rfc6455#section-4" } },
      { title: "Trames : décoder le texte (masquage client)", checkpoint: "le client envoie un message et reçoit son écho", resource: { name: "RFC 6455 §5 (trames)", ref: "https://www.rfc-editor.org/rfc/rfc6455#section-5" } },
      { title: "Broadcast + fermeture propre (close frame)", checkpoint: "le message de l'un des deux clients arrive chez l'autre", resource: { name: "RFC 6455 §7 (close)", ref: "https://www.rfc-editor.org/rfc/rfc6455#section-7" } },
    ],
    doc: "RFC 6455; fastify.dev/docs/latest/Reference/WebSocket",
  },
];

// Fraction des étapes adossées à une ressource (la garantie « assez de
// ressources »). Un projet à 100 % a de quoi citer chaque phase du plan.
function stageCoverage(project, dir) {
  const stages = project.stages || [];
  const backed = stages.filter((stage) => stageResource(stage, dir)).length;
  return stages.length > 0 ? backed / stages.length : 0;
}

// La ressource d'une étape : `{name, ref}` ou une chaîne directe. Contrat de
// **forme + existence**, pas le réseau : un ref `http(s)://` est accepté (on ne
// vérifie pas que l'URL répond — c'est fait plus tard par `docs add` au plan) ;
// un ref non-URL doit être un chemin local qui existe sur disque sous le projet
// (`dir`), sinon l'étape est non sourcée.
function stageResource(stage, dir) {
  let ref = null;

  if (stage) {
    if (typeof stage.resource === "string") {
      ref = stage.resource;
    } else if (stage.resource && typeof stage.resource.ref === "string") {
      ref = stage.resource.ref;
    }
  }

  if (!ref || !ref.trim()) {
    return null;
  }
  ref = ref.trim();

  // URL avec schéma explicite → forme valide. Une URL plausible mais fausse
  // passe ici : le réseau est hors de portée, assumé.
  if (/^https?:\/\//i.test(ref)) {
    return ref;
  }

  // Ref locale → doit exister sur disque sous le projet, sinon on ne peut pas
  // la vérifier et l'étape est non sourcée. Un chemin absolu est rejeté (hors
  // du projet), comme un `../` qui en sortirait.
  if (dir) {
    const rel = path.normalize(ref);
    if (!path.isAbsolute(rel) && !rel.startsWith("..") && fs.existsSync(path.resolve(dir, rel))) {
      return ref;
    }
  }

  return null;
}

// Valide un projet inventé (par l'IA ou l'apprenant). Retourne
// `{ ok, missing: [{ stage, reason }] }`. Un projet sans étapes, ou avec une
// étape sans ressource vérifiable (URL http(s) ou chemin local existant), est
// refusé : on ne construit pas un plan d'apprentissage sur du non sourcé.
function validateProject(project, dir) {
  const missing = [];
  const stages = Array.isArray(project && project.stages) ? project.stages : [];

  if (stages.length === 0) {
    missing.push({ stage: "(projet)", reason: "aucune étape — un plan d'apprentissage a besoin d'étapes" });
  }

  for (const stage of stages) {
    if (!stageResource(stage, dir)) {
      missing.push({
        stage: (stage && stage.title) || "(étape sans titre)",
        reason: "aucune ressource vérifiable — il faut une URL http(s) ou un chemin local qui existe (RFC, man, livre, docs/sources/…)",
      });
    }
  }

  return { ok: missing.length === 0, missing };
}

function printProposals(projects, dir) {
  if (projects.length === 0) {
    return;
  }

  projects.forEach((project, index) => {
    log(`  ${index + 1}. ${project.title}   — niveau ${project.difficulty}`);
    log(`     Pourquoi : ${project.why}`);
    log("     Étapes (chacune adossée à une ressource vérifiable) :");

    for (const stage of project.stages) {
      log(`       • ${stage.title}`);
      log(`           checkpoint : ${stage.checkpoint}`);
      log(`           ressource  : ${stageResource(stage, dir)}`);
    }

    log(`     Doc   : ${project.doc}`);
  });
}

function proposeCommand({ dir, stack = null, level = null, limit = 5 }) {
  const filtered = PROJECTS.filter(
    (project) =>
      (stack ? project.stack === null || project.stack.includes(stack) : true) &&
      (level ? project.difficulty === level : true),
  );

  // Seuls les projets à 100 % couverts passent : une étape sans ressource
  // ne peut pas produire de plan sourcé.
  const complete = filtered.filter((project) => stageCoverage(project, dir) === 1);

  complete.sort((a, b) => a.difficulty - b.difficulty || (a.id < b.id ? -1 : 1));
  const picked = complete.slice(0, limit);

  log("Projets à construire : un vrai artefact, un format précis, des étapes vérifiables.");

  if (picked.length === 0) {
    log("  (aucun projet ne correspond à ces critères)");
  } else {
    printProposals(picked, dir);
  }

  log("");
  log("Chaque étape est adossée à une ressource vérifiable — de quoi bâtir le plan sans rien inventer.");

  writeJson(path.join(dir, ".ai-learn", "proposals.json"), {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    dir: path.resolve(dir),
    filter: { stack, level, limit },
    projects: picked,
  });

  log(`Rapport écrit : .ai-learn/proposals.json`);
}

// `ai-learn propose --validate <file.json>` — refuse un projet inventé dont une
// étape n'a pas de ressource vérifiable (forme + existence locale, pas le réseau).
function validateCommand({ file, dir }) {
  let project;

  try {
    project = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (error) {
    fail(`cannot read --validate file: ${error.message}`);
  }

  const result = validateProject(project, dir);

  if (result.ok) {
    log(`✓ Projet valide : ${project.stages.length} étape(s), chacune adossée à une ressource (URL http(s) ou chemin local existant).`);
    log("  Le réseau n'est pas confirmé ici — le vrai contrôle se fera au plan : `ai-learn docs add` pour chaque ressource.");
    log("  L'IA peut maintenant en faire un plan : phases réelles + docs add pour chaque ressource.");
    return;
  }

  for (const issue of result.missing) {
    log(`  ✗ ${issue.stage} : ${issue.reason}`);
  }

  log("");
  log("✗ propose FAILED — étapes sans ressource vérifiable. On ne construit pas un plan sur du non sourcé.");
  log("  Remplace chaque ressource manquante par une vraie référence (URL, RFC, man, livre, docs/sources/…) ou retire l'étape.");
  process.exitCode = 1;
}

module.exports = {
  PROJECTS,
  stageCoverage,
  stageResource,
  validateProject,
  proposeCommand,
  validateCommand,
};
