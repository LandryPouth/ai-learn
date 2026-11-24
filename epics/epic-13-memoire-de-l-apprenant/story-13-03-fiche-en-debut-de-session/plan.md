# Plan — Story 13.03

## Implementation Context

Fichiers probables :

- bin/lib/guard.js (câblage : ajouter `SessionStart` à côté de `PreToolUse`/`PostToolUse`)
- bin/lib/init.js, bin/lib/update.js (appel du câblage)
- bin/lib/memory.js (`--hook` : format de sortie, fail-open)
- bin/lib/next.js (`memory.card` dans `--json`)
- bin/lib/check.js (warning hook manquant, près de la ligne 1129)
- commands/learn-next.md, commands/learn.md (lecture de `memory.card`), templates/AGENTS-apprentissage.md
- test/guard.test.js, test/init.test.js, test/update.test.js, test/next.test.js, test/check.test.js, test/memory.test.js

Ancres : `hooks.PreToolUse`, `norm --hook`, `kataOffer`, `ensureGuardWiring` (ou équivalent)

Mode : `STRICT` (écriture dans la configuration de l'agent de l'apprenant) · scout pre-step : `no`

À éviter : la grammaire shell du guard.

## Decisions

- **Hook projet, pas global** : la fiche ne sert que dans un projet d'apprentissage ; un hook global la chargerait dans tous les dépôts, ce que le vault déconseille (`GOOD-PRACTICES.md`).
- **Fail-open muet** : comme le guard (invariant 7), une mémoire cassée ne doit jamais gêner une session.
- **Format du hook** : vérifier avec `ctx7` la forme actuelle de la sortie `SessionStart` (`additionalContext`) avant d'écrire.

## Test Plan

Câblage sur un `.claude/settings.json` vide, avec hooks utilisateur, puis double `update`. Hook avec source absente / corrompue / valide. `next --json`. Warning `check`. Fiche ≤ 10 lignes.

## Acceptance Traceability

| Critère | Preuve |
|---|---|
| câblage init | test/init.test.js::init wires the SessionStart memory hook |
| idempotence | test/update.test.js::update keeps a single SessionStart hook and user hooks |
| fail-open | test/memory.test.js::the card hook prints nothing on a corrupt source |
| next | test/next.test.js::next --json carries memory.card |
| check | test/check.test.js::check warns when the SessionStart hook is missing |
| ≤ 10 lignes | test/memory.test.js::the card is ten lines at most |

## Commands

```
npm test
```
