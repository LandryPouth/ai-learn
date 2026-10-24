# Plan — Story 04.03

## Implementation Context

Fichiers probables :

- bin/lib/verify.js (`verifyCommand`)
- bin/lib/args.js
- bin/ai-learn.js (dispatch `verify`)
- bin/lib/next.js (message)
- test/verify.test.js

Ancres de recherche : `verifyCommand`, `phaseVerdict`, `computeSourceHash`, `parseArgs`

Mode d'exécution : `STANDARD`

Scout pre-step : `no` — les points d'intégration sont nommés ci-dessus.

À éviter sauf nécessité : bin/lib/progress.js (états inchangés), bin/lib/mutate.js

## Decisions

- Décidé : `--stale` itère sur `verifyCommand` existant — aucune seconde implémentation de la preuve, donc aucune divergence entre `verify <id>` et `verify --stale`. La seule écriture de statut reste `setPhaseStatus` appelée depuis `verifyCommand`, jamais depuis `staleCommand`.
- Décidé : l'ordre d'exécution suit l'ordre des phases ; on ne s'arrête pas à la première régression, on les liste toutes (c'est l'information que l'apprenant cherche). `failureDetail` cite la dernière ligne du checkpoint en échec, ou la porte non-commande qui a bloqué (norme, artefacts, prédictions, mutation).

## Test Plan

- [ ] Intégration avec un projet temporaire : une phase qui reste verte, une qui casse.
- [ ] Unit : classement du résumé.

## Acceptance Traceability

| Acceptance criterion | Test proving it |
| --- | --- |
| Given deux phases périmées dont le checkpoint passe encore, when `verify --stale` tourne, then les deux sont re-prouvées (nouvelle évidence, `sourceHash` à jour) et le résumé les classe « toujours vert ». | `test/verify.test.js::verify --stale re-proves every stale phase that still passes and lists them as toujours vert` |
| Given une phase périmée dont le checkpoint échoue (contrat d'URL changé par une phase ultérieure), when `verify --stale` tourne, then elle est classée « régression », reste non prouvée, exit 1, et le message cite l'échec réel. | `test/verify.test.js::verify --stale classifies a failing checkpoint as a regression, cites the failure and leaves it unproven` |
| Given `verify --stale` sans phase périmée, when il tourne, then il l'indique et sort en 0 sans rien écrire. | `test/verify.test.js::verify --stale without a stale phase says so, exits 0 and writes nothing` |
| Given une re-preuve réussie, when elle se termine, then `verify` reste le seul appelant de `setPhaseStatus` (aucun `done` écrit en douce). | `test/verify.test.js::verify --stale leaves status writes to verify: a re-proof is marked applied by the normal path` |
| Given `next`/`status`, when des phases sont périmées, then ils suggèrent `ai-learn verify --stale` plutôt qu'un `verify <id>` par phase. | `test/next.test.js::with several stale phases, next names the never-started phase and warns for each stale one` · `test/status.test.js::status's stale label names the bulk verify command to re-prove stale phases` |

## Commands

- Command: `npm test`
  - Expected: la suite complète passe.

## Rollback

Revert du commit de la story ; aucune migration de données hors champs additifs.
