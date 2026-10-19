# Story 03.03 — Tier « revue » : `docs/reviews/<brique>.md` sourcé

## Goal

En mode dirigeant, une brique n'est prouvée que si `docs/reviews/<brique>.md` cite un `fichier:ligne` réel du diff et une décision (accepter, rejeter, demander un changement).

## Risk

Vérification de contenu : ne jamais faire confiance à une citation non résolue.

## Acceptance Criteria

- [ ] Given `docs/reviews/<brique>.md` citant `src/x.ts:12` existant et une décision, when `check` tourne, then la revue est valide.
- [ ] Given une revue sans citation, ou citant une ligne inexistante, when `check` tourne, then erreur (presence + substance, comme `citesRealPRUrl`).
- [ ] Given le mode `apprenti`, when `check` tourne, then les revues ne sont jamais exigées.
- [ ] Given `ai-learn status`, when des revues manquent en dirigeant, then le résumé les compte.
- [ ] Given la primitive de vérification, when on lit le code, then elle réutilise `citesRealPRUrl` (ou en extrait un noyau commun) sans le recopier.

## Edge Cases

- [ ] Aucun cas limite propre à cette story au-delà des critères.

## Out of Scope

- [ ] bin/lib/guard.js
