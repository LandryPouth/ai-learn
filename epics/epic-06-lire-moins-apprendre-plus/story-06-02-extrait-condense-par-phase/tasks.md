# Tasks — Story 06.02

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

Revert du commit de la story ; `docs/digests/` est un répertoire généré et
`phase.sections` un champ additif — aucun schéma existant n'est modifié.

### Result

- **Changed**: `bin/lib/docs.js` — `docs digest --phase <id>` copie les plages
  `phase.sections` (`{ source, file, from, to }`) dans
  `docs/digests/phase-<id>.md`, refuse toute plage hors fichier ou hors source,
  écrase un digest périmé, et n'écrit rien sans sections ; citations machine
  `<!-- digest: source/file:from-to -->` ; `bin/lib/check.js` avertit quand une
  citation ne résout plus (ligne disparue, fichier/source absent).
- **Tests**: `npm test` — 709 tests verts.
- **Traceability**:
  - sections ✅ copiées, ⏭️ absentes: `test/docs.test.js::docs digest copies the declared line ranges and cites them`
  - citation invalide refusée: `test/docs.test.js::docs digest refuses a citation that does not point at real lines`
  - traversée de source refusée: `test/docs.test.js::docs digest refuses a file that escapes its source`
  - régénération/écrasement: `test/docs.test.js::docs digest regenerates and overwrites a stale digest`
  - phase sans sections: `test/docs.test.js::docs digest without declared sections says so and writes no file`
  - usage sans `--phase`: `test/docs.test.js::docs digest without --phase fails with usage`
  - warning `check`: `test/check.test.js::check warns when a phase digest cites lines the source no longer has`

## Status: done
