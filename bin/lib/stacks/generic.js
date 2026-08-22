"use strict";

// Fallback pack for any language without a dedicated stack pack (Python, Go,
// Rust, C#, or anything else `detectStack` recognizes). No concept bank —
// there's no verified marker set for that language yet, and inventing one
// without real validation would be exactly the kind of fabricated content
// this tool refuses to produce elsewhere (see check.js's provenance rules).
// The level estimate falls back to structural signals only, and these five
// directions are the only ones offered: generic enough to apply to any
// codebase, citing no language- or framework-specific doc.

const concepts = [];

const directions = [
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
    // Promoted from suggestion to mandatory once a real file crosses this
    // threshold — the clean-code/architecture seuil obligatoire (Partie D):
    // suggestDirections() checks this against per-file `loc` (see
    // walkSources in scan.js) and surfaces the direction first, marked
    // `mandatory: true`, instead of leaving it optional forever.
    mandatoryAt: { metric: "locInFile", gt: 300 },
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
];

const recipes = [];

// The fallback "10x" bank for any untracked language — domain-agnostic
// stress dimensions that apply to almost any codebase, mirroring the
// generic directions above. `requires: []` + `deepens: "__generic__"`
// (never a real concept id, see the directions above) means these are never
// filtered out as "already mastered" — the non-regression rule only ever
// promotes strictly deeper stresses as `maxUsedTier` climbs.
const stresses = [
  {
    id: "g-input-size",
    title: "10x la taille d'entrée",
    why: "Le code marche sur un cas normal — un fichier ou un payload 10x plus gros révèle souvent une hypothèse implicite (tout tient en mémoire, complexité quadratique…).",
    anchor: "code existant",
    tier: 3,
    deepens: "__generic__",
    requires: [],
    stressCheckpoint: "rejouer le même scénario avec une entrée 10x plus grosse — mesurer si ça casse ou ralentit de façon disproportionnée",
    doc: "profiler de la stack + mesure avant optimisation",
  },
  {
    id: "g-malformed-input",
    title: "Entrée malformée / adversariale",
    why: "Le chemin heureux passe — une entrée tronquée, mal encodée ou délibérément invalide teste si le code suppose une entrée propre.",
    anchor: "code existant (parsing/validation)",
    tier: 3,
    deepens: "__generic__",
    requires: [],
    stressCheckpoint: "rejouer avec une entrée tronquée ou mal formée — observer un crash, une exception non gérée, ou un comportement silencieusement faux",
    doc: "tests de robustesse / fuzzing basique de la stack",
  },
  {
    id: "g-concurrent-invocation",
    title: "Invocation concurrente",
    why: "Le code marche appelé une fois — deux invocations simultanées révèlent souvent un état partagé non protégé.",
    anchor: "code existant",
    tier: 4,
    deepens: "__generic__",
    requires: [],
    stressCheckpoint: "lancer N invocations concurrentes du même chemin — chercher une race condition ou une corruption d'état",
    doc: "notes de la stack sur la concurrence (threads/async/process)",
  },
];

module.exports = { concepts, directions, recipes, stresses };
