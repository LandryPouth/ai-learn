# Plan — Story 16.03

## Implementation Context

Fichiers probables :

- bin/lib/tour.js (flux, ordre, attente par saut), bin/lib/codemap.js (vérification d'une carte hors projet), bin/lib/drawio.js (page vide)
- templates/lecture-lisez-moi.md, commands/references/lecture.md, README.md, docs/project-context.md
- test/tour.test.js, test/codemap.test.js

Ancres : `codeMapState`, `declaredRoots`, `isCodeMap`

Mode : `STANDARD` · scout pre-step : `no`

À éviter : `guard.js`.

## Decisions

- **La carte est générée depuis les arrêts vérifiés**, puis seulement vérifiée par `codemap.js` : une seule source (les arrêts), pas de double saisie.
- **Prédiction à chaque saut** : c'est la compétence visée (deviner où va l'exécution).

## Test Plan

Dépôt fixture avec une requête typique sur 3 fichiers ; flux valide et trop court ; carte personnalisée ; page de flux.

## Acceptance Traceability

| Critère | Preuve |
|---|---|
| flux trop court | test/tour.test.js::a flow needs two stops |
| saut | test/tour.test.js::each hop asks for a prediction |
| carte | test/tour.test.js::a finished flow writes a verified code map |
| personnalisée | test/tour.test.js::a customised code map is kept |
| vérification | test/codemap.test.js::a reading-folder code map resolves under its root |
| page | test/tour.test.js::a flow adds its diagram page |

## Commands

```
npm test
```
