# Plan — Story 15.04

## Implementation Context

Fichiers probables :

- bin/lib/diagram-lint.js, bin/lib/scan.js (`walkSources`, lecture seule) (nouveau : règles sur le calque `apprenant`)
- bin/lib/drawio.js (styles : conteneur, texte, bordure)
- bin/lib/predictions.js (type `explication`, `--rubric`), bin/lib/status.js, bin/lib/check.js, bin/lib/bilan.js
- templates/diagramme.md, templates/AGENTS-apprentissage.md, README.md, docs/project-context.md, docs/pedagogie.md
- test/diagram-lint.test.js, test/predictions.test.js, test/status.test.js, test/init.test.js

Ancres : `norm.js` (heuristique non bloquante, rapport), `PREDICTION_TYPES`

Mode : `STANDARD` · scout pre-step : `no`

À éviter : `diagram.js` de 15.02/15.03 hors import.

## Decisions

- **Écart avec le code par compte d'imports, pas par `codemap.js`** : `codemap.js` vérifie les citations d'une carte écrite, il ne connaît pas le graphe d'imports. Le compte est une regex sur les `require`/`import` relatifs des fichiers de `walkSources` : approximatif, donc seulement un avertissement. Hypothèse : seuil de 5 imports, 3 avertissements au plus.

- **Hypothèse : 7 boîtes par page** (limite de lisibilité classique, 7 ± 2) ; ajustable dans `tutor.json` (`diagram.maxBoxes`).
- **Grille booléenne à 5 critères** plutôt qu'une note libre : comparable d'une phase et d'un projet à l'autre, et exportable vers la mémoire (epic 13).
- **Lint jamais bloquant** : un découpage se discute ; bloquer sur une heuristique contredirait l'invariant 6.

## Test Plan

Fixtures `.drawio` : page de 9 boîtes, flèche nue, groupe, texte libre, chemin d'erreur présent/absent, plusieurs pages. Prédictions `explication` avec grille valide et invalide.

## Acceptance Traceability

| Critère | Preuve |
|---|---|
| zoom | test/diagram-lint.test.js::more than seven boxes asks for a zoom level |
| flèche nue | test/diagram-lint.test.js::an unlabelled arrow is named by its ends |
| erreur | test/diagram-lint.test.js::a missing error path is flagged |
| écart avec le code | test/diagram-lint.test.js::a heavily imported file missing from the diagram is named |
| non bloquant | test/verify.test.js::lint warnings never block a diagram phase |
| grille invalide | test/predictions.test.js::unknown rubric criteria are refused |
| status | test/status.test.js::status shows the last explanation rubric |
| mode d'emploi | test/init.test.js::the diagram guide explains the rubric and zoom levels |

## Commands

```
npm test
```
