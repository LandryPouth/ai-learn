# Plan — Story 04.04

## Implementation Context

Fichiers probables :

- bin/lib/status.js
- bin/lib/next.js
- bin/lib/verify.js (affichage de clôture)
- bin/lib/util.js#spawnGit
- bin/lib/scan.js#gitState
- test/status.test.js

Ancres de recherche : `spawnGit`, `gitState`, `feat(phase-`

Mode d'exécution : `STANDARD`

Scout pre-step : `no` — les points d'intégration sont nommés ci-dessus.

À éviter sauf nécessité : bin/lib/guard.js, bin/lib/tracks/git.js (aucun ledger touché)

## Decisions

- Décidé : le texte explicatif de la commande vit à un seul endroit (`util.js#explainCommitCommand`), partagé par `verify` et le rappel de `status`/`next` — aucune copie. Le rappel lui-même vit dans `commit-reminder.js`, appelé par les deux commandes.
- Décidé : `gitState` étend sa lecture avec `git status --porcelain` via `spawnGit` isolé (`gitIsolatedEnv`) — lecture seule, jamais une commande d'écriture git.

## Test Plan

- [ ] Unit : parsing porcelain (modifié, non suivi, vide).
- [ ] Intégration : dépôt temporaire propre/sale.

## Acceptance Traceability

| Acceptance criterion | Test proving it |
| --- | --- |
| Given un projet avec des fichiers modifiés, when `ai-learn status` tourne, then un rappel « N fichier(s) modifié(s) non commité(s) » apparaît, avec la commande suggérée. | `test/status.test.js::status reminds about modified and untracked files, with the suggested command and its explanation` |
| Given la commande suggérée, when elle s'affiche (rappel ou clôture de `verify`), then chaque partie est expliquée (`add -A` = tout indexer y compris les nouveaux fichiers ; `-m` = message ; format Conventional Commits attendu par le hook `commit-msg`). | `test/status.test.js::status reminds about modified and untracked files, with the suggested command and its explanation` · `test/verify.test.js::verify suggests a per-phase commit once the phase is marked done` |
| Given un arbre propre ou un dossier non-git, when `status` tourne, then aucun rappel n'apparaît et rien ne plante. | `test/status.test.js::status stays silent on a clean tree and on a non-git directory` |
| Given le rappel, when il est affiché, then aucune commande git d'écriture n'est exécutée par l'outil (lecture seule, comme `scan.js#gitState`). | `test/status.test.js::the commit reminder never executes a git write command` |
| Given `--json`, when des fichiers sont modifiés, then `uncommitted: <n>` est exposé. | `test/status.test.js::status --json exposes uncommitted: <n>` |

## Commands

- Command: `npm test`
  - Expected: la suite complète passe.

## Rollback

Revert du commit de la story ; aucune migration de données hors champs additifs.
