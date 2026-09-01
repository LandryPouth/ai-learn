# Tasks — Story 01.04

## Pre-Implementation

- [ ] Lire `plan.md` (Implementation Context)
- [ ] Relire le `## Result` de la story 01.03 (schéma exact des données)
- [ ] Relire le calcul de `ok` dans `verify.js` et la forme des messages norme/artefacts

## Implementation Tasks

- [ ] Ajouter `predictionsReport({ dir, phase })` dans `bin/lib/predictions.js`
- [ ] Brancher le facteur dans le calcul de `ok` de `verify`, calculé inconditionnellement
- [ ] Ajouter la section prédictions à l'évidence, symétrique de `norm`
- [ ] Afficher le manque au format des violations de norme
- [ ] Signaler (sans bloquer) l'anomalie d'antériorité
- [ ] Faire consommer le même rapport par `check`
- [ ] Écrire la limite dans `README.md` et `templates/AGENTS-apprentissage.md` :
      l'ordre d'écriture est contrôlé, l'honnêteté ne l'est pas

## Testing Tasks

- [ ] Étendre `test/verify.test.js` (9 cas)
- [ ] Étendre `test/predictions.test.js` (3 cas d'antériorité)
- [ ] Étendre `test/check.test.js` (cohérence des comptes)

## Validation Tasks

- [ ] `npm test`
- [ ] `node bin/ai-learn.js check --root .`
- [ ] Vérifier sur le dogfood Fastify qu'aucun `verify` ne se met à bloquer

## Result

_Rempli après exécution : résumé, fichiers modifiés, tests exécutés._

### Rollback Notes

-
