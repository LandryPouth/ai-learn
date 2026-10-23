# Story 04.05 — Préfixe commun `/learn-*` des commandes, anciens noms en alias

## Goal

Les commandes `/…` se regroupent sous `/learn-` pour être découvrables par autocomplétion ; les anciens noms (`/next`, `/status`…) restent des alias fins pour ne casser aucun projet déjà scaffoldé.

## Risk

Rétro-compatibilité : tout projet déjà scaffoldé doit continuer à marcher.

## Acceptance Criteria

- [x] Given une installation fraîche, when on liste les commandes de la plateforme, then `learn-next`, `learn-status`, `learn-scan`, `learn-propose`, `learn-check`, `learn-docs` existent (et `learn`).
- [x] Given un projet déjà installé avec les anciens noms, when `ai-learn update` tourne, then les anciens noms restent présents et renvoient au même contenu (alias), avec une note de dépréciation d'une ligne.
- [x] Given le README, when on le lit, then le tableau de commandes donne les nouveaux noms et mentionne les alias.
- [x] Given `ai-learn check`, when seuls les anciens noms existent, then c'est un warning de migration, jamais une erreur.

## Edge Cases

- [x] Aucun cas limite propre à cette story au-delà des critères.

## Out of Scope

- [ ] bin/lib/guard.js
- [ ] templates/AGENTS-apprentissage.md hors tableau des commandes
