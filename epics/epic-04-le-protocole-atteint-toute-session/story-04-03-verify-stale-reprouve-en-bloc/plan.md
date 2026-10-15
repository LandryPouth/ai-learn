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

- Décision à prendre : `--stale` itère sur `verifyCommand` existant — aucune seconde implémentation de la preuve, donc aucune divergence entre `verify <id>` et `verify --stale`.
- Décision à prendre : l'ordre d'exécution suit l'ordre des phases ; on ne s'arrête pas à la première régression, on les liste toutes (c'est l'information que l'apprenant cherche).

## Test Plan

- [ ] Intégration avec un projet temporaire : une phase qui reste verte, une qui casse.
- [ ] Unit : classement du résumé.

## Acceptance Traceability

| Acceptance criterion | Test proving it |
| --- | --- |
| Given deux phases périmées dont le checkpoint passe encore, when `veri… | `Intégration avec un projet temporaire : une phase qui reste ` (à nommer `file::test` au `/flow-run`) |
| Given une phase périmée dont le checkpoint échoue (contrat d'URL chang… | `Unit : classement du résumé.` (à nommer `file::test` au `/flow-run`) |
| Given `verify --stale` sans phase périmée, when il tourne, then il l'i… | `Unit : classement du résumé.` (à nommer `file::test` au `/flow-run`) |
| Given une re-preuve réussie, when elle se termine, then `verify` reste… | `Unit : classement du résumé.` (à nommer `file::test` au `/flow-run`) |
| Given `next`/`status`, when des phases sont périmées, then ils suggère… | `Unit : classement du résumé.` (à nommer `file::test` au `/flow-run`) |

## Commands

- Command: `npm test`
  - Expected: la suite complète passe.

## Rollback

Revert du commit de la story ; aucune migration de données hors champs additifs.
