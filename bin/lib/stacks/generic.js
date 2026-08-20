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

module.exports = { concepts, directions, recipes };
