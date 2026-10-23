# Tasks — Story 04.01

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

### Summary

`init` et `update` écrivent désormais le fichier mémoire natif de la plateforme
(`CLAUDE.md` pour Claude Code, `GEMINI.md` pour Gemini) avec une ligne
`@AGENTS.md`, en append-only : un fichier personnalisé garde toutes ses lignes,
seul l'import manquant est ajouté, et une écriture impossible est signalée sans
planter. Codex, OpenCode et Antigravity lisent `AGENTS.md` nativement et ne
reçoivent aucun stub. `check` avertit quand une plateforme installée a un
`AGENTS.md` à importer mais pas de fichier mémoire natif (ou pas d'import).

### Files Changed

- `bin/lib/platforms/ensure.js` — `NATIVE_MEMORY_FILE`, `ensureNativeMemoryFile`,
  `detectedPlatforms`, `hasNativeMemoryImport`.
- `bin/lib/init.js` — stub natif de la plateforme passée à `scaffold`.
- `bin/lib/update.js` — backfill sans `--platform`, stub ciblé avec `--platform`.
- `bin/lib/check.js` — warning « stub manquant / import absent » par plateforme
  détectée.
- `test/{init,update,check}.test.js`, `test/helpers.js` — tests et isolation home.

### Issues

Aucun.

### Follow-ups

Aucun.

### Remaining Risks

- `check` détecte une plateforme par ses commandes `/…` installées : une install
  globale absente mais une session ouverte sur cette plateforme ne sera pas
  signalée (l'agent peut toujours passer `--platform` à `init`/`update`).
- Un `AGENTS.md` personnalisé laisse le protocole dans
  `docs/plans/mode-apprentissage.md` : l'import `@AGENTS.md` charge alors les
  règles de l'apprenant, pas le protocole. Comportement identique à `init`
  aujourd'hui, hors du périmètre de cette story.

### Rollback Notes

Revert du commit de la story. Aucune migration : seuls des fichiers additifs à
la racine et des warnings de `check` sont ajoutés.
