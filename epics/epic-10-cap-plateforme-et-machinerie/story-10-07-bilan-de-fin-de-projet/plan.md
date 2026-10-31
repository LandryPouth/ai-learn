# Plan — Story 10.07

## Implementation Context

Fichiers probables :

- bin/lib/bilan.js (nouveau : génération + validation)
- bin/lib/verify.js (génération après la dernière phase)
- bin/lib/check.js, bin/lib/status.js
- templates/bilan.md (nouveau)
- commands/learn-next.md
- README.md
- test/bilan.test.js (nouveau)

Ancres : `citesRealPRUrl`, `reviews.js`, `analyzeDonePhases`, `done: true`, `predictions.json`

Mode : `STANDARD` · scout pre-step : `no`

À éviter : noter la qualité du bilan.

## Decisions

- Contrat présence + substance minimale, comme les revues du mode dirigeant (`reviews.js`) : marqueur absent, section non vide, une décision valide. Jamais un jugement de fond.
- Génération par `verify`, pas par l'IA : les chiffres viennent des données sur disque, pas d'un résumé rédigé.
- Jamais d'écrasement : le bilan appartient à l'apprenant dès qu'il existe.

## Test Plan

Génération après dernière phase ; non-écrasement ; `check` (marqueur, section vide, 0/2 décisions, complet) ; parcours non terminé jamais signalé ; `status`.

## Acceptance Traceability

| Critère | Preuve |
|---|---|
| génération | test/bilan.test.js::last verified phase generates a prefilled bilan |
| non-écrasement | test/bilan.test.js::an existing bilan is never overwritten |
| marqueur | test/bilan.test.js::check flags a section still to complete |
| décision | test/bilan.test.js::check requires exactly one valid recommendation |
| complet | test/bilan.test.js::complete bilan passes check and shows in status |
| non terminé | test/bilan.test.js::unfinished track never requires a bilan |
| learn-next | test/commands.test.js::learn-next guides the bilan without writing answers |

## Commands

```
npm test
```
