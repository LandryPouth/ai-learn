# Plan — Story 12.02

## Implementation Context

Fichiers probables :

- bin/lib/codemap.js (nouveau : repérer les cartes, lire `Racine :`, extraire et vérifier toutes les citations)
- bin/lib/citation.js (variante « toutes les citations » de `findRealFileLine`, avec la vérification sous racine de 12.01)
- bin/lib/check.js (appel par phase, erreur ou avertissement selon l'état, `--json`)
- README.md (format de la carte), templates/AGENTS-apprentissage.md (rappel : la carte cite ce que l'apprenant a lu)
- test/codemap.test.js (nouveau), test/check.test.js

Ancres : `findRealFileLine`, `FILE_LINE_RE`, `hasSubstantialBody`, `reviewState` (modèle), la boucle `phase.artifacts` de `check.js`

Mode : `STANDARD` · scout pre-step : `no`

À éviter : changer `findRealFileLine` pour les revues existantes (ajouter une fonction, ne pas modifier le comportement de l'actuelle).

## Decisions

- **La racine vit dans la carte**, pas dans `progress.json` : l'apprenant la lit en écrivant ; aucune migration de `progress.json`.
- **Racine absente = avertissement** : un clone du projet sur une autre machine (ou la CI) ne doit pas faire tomber `check` faute d'avoir téléchargé les sources de Node.
- **Minimum de 3 citations**, même esprit que le contrat présence + substance des revues ; hypothèse à recalibrer.
- **Vérifié par `check`, pas par `verify`** : même place que le tier revue du mode dirigeant.

## Test Plan

Fixtures dans le dossier temporaire : source factice, cartes valide, invalide, sans racine, maigre, racine absente, citation évadée ; phase `done` contre phase en cours ; sortie `--json`.

## Acceptance Traceability

| Critère | Preuve |
|---|---|
| valide | test/codemap.test.js::a code map with three real citations passes |
| ligne absente | test/codemap.test.js::a citation past the end of the file is named |
| sans racine | test/codemap.test.js::a code map must declare its root |
| maigre | test/codemap.test.js::a code map needs at least three real citations |
| racine absente | test/codemap.test.js::a missing root only warns |
| en cours | test/check.test.js::an invalid code map of an unfinished phase only warns |
| évasion | test/codemap.test.js::a citation escaping the root is invalid |

## Commands

```
npm test
```
