# Tasks — Story 01.03

## Pre-Implementation

- [ ] Lire `plan.md` (Implementation Context)
- [ ] Relire `templates/predictions.md` (format de rendu à reproduire à l'identique)
- [ ] Relire la convention de fichier généré : `update.js#PROTOCOL_MARKER` et
      `guard.js#SOLUTIONS_README`

## Implementation Tasks

- [ ] Créer `bin/lib/predictions.js` (schéma versionné, `validate`, lecture, écriture, rendu)
- [ ] Ajouter la commande d'enregistrement dans `bin/ai-learn.js` + l'aide
- [ ] Rendre `docs/plans/predictions.md` depuis les données, avec marqueur généré et
      refus d'écraser un fichier personnalisé
- [ ] Échapper le texte rapporté au rendu (pas de fausse entrée `###` fabricable)
- [ ] Faire compter `check` par phase, depuis les données quand elles existent
- [ ] Rendre le séparateur du parsing hérité tolérant (`[—–-]`)
- [ ] Câbler la création dans `init.js` et la rétro-installation dans `update.js`
- [ ] Mettre à jour `templates/AGENTS-apprentissage.md` et les commandes `/…` :
      l'agent enregistre la prédiction, il n'édite plus le `.md`

## Testing Tasks

- [ ] Créer `test/predictions.test.js` (6 cas)
- [ ] Étendre `test/check.test.js` (6 cas)
- [ ] Étendre `test/init.test.js`, `test/update.test.js`, `test/cli.test.js`

## Validation Tasks

- [ ] `npm test`
- [ ] `node bin/ai-learn.js check --root .`
- [ ] Vérifier sur le dogfood Fastify que le journal `.md` hérité est toujours compté

## Result

_Rempli après exécution : résumé, fichiers modifiés, tests exécutés._

### Rollback Notes

-
