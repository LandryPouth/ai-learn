# Story 05.05 — Profil de tuteur et preuve de transfert

## Goal

`.ai-learn/tutor.json` déclare le niveau d'assistance (`libre|indices|strict`) et la preuve exigée pour débloquer une phase (`tests|explication|transfert`) ; le type de prédiction `transfert` (exercice inédit, posé après la brique) est compté par `verify` comme les autres types. L'outil distingue enfin « étape techniquement terminée » de « compétence réutilisable sans guide ».

## Risk

Nouveau champ de config et section d'évidence : additifs, rétro-compatibles (absence de `tutor.json` = comportement actuel).

## Acceptance Criteria

- [ ] Given `ai-learn init`, when il scaffolde, then `.ai-learn/tutor.json` existe avec un défaut explicite (`assistance: "indices"`, `proof: "explication"`) et jamais réécrit ensuite.
- [ ] Given `proof: "transfert"` et aucune prédiction de type `transfert` pour la phase, when `verify` tourne, then la phase n'est pas marquée `done` et le message nomme le type manquant.
- [ ] Given `proof: "tests"`, when `verify` tourne, then le comportement actuel est inchangé (non-régression).
- [ ] Given `AGENTS-apprentissage.md`, when on le lit, then un paragraphe décrit les trois niveaux d'assistance (libre, indices progressifs : indice → question → pseudo-code → solution, strict) et que l'IA lit `.ai-learn/tutor.json` avant chaque réponse.
- [ ] Given `ai-learn status`, when il tourne, then le profil actif est affiché sur une ligne ; given une valeur inconnue dans `tutor.json`, when `check` tourne, then erreur explicite.
- [ ] Given l'évidence, when `verify` réussit, then elle enregistre séparément `proof.tests: true` et `proof.mastery: <niveau atteint>` — deux preuves distinctes, jamais fusionnées.

## Edge Cases

- [ ] Aucun cas limite propre à cette story au-delà des critères.

## Out of Scope

- [ ] bin/lib/guard.js
- [ ] bin/lib/mutate.js
