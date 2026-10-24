# Story 04.03 — `verify --stale` : re-prouver en bloc et distinguer régression de faux positif

## Goal

`ai-learn verify --stale` relance, phase par phase et via le chemin `verify` normal, toutes les phases `done` périmées, puis résume : « toujours vert » (preuve rafraîchie) contre « régression : le checkpoint échoue maintenant ».

## Risk

Exécute des checkpoints en série : plafond de durée à documenter, aucune nouvelle autorisation.

## Acceptance Criteria

- [x] Given deux phases périmées dont le checkpoint passe encore, when `verify --stale` tourne, then les deux sont re-prouvées (nouvelle évidence, `sourceHash` à jour) et le résumé les classe « toujours vert ».
- [x] Given une phase périmée dont le checkpoint échoue (contrat d'URL changé par une phase ultérieure), when `verify --stale` tourne, then elle est classée « régression », reste non prouvée, exit 1, et le message cite l'échec réel.
- [x] Given `verify --stale` sans phase périmée, when il tourne, then il l'indique et sort en 0 sans rien écrire.
- [x] Given une re-preuve réussie, when elle se termine, then `verify` reste le seul appelant de `setPhaseStatus` (aucun `done` écrit en douce).
- [x] Given `next`/`status`, when des phases sont périmées, then ils suggèrent `ai-learn verify --stale` plutôt qu'un `verify <id>` par phase.

## Edge Cases

- [x] Aucun cas limite propre à cette story au-delà des critères.

## Out of Scope

- [ ] bin/lib/progress.js (états inchangés)
- [ ] bin/lib/mutate.js
