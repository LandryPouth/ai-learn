# Plan — Story 07.01

## Implementation Context

Fichiers probables :

- bin/lib/progress.js
- bin/lib/next.js
- bin/lib/verify.js (écriture de `lastProvenAt`)
- test/next.test.js
- test/progress via verdict.test.js

Ancres de recherche : `phaseVerdict`, `setPhaseStatus`, `findEvidence`

Mode d'exécution : `STANDARD`

Scout pre-step : `no` — les points d'intégration sont nommés ci-dessus.

À éviter sauf nécessité : bin/lib/check.js (story 02)

## Decisions

- Décision à prendre : `lastProvenAt` est **dérivé de l'évidence** (horodatage du fichier) plutôt que stocké à la main — une seule source de vérité, conforme à « la preuve prime sur la déclaration ».

## Test Plan

- [ ] Unit : calcul d'échéance (frontières de jours).
- [ ] Intégration : `verify` puis `next` avec horloge injectée.

## Acceptance Traceability

| Acceptance criterion | Test proving it |
| --- | --- |
| Given une phase `done` prouvée il y a plus de `reviewAfterDays` jours,… | `Unit : calcul d'échéance (frontières de jours).` (à nommer `file::test` au `/flow-run`) |
| Given une phase sans `reviewAfterDays` ni `lastProvenAt`, when `next` … | `Intégration : `verify` puis `next` avec horloge injectée.` (à nommer `file::test` au `/flow-run`) |
| Given `verify` réussi, when la phase est marquée `done`, then `lastPro… | `Intégration : `verify` puis `next` avec horloge injectée.` (à nommer `file::test` au `/flow-run`) |
| Given `next --json`, when une revisite est échue, then `revisit: [ids]… | `Intégration : `verify` puis `next` avec horloge injectée.` (à nommer `file::test` au `/flow-run`) |
| Given `reviewAfterDays` invalide, when `validateProgress` tourne, then… | `Intégration : `verify` puis `next` avec horloge injectée.` (à nommer `file::test` au `/flow-run`) |

## Commands

- Command: `npm test`
  - Expected: la suite complète passe.

## Rollback

Revert du commit de la story ; aucune migration de données hors champs additifs.
