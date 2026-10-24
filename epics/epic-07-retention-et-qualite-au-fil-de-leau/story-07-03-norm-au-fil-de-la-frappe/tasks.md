# Tasks — Story 07.03

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

### What changed

- `bin/lib/norm.js` : `normHookCommand` (entrée PostToolUse : lit stdin/`--input`, mesure le seul fichier écrit, sort `additionalContext` sans bloquer, silence si propre ou hors périmètre) et `ensureNormHook` (fusion par marqueur `ai-learn.js norm --hook` dans `hooks.PostToolUse`, idempotente, sans écraser les entrées existantes).
- `bin/ai-learn.js` : dispatch `norm --hook` et aide mise à jour.
- `bin/lib/init.js` : câblage du hook pour `--platform claude` uniquement.
- `bin/lib/update.js` : câblage idempotent du hook (comme `ensureGuardHook`) et ligne de rapport.
- `templates/AGENTS-apprentissage.md` : §3quater documente le hook claude-code et le repli (appeler `ai-learn norm` après chaque brique) pour les plateformes sans hook.
- Tests : `test/norm.test.js` (violation remontée, silence propre, un seul fichier, hors périmètre, fusion idempotente, init claude/codex), `test/update.test.js` (câblage + repli AGENTS.md + idempotence).

### Rollback Notes

Revert du commit de la story ; aucune migration de données. Le hook ajouté dans `.claude/settings.json` disparaît avec le revert, et `norm` reste utilisable en standalone.

## Status: done
