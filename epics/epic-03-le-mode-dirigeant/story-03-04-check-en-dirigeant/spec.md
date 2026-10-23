# Story 03.04 — `check` en dirigeant : un test qui tue un mutant

## Goal

En mode dirigeant, `check` signale en erreur une phase `done` dont aucun test écrit par l'apprenant ne tue au moins un mutant — la spécification est la seule contribution de l'apprenant, elle doit être prouvée.

## Risk

Consolide s2 et s3.

## Acceptance Criteria

- [x] Given le mode dirigeant et une phase `done` dont l'évidence `mutation.killed >= 1`, when `check` tourne, then la phase est acceptée.
- [x] Given le mode dirigeant et une phase `done` avec `mutation.killed === 0` (ou `required: false`), when `check` tourne, then erreur nommant la phase.
- [x] Given le mode apprenti, when `check` tourne, then ce contrôle est absent (non-régression).
- [x] Given les revues (story 03), when `check` tourne en dirigeant, then les deux contrôles sont rapportés séparément.
- [x] Given `check --json`, when il tourne en dirigeant, then les deux verdicts sont exposés.

## Edge Cases

- [x] Aucun cas limite propre à cette story au-delà des critères.

## Out of Scope

- [x] bin/lib/mutate.js
- [x] bin/lib/tracks/tests.js
