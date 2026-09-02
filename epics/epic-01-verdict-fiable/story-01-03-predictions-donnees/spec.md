# Story 01.03 — Les prédictions deviennent des données

## Goal

Faire passer le journal de prédictions de la prose comptée au regex à un fichier de
données horodaté, source de vérité, dont `docs/plans/predictions.md` devient un rendu.

## User Value

Les prédictions sont aujourd'hui la seule chose de l'outil qui reste de la prose —
alors que tout le reste (ledger, évidences, deux ledgers cross-projet) est des
données validées. Conséquence directe : le comptage est faux dès qu'un tiret
cadratin manque, il est global au lieu d'être par phase, et l'ordre
« prédiction avant révélation » n'est vérifiable par rien.

## Context

Trois défauts constatés à l'audit :

1. `check.js#countJournalEntries` exige littéralement `—` (tiret cadratin) :
   `/^###\s+Phase\s+\d+\s+—\s+prédiction/gim`. Un `-` ordinaire donne « 0/6
   prédictions » sur un journal plein.
2. Le comptage somme `predictionsRequired` de **toutes** les phases et le compare au
   total du journal : six prédictions écrites sur la seule phase 0 satisfont trois
   phases.
3. Rien n'atteste que la prédiction a été écrite **avant** la révélation. C'est
   pourtant le seul endroit de l'outil où un ordre temporel est démontrable, puisque
   `verify` écrit déjà une évidence horodatée à chaque run.

Décision verrouillée le 2026-09-01 : **JSON source de vérité, `.md` généré**.

## Requirements

- [ ] Une commande enregistre une prédiction dans `.ai-learn/predictions.json`,
      horodatée, rattachée à une phase.
- [ ] `docs/plans/predictions.md` est régénéré depuis ce fichier, avec un marqueur de
      fichier généré.
- [ ] Un `predictions.md` personnalisé (sans le marqueur) n'est **jamais** écrasé —
      même convention que `AGENTS.md` et le README des solutions.
- [ ] Le comptage devient **par phase** et non plus global.
- [ ] Un projet existant sans `predictions.json` continue d'être compté depuis son
      `.md`, avec une tolérance sur le séparateur (`—`, `–`, `-`).
- [ ] Le fichier de données est versionné et validé structurellement, comme tout
      fichier de données du projet.
- [ ] L'échappatoire visible (`Corrigé par : IA`) est préservée et comptée depuis les
      données quand elles existent.

## Acceptance Criteria

- [ ] Given un projet scaffoldé, when une prédiction est enregistrée pour la phase 2, then `.ai-learn/predictions.json` contient une entrée horodatée rattachée à la phase 2.
- [ ] Given des prédictions enregistrées, when le rendu est régénéré, then `docs/plans/predictions.md` les contient toutes, dans l'ordre chronologique, et porte le marqueur de fichier généré.
- [ ] Given un `predictions.md` sans le marqueur de fichier généré, when le rendu est régénéré, then le fichier n'est pas écrasé et l'outil le signale.
- [ ] Given une phase 0 exigeant 2 prédictions et une phase 1 en exigeant 2, when 4 prédictions sont enregistrées toutes sur la phase 0 et que `ai-learn check` tourne, then la phase 1 est signalée comme manquant 2 prédictions.
- [ ] Given un projet hérité avec un `predictions.md` utilisant un tiret ordinaire et aucun `predictions.json`, when `ai-learn check` tourne, then les entrées sont comptées correctement.
- [ ] Given un `predictions.json` corrompu, when `ai-learn check` tourne, then une erreur structurelle est émise et le fichier n'est jamais silencieusement accepté.
- [ ] Given une prédiction marquée corrigée par l'IA, when `ai-learn check` tourne, then l'échappatoire est signalée comme aujourd'hui.

## Edge Cases

- [ ] Prédiction enregistrée pour une phase inexistante dans `progress.json`.
- [ ] Deux prédictions enregistrées dans la même milliseconde.
- [ ] Caractères spéciaux et retours à la ligne dans le texte d'une prédiction
      (le rendu markdown ne doit pas être cassé).
- [ ] Projet ayant à la fois un `predictions.json` et un `.md` hérité non vide —
      décider lequel fait foi et le documenter (défaut : le JSON).
- [ ] `predictionsRequired` absent ou à 0 sur une phase.
- [ ] Phase avec `predictionsRequired` mais aucune prédiction du tout.

## UX Notes

L'apprenant ne tape aucune commande : c'est l'agent qui enregistre la prédiction, au
moment du protocole, comme il lance déjà `ai-learn verify`. Le `.md` reste le
document lisible — sa régénération doit produire exactement le format déjà décrit
dans `templates/predictions.md`, pour que rien ne change à la lecture.

La perte assumée : le `.md` n'est plus éditable à la main. Elle doit être écrite dans
l'en-tête généré du fichier, pas découverte par un apprenant dont l'édition disparaît.

## Dependencies

- Dépendance : story 01.02 (chaîne séquentielle sur `check.js`).

## Out of Scope

- [ ] Juger la qualité ou l'honnêteté d'une prédiction — hors de portée par principe.
- [ ] Le blocage de `verify` sur les prédictions manquantes — story 01.04.
- [ ] Toute interface de saisie pour l'apprenant.
