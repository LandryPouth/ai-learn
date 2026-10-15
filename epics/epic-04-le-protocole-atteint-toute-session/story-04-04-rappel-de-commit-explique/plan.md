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

- Décision à prendre : le texte explicatif de la commande vit à un seul endroit (une fonction `explainCommitCommand`) partagée par `verify` et le rappel — pas de copie.
- Décision à prendre : `git status --porcelain` via `spawnGit` isolé (`gitIsolatedEnv`) — le correctif du pre-push corrompant le dépôt est justement là pour ça.

## Test Plan

- [ ] Unit : parsing porcelain (modifié, non suivi, vide).
- [ ] Intégration : dépôt temporaire propre/sale.

## Acceptance Traceability

| Acceptance criterion | Test proving it |
| --- | --- |
| Given un projet avec des fichiers modifiés, when `ai-learn status` tou… | `Unit : parsing porcelain (modifié, non suivi, vide).` (à nommer `file::test` au `/flow-run`) |
| Given la commande suggérée, when elle s'affiche (rappel ou clôture de … | `Intégration : dépôt temporaire propre/sale.` (à nommer `file::test` au `/flow-run`) |
| Given un arbre propre ou un dossier non-git, when `status` tourne, the… | `Intégration : dépôt temporaire propre/sale.` (à nommer `file::test` au `/flow-run`) |
| Given le rappel, when il est affiché, then aucune commande git d'écrit… | `Intégration : dépôt temporaire propre/sale.` (à nommer `file::test` au `/flow-run`) |
| Given `--json`, when des fichiers sont modifiés, then `uncommitted: <n… | `Intégration : dépôt temporaire propre/sale.` (à nommer `file::test` au `/flow-run`) |

## Commands

- Command: `npm test`
  - Expected: la suite complète passe.

## Rollback

Revert du commit de la story ; aucune migration de données hors champs additifs.
