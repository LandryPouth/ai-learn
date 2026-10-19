# Story 04.04 — Rappel de commit en lecture seule, commande expliquée

## Goal

`status`/`next` signalent des fichiers modifiés non commités et affichent la commande git suggérée avec l'explication de chaque partie — sans jamais l'exécuter.

## Risk

Lecture git uniquement ; ne jamais passer par une commande d'écriture.

## Acceptance Criteria

- [ ] Given un projet avec des fichiers modifiés, when `ai-learn status` tourne, then un rappel « N fichier(s) modifié(s) non commité(s) » apparaît, avec la commande suggérée.
- [ ] Given la commande suggérée, when elle s'affiche (rappel ou clôture de `verify`), then chaque partie est expliquée (`add -A` = tout indexer y compris les nouveaux fichiers ; `-m` = message ; format Conventional Commits attendu par le hook `commit-msg`).
- [ ] Given un arbre propre ou un dossier non-git, when `status` tourne, then aucun rappel n'apparaît et rien ne plante.
- [ ] Given le rappel, when il est affiché, then aucune commande git d'écriture n'est exécutée par l'outil (lecture seule, comme `scan.js#gitState`).
- [ ] Given `--json`, when des fichiers sont modifiés, then `uncommitted: <n>` est exposé.

## Edge Cases

- [ ] Aucun cas limite propre à cette story au-delà des critères.

## Out of Scope

- [ ] bin/lib/guard.js
- [ ] bin/lib/tracks/git.js (aucun ledger touché)
