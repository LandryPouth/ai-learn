# Story 08.02 — Spike : le hook `norm` côté OpenCode

Spike borné : établir, preuve à l'appui, si OpenCode permet de remonter les violations de `ai-learn norm` à l'agent après une écriture (`tool.execute.after`), comme le hook PostToolUse de Claude Code (story 07-03). Dépend de 08-01 (même plugin).

## Acceptance Criteria

- [ ] Given OpenCode 1.19.x installé, when on enregistre un `tool.execute.after` dans un plugin d'essai, then le constat écrit dit précisément ce qui est modifiable (`output.output`, métadonnées, autre événement) et ce qui ne l'est pas, avec la commande ou la session qui le prouve.
- [ ] Given le constat « faisable », when la story se termine, then `ai-learn norm --hook` est appelé depuis le plugin de 08-01, ne bloque jamais l'écriture, et ne produit aucune sortie sans violation ; un test charge le plugin et vérifie les deux cas.
- [ ] Given le constat « infaisable » ou « non prouvable », when la story se termine, then rien n'est câblé, le README et AGENTS.md §3quater disent « repli : lancer `ai-learn norm` après chaque brique », et aucune ligne ne promet un hook.
- [ ] Given l'un ou l'autre constat, when `docs/plans/portabilite-opencode.md` est relu, then sa section 4 est remplacée par le résultat.

## Out of Scope

- Bloquer une écriture au titre de `norm`.
- Tout hook pour Gemini, Codex, Antigravity.

## Commands

```
npm test
```

## Result
