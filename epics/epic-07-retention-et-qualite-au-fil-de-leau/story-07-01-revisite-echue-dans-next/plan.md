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

- Décision : `lastProvenAt` est **dérivé de l'évidence** plutôt que stocké à la main — une seule source de vérité, conforme à « la preuve prime sur la déclaration ». `verify` l'estampille dans l'évidence (même instant que `generatedAt`) uniquement quand le run passe ; `next` le lit via `progress.lastProvenAt`, avec repli sur `generatedAt` pour les évidences antérieures.

## Test Plan

- [x] Unit : calcul d'échéance (frontières de jours).
- [x] Intégration : `verify` puis `next` avec horloge injectée.

## Acceptance Traceability

| Acceptance criterion | Test proving it |
| --- | --- |
| Given une phase `done` prouvée il y a plus de `reviewAfterDays` jours,… | `test/next.test.js::next proposes an overdue revisit after the normal suite, with an injected clock` (frontières : `test/verdict.test.js::revisitState: …`) |
| Given une phase sans `reviewAfterDays` ni `lastProvenAt`, when `next` … | `test/next.test.js::next leaves a phase without reviewAfterDays unchanged, however old its proof (backward-compatible)` |
| Given `verify` réussi, when la phase est marquée `done`, then `lastPro… | `test/verify.test.js::verify runs a passing checkpoint, records evidence, marks the phase done` |
| Given `next --json`, when une revisite est échue, then `revisit: [ids]… | `test/next.test.js::next --json exposes overdue revisit ids separately from next` |
| Given `reviewAfterDays` invalide, when `validateProgress` tourne, then… | `test/verdict.test.js::validateProgress: an invalid reviewAfterDays is an explicit error` |

## Commands

- Command: `npm test`
  - Expected: la suite complète passe.

## Rollback

Revert du commit de la story ; aucune migration de données hors champs additifs.
