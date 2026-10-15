# Story 05.02 — §1bis — format de synthèse ciblée

## Goal

Figer dans `AGENTS-apprentissage.md` le format de synthèse (§1bis) que l'apprenant a dû imposer : problème concret tiré de son code d'abord, mécanisme plutôt que vocabulaire, exemple partiel d'un domaine voisin, invitation à questionner, puis prédiction.

## Acceptance Criteria

- [ ] Given `templates/AGENTS-apprentissage.md`, when on cherche `1bis`, then la section existe, suit §1, et énumère les cinq étapes dans l'ordre.
- [ ] Given un projet scaffoldé par `ai-learn init`, when `AGENTS.md` est généré, then il contient §1bis (copie intégrale du template).
- [ ] Given la section, when on la lit, then elle impose que l'exemple voisin ne soit **jamais** le sujet exact de la prédiction.
- [ ] Given la suite de tests, when elle tourne, then un test garde la présence et l'ordre des sections numérotées du template.

## Implementation Context

Mode : `FAST` · scout pre-step : `no`

Fichiers probables :

- templates/AGENTS-apprentissage.md
- test/init.test.js ou nouveau test de structure du template

Ancres de recherche : `### 1.`, `### 2.`, `stressCheckpoint`

À éviter : bin/lib/** (hors test)

## Decisions

- Décision à prendre : le test de structure vérifie les ids de section et leur ordre, pas le texte — pour ne pas figer la prose.

## Tests

- Un test de structure du template (ids + ordre).

## Commands

- Command: `npm test`
  - Expected: la suite complète passe.

## Result
