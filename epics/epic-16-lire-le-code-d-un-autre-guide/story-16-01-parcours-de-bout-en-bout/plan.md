# Plan — Story 16.01

## Implementation Context

Fichiers probables :

- bin/lib/tour.js (nouveau : dossier de lecture, `tour.json`, arrêts, statut)
- bin/lib/review-source.js (`resolveSource` réutilisé), bin/lib/citation.js (`checkFileLineUnderRoot`)
- bin/lib/predictions.js (appelé avec le dossier de lecture comme `dir`, sans changement attendu ; à vérifier)
- bin/ai-learn.js, commands/learn.md, commands/references/lecture.md (nouveau), templates/lecture-lisez-moi.md (nouveau)
- README.md, docs/project-context.md, docs/architecture.md
- test/tour.test.js

Ancres : `resolveSource`, `checkFileLineUnderRoot`, `readingBet`, `scoreReading`, `findLearningProjects`

Mode : `STANDARD` · scout pre-step : `no`

À éviter : `guard.js` (16.02), `codemap.js` (16.03).

## Decisions

- **Un dossier de lecture a la forme d'un projet** (`.ai-learn/predictions.json`) : les fonctions de `predictions.js` s'y appliquent sans branche spéciale.
- **Hypothèse : 10 arrêts au plus** ; au-delà, c'est un second parcours (un autre objectif).
- **Alias par nom du dossier source**, comme 13.01.

## Test Plan

Dépôt fixture (quelques fichiers JS) dans un dossier temporaire ; home injecté ; empreinte de l'arbre avant/après chaque commande.

## Acceptance Traceability

| Critère | Preuve |
|---|---|
| questions libres | test/commands.test.js::the reading reference requires cited answers |
| start | test/tour.test.js::tour start creates the reading folder and leaves the repo untouched |
| projet d'apprentissage | test/tour.test.js::a learning project cannot be toured |
| arrêt invalide | test/tour.test.js::a stop outside the file is refused |
| plafond | test/tour.test.js::an eleventh stop is refused |
| visité | test/tour.test.js::a revealed reading prediction visits the stop |
| next | test/tour.test.js::next expects a prediction first |
| routeur | test/commands.test.js::learn routes a repository to read to the reading flow |

## Commands

```
npm test
```
