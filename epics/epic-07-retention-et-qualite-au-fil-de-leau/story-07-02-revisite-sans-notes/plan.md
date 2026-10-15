# Plan — Story 07.02

## Implementation Context

Fichiers probables :

- bin/lib/verify.js
- bin/lib/check.js
- templates/AGENTS-apprentissage.md (§6 ou 5bis)
- test/verify.test.js
- test/check.test.js

Ancres de recherche : `verifyCommand`, `noMark`

Mode d'exécution : `STANDARD`

Scout pre-step : `no` — les points d'intégration sont nommés ci-dessus.

À éviter sauf nécessité : bin/lib/mutate.js

## Decisions

- Décision à prendre : l'échec d'une revisite ne rétrograde pas la phase — il rend l'oubli visible, il ne réécrit pas l'histoire ; la décision de re-travailler appartient à l'apprenant.
- Décision à prendre : réutiliser `noMark` (mécanisme existant) — aucun nouvel appelant de `setPhaseStatus`.

## Test Plan

- [ ] Intégration : revisite verte, revisite rouge, non-régression de l'état.
- [ ] Unit : warning `check`.

## Acceptance Traceability

| Acceptance criterion | Test proving it |
| --- | --- |
| Given une phase `done`, when `verify <id> --revisit` réussit, then l'é… | `Intégration : revisite verte, revisite rouge, non-régression` (à nommer `file::test` au `/flow-run`) |
| Given `--revisit` sur une phase non `done`, when il tourne, then erreu… | `Unit : warning `check`.` (à nommer `file::test` au `/flow-run`) |
| Given `AGENTS-apprentissage.md`, when on lit le nouveau paragraphe de … | `Unit : warning `check`.` (à nommer `file::test` au `/flow-run`) |
| Given `check`, when une phase `done` dépasse `reviewAfterDays` sans re… | `Unit : warning `check`.` (à nommer `file::test` au `/flow-run`) |
| Given un échec de revisite, when `verify --revisit` échoue, then la ph… | `Unit : warning `check`.` (à nommer `file::test` au `/flow-run`) |

## Commands

- Command: `npm test`
  - Expected: la suite complète passe.

## Rollback

Revert du commit de la story ; aucune migration de données hors champs additifs.
