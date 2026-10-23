# Tasks — Story 03.04

## Status: done

## Pre-Implementation

- [x] Lire `plan.md`, `RULES.md`, et les fichiers « probables » ci-dessus
- [x] Rejouer le comportement actuel sur un projet temporaire (état de départ)

## Implementation Tasks

- [x] Implémenter le plus petit changement qui satisfait les critères, dans l'ordre du plan
- [x] Trancher chaque « Décision à prendre » dans `plan.md` avant d'écrire le code concerné

## Testing Tasks

- [x] Écrire les tests du Test Plan (rouge d'abord pour toute logique de décision)
- [x] Remplir la table `Acceptance Traceability` avec les vrais `file::test`

## Validation Tasks

- [x] `npm test`
- [x] `ai-flow verify --story <dir>`

## Result

### Summary

`check` en mode `dirigeant` exige désormais qu'une phase `done` prouve au moins
un mutant tué par le test de l'apprenant. Le contrôle lit `evidence.mutation`
écrit par `verify` (aucun recalcul de mutation) ; `killed === 0` et
`required: false` sont refusés, avec un message nommant la phase. Le tier est
rapporté séparément du tier revue (story 03.03) et les deux verdicts sortent
comme entrées distinctes de `check --json`.

### Files Changed

- `bin/lib/check.js` — `checkMutationKilled`, appelé dans la branche dirigeant.
- `test/check.test.js` — fixture `dirigeantMutationProject` + 6 tests (killed ≥1,
  killed 0, required false, apprenti, deux tiers séparés, JSON).
- `epics/.../story-03-04-check-en-dirigeant/{spec,plan,tasks}.md` — critères,
  décisions, traçabilité, résultat.

### Tests Run

- `node --test test/check.test.js` — 82/82 pass.
- `npm test` — 620/620 pass.

### Issues

Aucun.

### Follow-ups

Aucun.

### Remaining Risks

- Le tier fait confiance à la dernière évidence passante : si un `verify` ancien a
  mesuré la mutation avant un changement de code, la péremption `sourceHash`
  existante (epic 01) bloque déjà la phase avant ce contrôle.
- Une phase sans site mutable (`killed: 0`, `score: null`) est refusée en
  dirigeant, conformément au critère 2 : l'apprenant doit écrire un test qui tue
  au moins un mutant.

### Rollback Notes

Revert du commit de la story. Aucune migration de données : le contrôle ne fait
que lire `evidence.mutation` et `guard.json`.
