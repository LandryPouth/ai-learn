# Story 04.02 — `next` atterrit sur l'action utile

## Goal

Quand des phases `done` sont périmées, `next` nomme d'abord la vraie suite (la phase en cours ou à venir) et relègue la re-preuve en avertissement actionnable — une commande suffit à savoir quoi faire.

## Risk

Contrat `--json` : additif seulement.

## Acceptance Criteria

- [ ] Given deux phases `done` périmées et une phase 3 jamais commencée, when `ai-learn next` tourne, then la sortie nomme la phase 3 comme prochaine action **et** liste les phases périmées en avertissement avec la commande de re-preuve.
- [ ] Given `next --json`, when des phases sont périmées, then le JSON expose `next` (la suite réelle) et `stale: [ids]` séparément (plus de `mustReprove` qui masque la suite).
- [ ] Given aucune phase périmée, when `next` tourne, then la sortie est identique à aujourd'hui (non-régression).
- [ ] Given `status`, when des phases sont périmées, then elles sont marquées `périmée` sans changer l'ordre de lecture de la phase suivante.

## Edge Cases

- [ ] Aucun cas limite propre à cette story au-delà des critères.

## Out of Scope

- [ ] bin/lib/verify.js (story 03)
- [ ] check.js
