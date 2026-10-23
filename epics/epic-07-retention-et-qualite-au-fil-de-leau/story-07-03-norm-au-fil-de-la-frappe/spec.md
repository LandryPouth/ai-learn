# Story 07.03 — `norm` au fil de la frappe (hook claude-code)

## Goal

`init`/`update` câblent, pour claude-code, un hook PostToolUse qui lance `ai-learn norm` en lecture seule après une écriture dans `src/**` et remonte les violations de façon non bloquante.

## Risk

Écrit dans `.claude/settings.json` : fusion, jamais remplacement.

## Acceptance Criteria

- [x] Given un projet claude-code initialisé, when `.claude/settings.json` est lu, then un hook PostToolUse (matcher écriture/édition) appelle `ai-learn norm --hook`.
- [x] Given une écriture qui crée une violation de norme, when le hook tourne, then la violation (`fichier:ligne — message [règle]`) est remontée à l'agent sans bloquer l'écriture.
- [x] Given une écriture sans violation, when le hook tourne, then aucune sortie (zéro bruit).
- [x] Given un `settings.json` déjà personnalisé, when `update` tourne, then le hook est ajouté sans écraser les entrées existantes (marqueur `ai-learn`, comme `guard`).
- [x] Given une plateforme sans hook équivalent, when `init` tourne, then rien n'est câblé et AGENTS.md §3quater décrit le repli (appeler `ai-learn norm` après chaque brique).

## Edge Cases

- [ ] Aucun cas limite propre à cette story au-delà des critères.

## Out of Scope

- [ ] guard.js (décision d'accès)
- [ ] verify.js
