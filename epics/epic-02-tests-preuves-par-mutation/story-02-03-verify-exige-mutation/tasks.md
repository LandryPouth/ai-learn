# Tasks — Story 02.03

## Pre-Implementation

- [ ] Lire `plan.md` et le `## Result` de story-02-02 (moteur/config à réutiliser)
- [ ] Relire `bin/lib/predictions.js#predictionsReport`/`formatPredictionsGap`
      en entier (gabarit exact à reproduire)
- [ ] Relire `bin/lib/verify.js` en entier (construction de `evidence`, calcul
      de `ok`, démotion `done → in_progress`)

## Implementation Tasks

- [ ] Ajouter le bloc de validation lenient `phase.mutation` dans
      `progress.js#validateProgress`
- [ ] Écrire `mutationReport({ dir, phase })` et `formatMutationGap` dans
      `mutate.js`, réutilisant le moteur de 02-02
- [ ] Appeler `mutationReport` dans `verify.js`, seulement si `result.ok`
- [ ] Intégrer `mutationReport.ok` dans le calcul global de `ok`
- [ ] Ajouter la section `mutation` à l'objet `evidence`
- [ ] Vérifier que la démotion `done → in_progress` existante couvre bien le
      cas d'un mutant qui se met à survivre (elle devrait, via `ok` global —
      confirmer par test plutôt que supposer)

## Testing Tasks

- [ ] Étendre `test/verify.test.js` (tous les cas du Test Plan de `plan.md`)
- [ ] Ajouter le cas de validation `phase.mutation` non booléen (`test/verdict.test.js`
      ou `test/verify.test.js`, au choix du fichier existant le plus cohérent)
- [ ] Justifier dans le `## Result` toute modification d'un test existant

## Validation Tasks

- [ ] `npm test`
- [ ] `node bin/ai-learn.js verify <id> --dir <projet-temporaire>` sur un cas
      bloquant et un cas passant

## Result

### Rollback Notes
