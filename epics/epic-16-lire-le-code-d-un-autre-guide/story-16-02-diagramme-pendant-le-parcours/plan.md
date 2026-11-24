# Plan — Story 16.02

## Implementation Context

Fichiers probables :

- bin/lib/tour.js (cycle par arrêt, attente `diagram`/`correction`, `--guard`)
- bin/lib/diagram.js, bin/lib/drawio.js (epic 15, appelés avec le dossier de lecture)
- bin/lib/guard.js (diagramme hors projet protégé quand le hook est câblé depuis un dépôt étranger)
- templates/lecture-lisez-moi.md, commands/references/lecture.md, README.md, docs/project-context.md
- test/tour.test.js, test/guard.test.js

Ancres : `diagram snapshot`, `diagram reveal`, câblage du guard (`.claude/settings.json`), `.git/info/exclude`

Mode : `STRICT` (écriture opt-in dans un dépôt étranger) · scout pre-step : `no`

À éviter : modifier `diagram.js` au-delà du paramètre `dir`.

## Decisions

- **Correction toutes les 3 arrêts**, pas à chaque arrêt : assez de matière pour un écart qui veut dire quelque chose, sans casser le rythme de lecture. Hypothèse.
- **`settings.local.json` + `.git/info/exclude`** : local à la machine, jamais commité chez l'autre équipe, réversible exactement (on stocke ce qu'on a ajouté dans `tour.json`).
- **Dépend de l'epic 15** (15.01, 15.02) : ne pas commencer avant leur livraison.

## Test Plan

Dépôt fixture git ; empreinte de l'arbre et de `.git/info/exclude` avant/après ; `settings.local.json` préexistant ; `decide` du guard avec fenêtre ouverte/fermée.

## Acceptance Traceability

| Critère | Preuve |
|---|---|
| fichiers posés | test/tour.test.js::tour start lays the diagram and its guide |
| attente dessin | test/tour.test.js::a stop waits for the diagram after its prediction |
| arrêt fermé | test/tour.test.js::a learner-layer change closes the stop |
| correction | test/tour.test.js::every third stop asks for a correction |
| guard réversible | test/tour.test.js::--guard touches only local files and stop restores them |
| mur | test/guard.test.js::the reading diagram is walled outside the window |
| settings existant | test/tour.test.js::--guard merges into an existing settings.local.json |

## Commands

```
npm test
```
