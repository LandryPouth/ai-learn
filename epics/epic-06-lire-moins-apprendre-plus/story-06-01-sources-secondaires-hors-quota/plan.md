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

- [ ] Unit : plafond, listing, exclusion des pièges.
- [ ] Régression : manifeste ancien sans `kind`.

## Acceptance Traceability

| Acceptance criterion | Test proving it |
| --- | --- |
| Given trois sources principales, when `docs add --secondary docker <ur… | `Unit : plafond, listing, exclusion des pièges.` (à nommer `file::test` au `/flow-run`) |
| Given le plafond atteint, when `docs add <nom>` sans `--secondary` tou… | `Régression : manifeste ancien sans `kind`.` (à nommer `file::test` au `/flow-run`) |
| Given une source secondaire, when `ai-learn traps` tourne, then elle n… | `Régression : manifeste ancien sans `kind`.` (à nommer `file::test` au `/flow-run`) |
| Given une source secondaire, when `docs digest` (story 02) ou une cita… | `Régression : manifeste ancien sans `kind`.` (à nommer `file::test` au `/flow-run`) |
| Given `docs add --secondary` sans nom ou source, when il tourne, then … | `Régression : manifeste ancien sans `kind`.` (à nommer `file::test` au `/flow-run`) |

## Commands

- Command: `npm test`
  - Expected: la suite complète passe.

## Rollback

Revert du commit de la story ; aucune migration de données hors champs additifs.
