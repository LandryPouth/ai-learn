# Plan — Story 03.04

## Implementation Context

Fichiers probables :

- bin/lib/check.js (`mutationReport` d'audit de la story 02-04)
- bin/lib/status.js
- test/check.test.js

Ancres de recherche : `mutationSummary`, `evidence.mutation`

Mode d'exécution : `STANDARD`

Scout pre-step : `no` — les points d'intégration sont nommés ci-dessus.

À éviter sauf nécessité : bin/lib/mutate.js, bin/lib/tracks/tests.js

## Decisions

- Décision à prendre : consommer `evidence.mutation` déjà écrite — aucune seconde exécution de mutation dans `check`.

## Test Plan

- [ ] Intégration : matrice {mode} × {killed 0, ≥1, non requis}.

## Acceptance Traceability

| Acceptance criterion | Test proving it |
| --- | --- |
| Given le mode dirigeant et une phase `done` dont l'évidence `mutation.… | `Intégration : matrice {mode} × {killed 0, ≥1, non requis}.` (à nommer `file::test` au `/flow-run`) |
| Given le mode dirigeant et une phase `done` avec `mutation.killed === … | `Intégration : matrice {mode} × {killed 0, ≥1, non requis}.` (à nommer `file::test` au `/flow-run`) |
| Given le mode apprenti, when `check` tourne, then ce contrôle est abse… | `Intégration : matrice {mode} × {killed 0, ≥1, non requis}.` (à nommer `file::test` au `/flow-run`) |
| Given les revues (story 03), when `check` tourne en dirigeant, then le… | `Intégration : matrice {mode} × {killed 0, ≥1, non requis}.` (à nommer `file::test` au `/flow-run`) |
| Given `check --json`, when il tourne en dirigeant, then les deux verdi… | `Intégration : matrice {mode} × {killed 0, ≥1, non requis}.` (à nommer `file::test` au `/flow-run`) |

## Commands

- Command: `npm test`
  - Expected: la suite complète passe.

## Rollback

Revert du commit de la story ; aucune migration de données hors champs additifs.
