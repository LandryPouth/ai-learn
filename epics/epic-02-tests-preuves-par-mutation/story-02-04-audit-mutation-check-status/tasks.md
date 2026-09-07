# Tasks — Story 02.04

## Pre-Implementation

- [ ] Lire `plan.md` et le `## Result` de story-02-03 (forme de
      `evidence.mutation` à consommer)
- [ ] Relire `bin/lib/check.js` (patron `normReport` + comparaison `sourceHash`
      par phase) et `bin/lib/status.js` (affichage `norm` + sortie `--json`)
      en entier

## Implementation Tasks

- [ ] Enrichir le message de péremption de `check.js` pour mentionner la
      mutation quand `phase.mutation === true`
- [ ] Ajouter la ligne de résumé mutation par phase dans `status.js`
      (score / aucun site / non mesuré)
- [ ] Ajouter le champ `mutation` par phase dans la sortie `status --json`

## Testing Tasks

- [ ] Étendre `test/check.test.js` (tous les cas du Test Plan de `plan.md`,
      y compris le comptage d'appels à `runCommand`/`spawnSync`)
- [ ] Étendre `test/status.test.js` (affichage texte + `--json`)
- [ ] Justifier dans le `## Result` toute modification d'un test existant

## Validation Tasks

- [ ] `npm test`
- [ ] `node bin/ai-learn.js check --root .` (temps d'exécution comparable à
      avant la story — pas de nouveau checkpoint lancé)
- [ ] `node bin/ai-learn.js status --dir <projet-temporaire> --json` et
      inspecter le champ `mutation`

## Result

### Rollback Notes
