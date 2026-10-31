# Spec — Story 09.07 — Des sorties qui guident, un dogfood clos

## User Value

L'apprenant lit chaque sortie de l'outil dans une seule langue, sait toujours quelle est la prochaine action, ne voit plus d'avertissements pour des phases qu'il n'a pas commencées, et retrouve ce qu'il a eu du mal à comprendre. Un projet scaffoldé avec une ancienne version se met à niveau sans qu'il ait à y penser. Les journaux de friction de `tech-experiments` disent, entrée par entrée, ce qui a été corrigé.

## Requirements

- **Une langue** : toutes les lignes destinées à l'apprenant dans `verify`, `next`, `status`, `init` et les erreurs du CLI sont en français (ex. « Verifying phase », « marked done », « demoted », « No phase », « All N/N phases done », « When it passes, prove it »). Les clés `--json` ne changent pas.
- **Une prochaine action** : quand `verify` échoue, la dernière ligne est « → Prochaine action : <remède du premier contrôle en échec> » (checkpoint, zéro test, norme, artefact, prédiction, mutation, transfert).
- **`next` à jour** : renvoie vers `ai-learn predict` (deux temps, story 09.03), plus vers une édition manuelle de `docs/plans/predictions.md`.
- **Moins de bruit** : `check` n'avertit plus pour les prédictions des phases `pending` ; une seule ligne d'information les résume. Les phases `in_progress` et `done` gardent l'avertissement.
- **`docs add` en clone git** : en échec, nommer l'étape (`remote`, `sparse-checkout`, `fetch`…), afficher « délai de 180 s dépassé » quand le processus a été tué sans sortie, et proposer `--regen`.
- **Mutation** : avant la boucle, « Mutation : N mutants — ne modifie pas tes fichiers pendant ce temps (restauration automatique) ».
- **Aide et doc** : `predict --type` liste `transfert` ; l'usage d'`init` montre `--dir` ; `docs/QUICKSTART.md` décrit le parcours par `/learn` (plus d'édition manuelle de `progress.json`).
- **À revoir** : `status` affiche « À revoir » : le `flash` des 3 prédictions révélées les plus récentes notées sous 7/10 (rien si aucune).
- **Mise à niveau automatique** : `init`/`update` écrivent `toolVersion` dans `progress.json` ; `next --json` expose `outdated: true` quand il est absent ou inférieur à la version de l'outil ; `/learn-next` lance alors `ai-learn update` avant toute autre action, et le dit en une ligne.
- **Dogfood clos** (après livraison des stories 09.01-09.07) :
  - Dans `fastify-traducteur-api/.ai-learn/dogfood.md`, chaque entrée porte une ligne `Statut (date) : résolu — <story>` ou `ouvert — <raison>` ; les entrées résolues par les epics 04-07 sont rejouées sur une copie avant d'être marquées.
  - Mêmes lignes pour `mini-redis-cpp` (`init --project`, story 09.04) et `tradelog-postgres-lab` (`docs add` clone git, cette story).
  - `docs/DOGFOODING.md` : la section « Remontées du projet fastify-traducteur-api » est mise à jour (résolutions réelles, y compris 07-03 rouverte puis fermée par 09.05) ; une section pour les deux autres projets.

## Acceptance Criteria

- [x] Given un échec de `verify` sur la norme seule, when on lit la sortie, then la dernière ligne commence par « → Prochaine action : » et cite la commande `ai-learn norm`.
- [x] Given les sorties texte de `verify`, `next`, `status`, `init` sur une fixture, when un test cherche une liste de chaînes anglaises connues, then aucune n'apparaît.
- [x] Given une phase qui exige des prédictions, when `ai-learn next`, then la sortie cite `ai-learn predict` et ne demande pas d'éditer `predictions.md`.
- [x] Given 5 phases `pending` sans prédictions, when `check`, then 0 avertissement pour elles et une ligne d'information unique.
- [x] Given un `fetch` git tué par le délai sans stderr, when `docs add` échoue, then le message nomme `fetch`, le délai, et `--regen`.
- [x] Given 3 prédictions révélées notées 4/10, 6/10, 9/10, when `status`, then « À revoir » liste les `flash` des deux premières.
- [x] Given un projet sans `toolVersion`, when `next --json`, then `outdated: true` ; after `update`, then `outdated: false`.
- [x] Given `commands/learn-next.md`, when on le lit, then il lance `ai-learn update` quand `outdated` est vrai, avant le reste.
- [x] Given `predict --help` et l'usage, when on les lit, then `transfert` et `init --dir` y figurent.
- [x] Given les trois journaux de friction, when on les relit, then plus aucune entrée n'est sans statut, et `DOGFOODING.md` reprend chaque résolution avec la story.

## Edge Cases

- Sortie `--json` : inchangée (consommée par les agents).
- `toolVersion` plus récent que l'outil (projet ouvert avec une vieille installation) : avertir, ne rien rétrograder.
- Journaux de friction : ce sont des fichiers d'autres dépôts ; ne modifier que les lignes `Statut`, jamais le texte des entrées.

## Out of Scope

- Traduire les messages internes du hook guard (déjà en français) ou les commentaires du code.
- Décider du sort des 6 parcours dormants.
