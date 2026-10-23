# Story 05.01 — Reality check compté : trois types de prédiction

## Goal

`ai-learn predict` accepte `--type code|casse|reality`, le journal les distingue, et `verify` exige le compte par type quand `predictionsRequired` est ventilé — une phase ne part plus `done` avec zéro reality check.

## Risk

Schéma de `predictions.json` : additif seulement.

## Acceptance Criteria

- [x] Given `ai-learn predict --phase 0 --type reality`, when la prédiction est enregistrée, then `.ai-learn/predictions.json` porte `type: "reality"` et `docs/plans/predictions.md` est régénéré avec le type visible.
- [x] Given `predictionsRequired: { code: 2, reality: 1 }` et aucune prédiction `reality`, when `verify` tourne, then la phase n'est pas marquée `done` et le message cite le type manquant avec le compte réel/attendu.
- [x] Given `predictionsRequired: 3` (nombre simple, ancien format), when `verify` tourne, then le comportement est inchangé (tous types confondus).
- [x] Given un projet sans `predictions.json`, when `verify` tourne, then rien n'est bloqué (rétro-compatibilité silencieuse de l'epic 01).
- [x] Given `check`, when une phase `done` n'a aucune prédiction `reality` alors qu'elle en exigeait une, then le manque est signalé.

## Edge Cases

- [x] Aucun cas limite propre à cette story au-delà des critères.

## Out of Scope

- [ ] bin/lib/mutate.js
- [ ] bin/lib/guard.js
