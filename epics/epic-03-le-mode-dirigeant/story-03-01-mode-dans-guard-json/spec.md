# Story 03.01 — Mode `apprenti|dirigeant` dans `guard.json`

## Goal

`guard.json` porte `mode` ; en `dirigeant`, `learnerFiles` pointe `test/**` et `checkpoint/**` à la place de `src/**` : l'IA écrit l'implémentation, l'apprenant garde la spécification, mécaniquement.

## Risk

STRICT : décision d'autorisation. Revue indépendante (`/flow-review` Deep) obligatoire.

## Acceptance Criteria

- [x] Given `guard.json` en mode `apprenti` (défaut, ou champ absent), when l'IA écrit dans `src/**`, then c'est bloqué comme aujourd'hui (non-régression).
- [x] Given le mode `dirigeant`, when l'IA écrit dans `test/**` ou `checkpoint/**`, then c'est bloqué ; when elle écrit dans `src/**`, then c'est autorisé.
- [x] Given un `guard.json` sans `mode` ou avec une valeur inconnue, when le guard charge la config, then il retombe sur `apprenti` (jamais le mode le plus permissif par défaut).
- [x] Given le mode `dirigeant`, when une commande git/gh est lancée par l'IA, then elle reste bloquée (§3bis inchangé).
- [x] Given la matrice de décision du guard, when la suite de tests tourne, then chaque case {mode} × {src, test, checkpoint, git} est couverte.

## Edge Cases

- [x] Aucun cas limite propre à cette story au-delà des critères.

## Out of Scope

- [x] ~~bin/lib/mutate.js, bin/lib/norm.js, bin/lib/source-hash.js (lisent
      `learnerFiles`)~~ — **repris dans cette story** après revue : les trois
      consommateurs lisent désormais `implementationFiles`. Sans ce branchement,
      `mode: "dirigeant"` aurait fait porter l'empreinte de preuve sur la
      spécification (régression d'epic 01).
- [ ] Le guard ne protège pas son propre `guard.json` ni `.claude/settings.json` :
      l'IA peut réécrire `mode`. Faille préexistante, hors périmètre (cf. Remaining Risks).
