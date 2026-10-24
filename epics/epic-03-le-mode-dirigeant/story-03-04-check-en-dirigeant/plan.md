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

- Décision : consommer `evidence.mutation` déjà écrite — aucune seconde exécution de mutation dans `check`. Un recalcul par mutant casserait le contrat rapide/lecture seule de `check` que la story 02.04 a explicitement préservé. Conséquence : le tier ne prouve que ce que le dernier `verify` a mesuré ; une évidence `required: false` prouve zéro et est donc refusée.
- Décision : les deux verdicts (`--json`) restent des entrées distinctes de `errorList`, pas un nouveau champ structuré. Le contrat JSON de la story 01.05 est `version: 1` + listes d'issues ; les revues et la mutation tuée sont deux issues séparées, chacune nommant sa phase. Un champ dédié dupliquerait la même information et figerait un schéma prématuré.
- Décision : le message de la mutation utilise « yet » (et non « in dirigeant mode but ») pour rester filtrable indépendamment du tier revue, dont les tests existants s'appuient sur ce libellé.
- Décision : une phase `done` sans évidence passante n'ajoute pas l'erreur mutation — l'erreur « marked done but has no passing evidence » couvre déjà le cas et suffit à bloquer.

## Test Plan

- [x] Intégration : matrice {mode} × {killed 0, ≥1, non requis}.

## Acceptance Traceability

| Acceptance criterion | Test proving it |
| --- | --- |
| Given le mode dirigeant et une phase `done` dont l'évidence `mutation.killed >= 1`, when `check` tourne, then la phase est acceptée. | `test/check.test.js::dirigeant: a done phase whose evidence kills at least one mutant passes the mutation tier` |
| Given le mode dirigeant et une phase `done` avec `mutation.killed === 0` (ou `required: false`), when `check` tourne, then erreur nommant la phase. | `test/check.test.js::dirigeant: a done phase with zero killed mutants is an error naming the phase` et `test/check.test.js::dirigeant: a done phase whose mutation was never required is an error` |
| Given le mode apprenti, when `check` tourne, then ce contrôle est absent (non-régression). | `test/check.test.js::apprenti never requires the mutation-killer tier (non-regression)` |
| Given les revues (story 03), when `check` tourne en dirigeant, then les deux contrôles sont rapportés séparément. | `test/check.test.js::dirigeant: the review and mutation tiers are reported as separate errors` |
| Given `check --json`, when il tourne en dirigeant, then les deux verdicts sont exposés. | `test/check.test.js::check --json exposes both dirigeant verdicts as distinct entries` |

## Commands

- Command: `npm test`
  - Expected: la suite complète passe.

## Rollback

Revert du commit de la story ; aucune migration de données hors champs additifs.
