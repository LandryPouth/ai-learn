# Story 06.02 — `docs digest` : extrait condensé par phase

## Goal

`ai-learn docs digest --phase <id>` produit `docs/digests/phase-<id>.md` : les sections ciblées (✅) de la phase, citées par `fichier:ligne`, sans les sections ⏭️ — l'apprenant lit un extrait, pas des fichiers entiers.

## Risk

Écrit dans `docs/digests/` seulement.

## Acceptance Criteria

- [x] Given une phase avec des sections ciblées déclarées, when `docs digest --phase 1` tourne, then `docs/digests/phase-1.md` contient chaque section ✅ avec sa citation `fichier:ligne` et aucune section ⏭️.
- [x] Given une citation, when elle est vérifiée, then `fichier:ligne` pointe vers une ligne existante de la source (sinon erreur : jamais de citation inventée).
- [x] Given un digest déjà généré et une source modifiée, when `docs digest` retourne, then le digest est régénéré et l'ancien écrasé (fichier généré, comme `predictions.md`).
- [x] Given une phase sans sections ciblées, when `digest` tourne, then message clair, aucun fichier vide écrit.
- [x] Given `check`, when le digest d'une phase pointe vers une ligne disparue, then c'est un warning.

## Edge Cases

- [x] Aucun cas limite propre à cette story au-delà des critères.

## Out of Scope

- [x] bin/lib/traps.js (réutiliser son extraction de citations, ne pas la réécrire)
- [x] bin/lib/propose.js
