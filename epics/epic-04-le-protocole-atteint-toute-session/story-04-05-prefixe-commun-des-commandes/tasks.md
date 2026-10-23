# Tasks — Story 04.05

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

### Files changed

- `commands/learn-{next,status,scan,propose,check,docs}.md` — renamed from the old names (canonical bodies now under `/learn-*`).
- `commands/learn.md` — internal `/next` and `/scan` references point at the new names.
- `bin/lib/platforms/commands.js` — `COMMAND_ALIASES`, `listCommands` (canonical + derived aliases), `serializeClaudeCommand`.
- `bin/lib/install.js` — installers write canonical + aliases; Claude writes aliases as generated files and replaces stale symlinks without writing through them.
- `bin/lib/platforms/ensure.js` — `MARKER_FILE` on the new names, `LEGACY_MARKER_FILE`, `legacyOnlyPlatforms`.
- `bin/lib/check.js` — migration warning for old-only installs (warning, never error).
- `README.md`, `docs/project-context.md`, `docs/architecture.md` — new names + alias note.
- Tests: `test/install.test.js`, `test/platforms.test.js`, `test/update.test.js`, `test/check.test.js`, `test/cli.test.js`, `test/integration-opencode.test.js`.

### Validation

- `npm test` — 638 tests, 0 failure (includes 4 new tests).

### Rollback Notes
