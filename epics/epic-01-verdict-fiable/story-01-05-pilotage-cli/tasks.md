# Tasks — Story 01.05

## Pre-Implementation

- [ ] Lire `plan.md` (Implementation Context)
- [ ] Reproduire le bug (`verify --dir <chemin> 0`) et noter la sortie exacte
- [ ] Relire l'entrée `docs add avale le --dir global` de `docs/DOGFOODING.md`
- [ ] Capturer les sorties texte actuelles de `check`, `status`, `next` comme
      référence de non-régression **avant** toute modification

## Implementation Tasks

- [ ] Créer `bin/lib/args.js` (flags à valeur déclarés par commande, flags booléens)
- [ ] Brancher `verify` seul, faire tourner toute la suite
- [ ] Étendre commande par commande (`install`, `propose`, `docs`, `init`, `check`,
      `update`), suite complète entre chaque
- [ ] Remplacer `stripDir` de `docs.js` par le parseur partagé
- [ ] Extraire le calcul du rendu dans `check`, `status`, `next`
- [ ] Ajouter `--json` aux trois commandes (objet racine versionné, chemins normalisés)

## Testing Tasks

- [ ] Créer `test/args.test.js` (7 cas)
- [ ] Étendre `test/cli.test.js` (3 cas)
- [ ] Ajouter les tests de non-régression de sortie texte **avant** le refactor
- [ ] Étendre `test/check.test.js`, `test/status.test.js`, `test/next.test.js` (JSON)
- [ ] Vérifier que `test/docs.test.js` passe sans modification

## Validation Tasks

- [ ] `npm test`
- [ ] `node bin/ai-learn.js check --root . --json | node -e "JSON.parse(require('fs').readFileSync(0,'utf8'))"`
- [ ] Comparer les sorties texte aux références capturées

## Result

_Rempli après exécution : résumé, fichiers modifiés, tests exécutés._

### Rollback Notes

-
