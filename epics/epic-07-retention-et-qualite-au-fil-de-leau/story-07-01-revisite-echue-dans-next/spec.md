# Story 07.01 — Revisite échue proposée par `next`

## Goal

Chaque phase prouvée porte `lastProvenAt` ; avec `reviewAfterDays`, `next` propose de rejouer une phase `done` dont la revisite est échue, après la suite normale.

## Risk

Horloge : injecter la date, jamais `Date.now()` en dur.

## Acceptance Criteria

- [ ] Given une phase `done` prouvée il y a plus de `reviewAfterDays` jours, when `ai-learn next` tourne, then la sortie propose la revisite de cette phase (mention séparée de la suite normale).
- [ ] Given une phase sans `reviewAfterDays` ni `lastProvenAt`, when `next` tourne, then aucun changement (rétro-compatible).
- [ ] Given `verify` réussi, when la phase est marquée `done`, then `lastProvenAt` est écrit (date de l'évidence, pas déclarée).
- [ ] Given `next --json`, when une revisite est échue, then `revisit: [ids]` est exposé séparément de `next`.
- [ ] Given `reviewAfterDays` invalide, when `validateProgress` tourne, then erreur explicite.

## Edge Cases

- [ ] Aucun cas limite propre à cette story au-delà des critères.

## Out of Scope

- [ ] bin/lib/check.js (story 02)
