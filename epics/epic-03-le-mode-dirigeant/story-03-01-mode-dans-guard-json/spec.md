# Story 03.01 — Mode `apprenti|dirigeant` dans `guard.json`

## Goal

`guard.json` porte `mode` ; en `dirigeant`, `learnerFiles` pointe `test/**` et `checkpoint/**` à la place de `src/**` : l'IA écrit l'implémentation, l'apprenant garde la spécification, mécaniquement.

## Risk

STRICT : décision d'autorisation. Revue indépendante (`/flow-review` Deep) obligatoire.

## Acceptance Criteria

- [ ] Given `guard.json` en mode `apprenti` (défaut, ou champ absent), when l'IA écrit dans `src/**`, then c'est bloqué comme aujourd'hui (non-régression).
- [ ] Given le mode `dirigeant`, when l'IA écrit dans `test/**` ou `checkpoint/**`, then c'est bloqué ; when elle écrit dans `src/**`, then c'est autorisé.
- [ ] Given un `guard.json` sans `mode` ou avec une valeur inconnue, when le guard charge la config, then il retombe sur `apprenti` (jamais le mode le plus permissif par défaut).
- [ ] Given le mode `dirigeant`, when une commande git/gh est lancée par l'IA, then elle reste bloquée (§3bis inchangé).
- [ ] Given la matrice de décision du guard, when la suite de tests tourne, then chaque case {mode} × {src, test, checkpoint, git} est couverte.

## Edge Cases

- [ ] Aucun cas limite propre à cette story au-delà des critères.

## Out of Scope

- [ ] bin/lib/mutate.js (lit `learnerFiles` — voir décision)
- [ ] bin/lib/norm.js
