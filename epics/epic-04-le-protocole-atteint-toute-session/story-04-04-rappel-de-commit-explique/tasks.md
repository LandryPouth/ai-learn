# Tasks — Story 04.04

## Status: done

## Pre-Implementation

- [x] Lire `plan.md`, `RULES.md`, et les fichiers « probables » ci-dessus
- [x] Rejouer le comportement actuel sur un projet temporaire (état de départ)

## Implementation Tasks

- [x] Implémenter le plus petit changement qui satisfait les critères, dans l'ordre du plan
- [x] Trancher chaque « Décision à prendre » dans `plan.md` avant d'écrire le code concerné

## Testing Tasks

- [x] Écrire les tests du Test Plan (rouge d'abord pour toute logique de décision)
- [x] Remplir la table `Acceptance Traceability` avec les vrais `file::test`

## Validation Tasks

- [x] `npm test`
- [x] `ai-flow verify --story <dir>`

## Result

- **Changed** : `bin/lib/scan.js#gitState` lit et compte `git status --porcelain` (lecture seule ; 0 pour arbre propre ou dossier non-git). `bin/lib/util.js#explainCommitCommand` porte l'explication unique de la commande. `bin/lib/commit-reminder.js` imprime le rappel partagé par `status` et `next`. `bin/lib/status.js` / `next.js` affichent le rappel et exposent `uncommitted` en `--json` ; `bin/lib/verify.js` réutilise la même explication à la clôture de phase.
- **Tests** : `npm test` vert (658 tests) ; `ai-flow verify --story` vert.
- **Issues / follow-ups** : aucun blocage.

### Rollback Notes

- Revert du commit de la story ; aucune migration de données, uniquement des champs additifs dans `--json` et du texte affiché.


### Rollback Notes
