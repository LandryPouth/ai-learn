# Plan — Story 15.03

## Implementation Context

Fichiers probables :

- bin/lib/diagram.js (écriture de la prédiction `schema` au reveal ; création de la page de revisite)
- bin/lib/drawio.js (ajout d'une page vide, libellés normalisés par page)
- bin/lib/predictions.js (type `schema`, rendu), bin/lib/revisit.js, bin/lib/verify.js (`--revisit` dessiné)
- bin/lib/status.js, bin/lib/bilan.js
- templates/diagramme.md, templates/AGENTS-apprentissage.md, README.md, docs/project-context.md, docs/pedagogie.md
- test/diagram.test.js, test/revisit.test.js, test/predictions.test.js, test/status.test.js

Ancres : `PREDICTION_TYPES`, `revisitState`, `verify --revisit`, `renderJournal`

Mode : `STANDARD` · scout pre-step : `no`

À éviter : la logique de retrait de code de `revisit` (inchangée pour `src/**`).

## Decisions

- **Hypothèse : seuil 70 %** des boîtes retrouvées ; à recalibrer sur les premières revisites réelles.
- **L'empreinte de la page `contexte` au moment de la preuve** est stockée dans l'évidence (15.01) avec les libellés : la revisite compare à ce que l'apprenant avait prouvé, pas à ce qu'il a ajouté depuis.
- **Écriture du `.drawio` par l'outil** (page vide) : seule écriture de l'outil dans ce fichier, ajout pur, jamais de modification de cellule existante.

## Test Plan

Fixtures : reveal avec ajouts connus ; revisite avec libellés accentués et en casse différente, au-dessus et au-dessous du seuil ; `predictionsRequired` par type.

## Acceptance Traceability

| Critère | Preuve |
|---|---|
| gaps | test/diagram.test.js::reveal records a schema prediction with its gaps |
| verify | test/predictions.test.js::schema predictions count toward requirements |
| page de revisite | test/revisit.test.js::a diagram revisit adds a blank page |
| réussite | test/revisit.test.js::a drawn revisit passes at seventy percent |
| échec | test/revisit.test.js::a drawn revisit below the threshold lists missing boxes |
| status | test/status.test.js::status shows diagram gaps |

## Commands

```
npm test
```
