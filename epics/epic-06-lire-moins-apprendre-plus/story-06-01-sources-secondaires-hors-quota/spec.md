# Story 06.01 — Sources secondaires hors quota

## Goal

`ai-learn docs add --secondary <nom> <url|chemin>` ajoute une 4e source légère hors du quota de 3, citable `fichier:ligne` mais exclue de la banque de pièges ; l'erreur de plafond oriente vers cette option.

## Risk

Manifeste des sources : additif.

## Acceptance Criteria

- [ ] Given trois sources principales, when `docs add --secondary docker <url>` tourne, then la source est embarquée et listée comme secondaire (`docs list` distingue 3/3 principales + secondaires).
- [ ] Given le plafond atteint, when `docs add <nom>` sans `--secondary` tourne, then l'erreur propose explicitement `--secondary`.
- [ ] Given une source secondaire, when `ai-learn traps` tourne, then elle n'alimente pas la banque de pièges.
- [ ] Given une source secondaire, when `docs digest` (story 02) ou une citation la vise, then `fichier:ligne` fonctionne comme pour une principale.
- [ ] Given `docs add --secondary` sans nom ou source, when il tourne, then erreur d'usage claire, aucune écriture.

## Edge Cases

- [ ] Aucun cas limite propre à cette story au-delà des critères.

## Out of Scope

- [ ] bin/lib/scan.js
- [ ] propose.js
