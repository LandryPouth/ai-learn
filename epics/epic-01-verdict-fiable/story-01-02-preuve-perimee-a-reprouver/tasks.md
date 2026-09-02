# Tasks — Story 01.02

## Pre-Implementation

- [ ] Lire `plan.md` (Implementation Context)
- [ ] Relire le `## Result` de la story 01.01 (forme exacte de l'empreinte écrite)
- [ ] Vérifier que `setPhaseStatus` n'a toujours qu'un seul appelant

## Implementation Tasks

- [ ] Étendre l'empreinte pour porter le digest par fichier (le digest global reste
      la comparaison rapide)
- [ ] Ajouter la rétrogradation `done → in_progress` sur échec dans `verify`,
      neutralisée par `--no-mark`
- [ ] Ajouter `marking: "applied" | "skipped"` à l'évidence
- [ ] Faire ignorer par `check` la dérive « evidence sans done » quand
      `marking === "skipped"`
- [ ] Enrichir le message de péremption avec les fichiers changés et leur nombre
- [ ] Faire proposer par `next` une phase périmée avant la première `pending`

## Testing Tasks

- [ ] Étendre `test/verify.test.js` (6 cas)
- [ ] Étendre `test/check.test.js` (6 cas)
- [ ] Étendre `test/next.test.js` (3 cas)
- [ ] Vérifier explicitement qu'une rétrogradation ne touche aucun ledger home-scoped

## Validation Tasks

- [ ] `npm test`
- [ ] `node bin/ai-learn.js check --root .`
- [ ] Essai manuel : prouver → modifier → re-verify → constater la rétrogradation

## Result

_Rempli après exécution : résumé, fichiers modifiés, tests exécutés._

### Rollback Notes

-
