# Story 08.02 — Spike : le hook `norm` côté OpenCode

Spike borné : établir, preuve à l'appui, si OpenCode permet de remonter les violations de `ai-learn norm` à l'agent après une écriture (`tool.execute.after`), comme le hook PostToolUse de Claude Code (story 07-03). Dépend de 08-01 (même plugin).

## Acceptance Criteria

- [x] Given OpenCode 1.19.x installé, when on enregistre un `tool.execute.after` dans un plugin d'essai, then le constat écrit dit précisément ce qui est modifiable (`output.output`, métadonnées, autre événement) et ce qui ne l'est pas, avec la commande ou la session qui le prouve.
- [x] Given le constat « faisable », when la story se termine, then `ai-learn norm --hook` est appelé depuis le plugin de 08-01, ne bloque jamais l'écriture, et ne produit aucune sortie sans violation ; un test charge le plugin et vérifie les deux cas.
- [~] Given le constat « infaisable » ou « non prouvable », when la story se termine, then rien n'est câblé, le README et AGENTS.md §3quater disent « repli : lancer `ai-learn norm` après chaque brique », et aucune ligne ne promet un hook.
- [x] Given l'un ou l'autre constat, when `docs/plans/portabilite-opencode.md` est relu, then sa section 4 est remplacée par le résultat.

## Out of Scope

- Bloquer une écriture au titre de `norm`.
- Tout hook pour Gemini, Codex, Antigravity.

## Commands

```
npm test
```

## Result

Constat : **faisable**, câblé et prouvé en session réelle.

- `templates/opencode-guard-plugin.js` : `tool.execute.after` enregistré ; pour `write`/`edit`/`apply_patch`, il résout le(s) chemin(s), appelle `normHookContext` (le même vérificateur que `ai-learn norm --hook`, chargé en processus) et ajoute le conseil à `output.output`. Jamais bloquant, silencieux sans violation, toute erreur avalée.
- `bin/lib/norm.js` : extraction de `normHookContext` (pure) ; `normHookCommand` l'enveloppe. Aucun changement de comportement du CLI.
- `test/opencode-guard.test.js` : 2 tests chargent le plugin généré — violation (message + conseil ajoutés, pas de décision) et écriture propre (sortie inchangée). 42 tests dans le fichier.
- `docs/plans/portabilite-opencode.md` §4 : remplacée par le constat, la forme exacte de `(input, output)`, ce qui est mutable, et deux preuves de session (`ses_e91e9f639ffeL6XlNWXrTlwd7h` pour la sonde, `ses_e91e41134ffeZQ99FwZcZ50mOQ` pour le plugin réel).
- `templates/AGENTS-apprentissage.md` §3quater : OpenCode n'est plus dans la liste « sans hook » ; le repli ne cite plus que Codex, Gemini, Antigravity.

Validation : `npm test` (790 tests, 0 échec) ; `ai-flow verify` vert, `Coverage: evidence` (test renforcé + 2 fichiers de comportement).

### Rollback Notes

Revert du commit de la story : le hook `after` et `normHookContext` disparaissent, le CLI `norm --hook` reste identique ; aucun état de données, aucune migration. Un plugin déjà généré est régénéré par `ai-learn update` après le revert.

## Status: done
