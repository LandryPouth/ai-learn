# Plan — Story 06.01

## Implementation Context

Fichiers probables :

- bin/lib/docs.js (`MAX_SOURCES`, ≈344, 547, 559)
- bin/lib/traps.js (filtre uniquement)
- test/docs.test.js
- test/traps.test.js

Ancres de recherche : `MAX_SOURCES`, `stripDir`, `preset`

Mode d'exécution : `STANDARD`

Scout pre-step : `no` — les points d'intégration sont nommés ci-dessus.

À éviter sauf nécessité : bin/lib/scan.js, propose.js

## Decisions

- Décision à prendre : une source porte `kind: "primary"|"secondary"` (défaut `primary` pour les anciens manifestes — aucune migration).

## Test Plan

- [x] Unit : plafond, listing, exclusion des pièges.
- [x] Régression : manifeste ancien sans `kind`.

## Acceptance Traceability

| Acceptance criterion | Test proving it |
| --- | --- |
| Given trois sources principales, when `docs add --secondary docker <ur… | `test/docs.test.js::add --secondary embeds a source outside the primary quota and lists it separately` |
| Given le plafond atteint, when `docs add <nom>` sans `--secondary` tou… | `test/docs.test.js::add enforces the max number of sources` |
| Given une source secondaire, when `ai-learn traps` tourne, then elle n… | `test/traps.test.js::regenerateTraps ignores secondary sources` |
| Given une source secondaire, when `docs digest` (story 02) ou une cita… | `test/docs.test.js::docSourceList defaults kind to primary and keeps secondary sources citable` |
| Given `docs add --secondary` sans nom ou source, when il tourne, then … | `test/docs.test.js::docs add --secondary without a name or source fails with usage and writes nothing` |

## Commands

- Command: `npm test`
  - Expected: la suite complète passe.

## Rollback

Revert du commit de la story ; aucune migration de données hors champs additifs.
