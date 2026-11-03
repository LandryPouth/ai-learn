# Plan — Story 12.03

## Implementation Context

Fichiers probables :

- bin/lib/review.js (nouveau : génération, diff unifié, secret, reveal, giveup, `kata.due`)
- bin/lib/tracks/review.js (nouveau, calqué sur `tracks/debug.js`)
- bin/lib/faults.js (tirage de défauts et de leurres sur un texte en mémoire, sans écrire sur disque)
- bin/lib/guard.js (chemins protégés `katas/**` et `~/.ai-learn/katas/**`, lecture fermée seulement pendant un kata actif)
- bin/lib/ledgers.js (nouveau ledger), bin/lib/gitignore.js (`katas/`)
- bin/lib/next.js, bin/lib/status.js, bin/lib/progress.js (champ de phase `kata`)
- bin/ai-learn.js (`review`, `--reveal`, `--giveup`, `--defects`, `--decoys`)
- templates/AGENTS-apprentissage.md (section kata), README.md, docs/project-context.md
- test/review.test.js, test/tracks-review.test.js (nouveaux), test/guard.test.js, test/next.test.js

Ancres : `PROTECTED_DIRS`, `matchesLearnerPath`, `incidentDue` (modèle du tirage une fois par preuve), `recordDebugTiers`, `writeLedgerFile`, `findAllSites`

Mode : `STRICT` (extension du guard, secret hors projet) · scout pre-step : `no`

À éviter : la grammaire shell de `guard.js` ; `incident.js` (ne pas mélanger les deux états actifs, seulement se refuser mutuellement).

## Decisions

- **Génération mécanique** (voir index de l'epic) : ni agent séparé ni banque versionnée.
- **Copie, jamais `src/**`** : le kata ne casse rien ; l'apprenant peut continuer sa phase.
- **Diff unifié écrit par l'outil** sans dépendance : les changements sont des substitutions ligne pour ligne, un bloc par site avec 3 lignes de contexte suffit.
- **Rapprochement à ±1 ligne** : le défaut est sur une ligne connue ; la tolérance absorbe une citation sur la ligne voisine.
- **Lecture fermée seulement pendant le kata actif** : après `--reveal`, l'IA doit pouvoir discuter le diff.
- **Pas de cinquième commande visible** : déclenché par `/learn-next` via le tag de phase `kata`.

## Test Plan

Projets temporaires avec un pack JS, générateur fixé : génération (4 lignes changées, `src/**` intact, état sans secret), guard lecture et écriture, reveal vide refusé, scores (complet avec leurre signalé, partiel), `kata.due` une fois par preuve, double kata refusé, ledger illisible préservé.

## Acceptance Traceability

| Critère | Preuve |
|---|---|
| génération | test/review.test.js::review writes a diff of defects and decoys and leaves src untouched |
| guard | test/guard.test.js::an active kata is closed to the ai |
| revue vide | test/review.test.js::reveal refuses an empty review |
| score complet | test/review.test.js::a full review with a flagged decoy reaches tier 2 |
| score partiel | test/review.test.js::a missed defect is shown with its mechanism |
| kata dû | test/next.test.js::a proven kata phase makes a kata due once |
| double | test/review.test.js::a second kata is refused while one is active |
| ledger | test/tracks-review.test.js::an unreadable review ledger is never overwritten |

## Commands

```
npm test
```
