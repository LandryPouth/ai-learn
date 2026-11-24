# Plan — Story 15.01

## Implementation Context

Fichiers probables :

- bin/lib/drawio.js (nouveau : parseur minimal, calques, empreinte, refus du compressé)
- templates/systeme.drawio, templates/diagramme.md (nouveaux)
- bin/lib/init.js, bin/lib/update.js (pose des deux fichiers, régénération du mode d'emploi)
- bin/lib/verify.js (blocage `diagram`, empreinte dans l'évidence), bin/lib/progress.js (validation du champ `diagram`)
- bin/lib/next.js, bin/lib/status.js (rappel, ligne)
- README.md, docs/project-context.md, docs/architecture.md, templates/AGENTS-apprentissage.md
- test/drawio.test.js, test/init.test.js, test/update.test.js, test/verify.test.js, test/next.test.js, test/status.test.js

Ancres : `scaffold`, `syncJournalRender`, `PROTOCOL_MARKER`, `computeSourceHash`, `formatPredictionsGap` (forme des raisons de blocage)

Mode : `STANDARD` · scout pre-step : `no`

À éviter : `guard.js` (15.02).

## Decisions

- **Parseur par expressions régulières sur `mxCell`**, pas de dépendance XML : le format draw.io non compressé est régulier ; tout ce qui ne se lit pas est refusé clairement.
- **Positions exclues de l'empreinte** : on mesure le contenu (boîtes, libellés, liens), pas la mise en page.
- **Le mode d'emploi vit dans le projet** (demande du mainteneur : « que l'apprenant ne l'oublie pas ») et est régénéré par `update` comme AGENTS, pour suivre les stories suivantes sans écraser une version personnalisée.

## Test Plan

Fixtures : `.drawio` vide, avec boîtes et flèches, compressé, XML invalide, calque renommé, boîte déplacée. Cas des critères.

## Acceptance Traceability

| Critère | Preuve |
|---|---|
| init | test/init.test.js::init writes the diagram and its user guide |
| update conserve | test/update.test.js::update never rewrites an existing diagram |
| compressé | test/drawio.test.js::a compressed diagram is refused with the fix |
| vide bloque | test/verify.test.js::a diagram phase with an empty learner layer is blocked |
| ajout passe | test/verify.test.js::a changed learner layer lets the phase pass and is fingerprinted |
| déplacement | test/drawio.test.js::moving a box does not change the fingerprint |
| rappel | test/next.test.js::next reminds to update the diagram first |
| personnalisé | test/update.test.js::a customised diagram guide is kept |

## Commands

```
npm test
```
