# Plan — Story 03.03

## Implementation Context

Fichiers probables :

- bin/lib/check.js (`citesRealPRUrl`)
- bin/lib/status.js
- templates/ (modèle de revue)
- test/check.test.js

Ancres de recherche : `citesRealPRUrl`

Mode d'exécution : `STANDARD`

Scout pre-step : `no` — les points d'intégration sont nommés ci-dessus.

À éviter sauf nécessité : bin/lib/guard.js

## Decisions

- Décision à prendre : règle des trois — `citesRealPRUrl` + cette vérification = deux usages ; n'extraire un noyau commun que s'il est réellement le même concept (citation vérifiable).

## Test Plan

- [ ] Unit : citation valide/ligne inexistante/absente.
- [ ] Intégration : `check` en dirigeant.

## Acceptance Traceability

| Acceptance criterion | Test proving it |
| --- | --- |
| Given `docs/reviews/<brique>.md` citant `src/x.ts:12` existant et une … | `Unit : citation valide/ligne inexistante/absente.` (à nommer `file::test` au `/flow-run`) |
| Given une revue sans citation, ou citant une ligne inexistante, when `… | `Intégration : `check` en dirigeant.` (à nommer `file::test` au `/flow-run`) |
| Given le mode `apprenti`, when `check` tourne, then les revues ne sont… | `Intégration : `check` en dirigeant.` (à nommer `file::test` au `/flow-run`) |
| Given `ai-learn status`, when des revues manquent en dirigeant, then l… | `Intégration : `check` en dirigeant.` (à nommer `file::test` au `/flow-run`) |
| Given la primitive de vérification, when on lit le code, then elle réu… | `Intégration : `check` en dirigeant.` (à nommer `file::test` au `/flow-run`) |

## Commands

- Command: `npm test`
  - Expected: la suite complète passe.

## Rollback

Revert du commit de la story ; aucune migration de données hors champs additifs.
