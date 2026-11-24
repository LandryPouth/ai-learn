# Plan — Story 15.02

## Implementation Context

Fichiers probables :

- bin/lib/diagram.js (nouveau : `snapshot`, `reveal`, `status`, état `.ai-learn/diagram.json`)
- bin/lib/drawio.js (empreinte complète avec ids, diff de cellules par calque)
- bin/lib/guard.js (chemin protégé conditionnel : fenêtre fermée = refus), bin/lib/platforms/opencode-guard.js (même `decide`)
- bin/lib/check.js (fenêtre ancienne), bin/ai-learn.js
- templates/diagramme.md, templates/AGENTS-apprentissage.md, README.md, docs/project-context.md, docs/architecture.md
- test/diagram.test.js, test/guard.test.js, test/check.test.js, test/init.test.js

Ancres : `PROTECTED_DIRS`, `learnerDenialReason`, état `.ai-learn/kata.json` (fenêtre où l'IA est murée, modèle inverse)

Mode : `STRICT` · scout pre-step : `no`

À éviter : la grammaire shell du guard (on ajoute un chemin, pas une règle de parsing).

## Decisions

- **Mur hors fenêtre plutôt que vérification après coup seule** : empêcher que l'IA dessine avant l'apprenant vaut mieux que le constater.
- **`reveal` est le point de vérité** de l'intégrité : il compare à l'empreinte complète. `check` ne fait que signaler une fenêtre oubliée.
- **Ne jamais supprimer les calques `ia-phase-*`** : ils sont l'historique visible des écarts (et la donnée de 15.03).

## Test Plan

Fixtures `.drawio` avant/après : ajout dans `ia-phase-N`, modification du calque `apprenant`, ajout au mauvais calque. Guard testé par `decide` sur `Write`, `Edit` et redirection shell, fenêtre ouverte/fermée. Horloge injectée pour le warning de 7 jours.

## Acceptance Traceability

| Critère | Preuve |
|---|---|
| mur fermé | test/guard.test.js::the diagram is walled outside the correction window |
| snapshot non prouvé | test/diagram.test.js::snapshot needs a proven phase |
| fenêtre ouverte | test/guard.test.js::the AI may write the diagram inside the window |
| reveal ok | test/diagram.test.js::reveal counts the AI layer additions and closes the window |
| apprenant modifié | test/diagram.test.js::reveal refuses a changed learner layer |
| mauvais calque | test/diagram.test.js::reveal refuses AI cells outside its layer |
| fenêtre ancienne | test/check.test.js::check warns about a week-old open window |
| mode d'emploi | test/init.test.js::the diagram guide explains the correction window |

## Commands

```
npm test
```
