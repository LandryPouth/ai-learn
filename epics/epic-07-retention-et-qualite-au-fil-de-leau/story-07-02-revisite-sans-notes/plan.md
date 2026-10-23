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

- Décision : l'échec d'une revisite ne rétrograde pas la phase — il rend l'oubli visible, il ne réécrit pas l'histoire ; la décision de re-travailler appartient à l'apprenant. `lastProvenAt` reste celui de la dernière preuve verte (l'évidence rouge porte `lastProvenAt: null`).
- Décision : réutiliser le mécanisme existant « ne pas écrire le ledger » — `marking: skipped` pour une revisite, et aucun nouvel appelant de `setPhaseStatus` (les deux seuls sites restent la promotion et la rétrogradation du chemin normal).

## Test Plan

- [x] Intégration : revisite verte, revisite rouge, non-régression de l'état.
- [x] Unit : warning `check`.

## Acceptance Traceability

| Acceptance criterion | Test proving it |
| --- | --- |
| Given une phase `done`, when `verify <id> --revisit` réussit, then l'é… | `test/verify.test.js::verify --revisit refreshes lastProvenAt, records revisit: true, and keeps the phase done` |
| Given `--revisit` sur une phase non `done`, when il tourne, then erreu… | `test/verify.test.js::verify --revisit on a phase that is not done is a clear usage error and writes nothing` |
| Given `AGENTS-apprentissage.md`, when on lit le nouveau paragraphe de … | `templates/AGENTS-apprentissage.md` § 5bis (contenu éditorial, non exécutable) |
| Given `check`, when une phase `done` dépasse `reviewAfterDays` sans re… | `test/check.test.js::check warns (never errors) when a proven phase is past its revisit delay, naming it` |
| Given un échec de revisite, when `verify --revisit` échoue, then la ph… | `test/verify.test.js::a failed revisit keeps the phase done but traces the failure in the evidence` |

## Commands

- Command: `npm test`
  - Expected: la suite complète passe.

## Rollback

Revert du commit de la story ; aucune migration de données hors champs additifs.
