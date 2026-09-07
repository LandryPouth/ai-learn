# Tasks — Story 02.02

## Pre-Implementation

- [ ] Lire `plan.md` (Implementation Context) de cette story et le `## Result`
      de story-02-01 (moteur existant à généraliser)
- [ ] Relire `bin/lib/norm.js#resolveThresholds`/`ensureNormConfig`/`loadNormConfig`
      en entier (gabarit à reproduire pour la config mutation)
- [ ] Relire les trois stack packs (`c.js`, `generic.js`, `javascript.js`) pour
      le style d'export du champ `norm` à reproduire pour `mutators`

## Implementation Tasks

- [ ] Ajouter `mutators` aux trois stack packs (au moins booléen + comparaison
      pour `javascript.js`/`c.js`, booléen seul pour `generic.js`)
- [ ] Généraliser la détection de `mutate.js` en `detectAllSites(source, mutators)`
- [ ] Boucler tous les fichiers/sites du périmètre, un mutant à la fois, avec
      restauration entre chaque
- [ ] Écrire `mutateConfigPath`/`loadMutateConfig`/`ensureMutateConfig`
- [ ] Câbler `ensureMutateConfig` dans `init.js` et `update.js`, à côté de
      `ensureNormConfig`
- [ ] Implémenter le lock de récupération (`.ai-learn/mutate.lock.json`) :
      écriture avant mutation, suppression après restauration réussie,
      détection/réparation au démarrage de `mutateCommand`
- [ ] Appliquer `maxMutantsPerRun` et le score de mutation dans le rapport

## Testing Tasks

- [ ] Étendre `test/mutate.test.js` (tous les cas du Test Plan de `plan.md`)
- [ ] Étendre `test/init.test.js` et `test/update.test.js`
      (cas `.ai-learn/mutate.json`)
- [ ] Justifier dans le `## Result` toute modification d'un test existant

## Validation Tasks

- [ ] `npm test`
- [ ] `node bin/ai-learn.js init --dir <projet-temporaire>` puis inspecter
      `.ai-learn/mutate.json`
- [ ] Simuler un lock orphelin à la main (créer le fichier `.ai-learn/mutate.lock.json`
      pointant vers un fichier réel) et vérifier la restauration au run suivant

## Result

### Rollback Notes
