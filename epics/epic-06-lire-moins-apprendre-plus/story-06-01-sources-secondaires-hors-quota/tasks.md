# Tasks — Story 06.01

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

### Rollback Notes

Revert du commit de la story ; aucune migration de données — `kind` est un champ
additif, son absence vaut `primary`.

### Result

- **Changed**: `bin/lib/docs.js` — `sourceKind`/`primarySources`, `addSource`
  accepte `secondary` et ne compte que les principales contre `MAX_SOURCES`,
  l'erreur de plafond propose `--secondary`, `docs list` sépare
  `n/3 principales` et `Sources secondaires (hors quota)`, `docsCommand` lit
  `--secondary` ; `bin/lib/traps.js` exclut les secondaires de la banque.
- **Tests**: `npm test` — 701 tests verts.
- **Traceability**:
  - ajout hors quota + listing: `test/docs.test.js::add --secondary embeds a source outside the primary quota and lists it separately`
  - erreur de plafond orientée: `test/docs.test.js::add enforces the max number of sources`
  - exclusion des pièges: `test/traps.test.js::regenerateTraps ignores secondary sources`
  - citation `fichier:ligne` / défaut `primary`: `test/docs.test.js::docSourceList defaults kind to primary and keeps secondary sources citable`
  - usage sans nom/source: `test/docs.test.js::docs add --secondary without a name or source fails with usage and writes nothing`

## Status: done
