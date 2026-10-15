# Plan — Story 05.01

## Implementation Context

Fichiers probables :

- bin/lib/predictions.js
- bin/lib/verify.js (section `predictions`)
- bin/lib/check.js
- templates/predictions.md
- templates/AGENTS-apprentissage.md §4 (lien)
- test/predictions.test.js
- test/verify.test.js

Ancres de recherche : `predictionsRequired`, `countJournalEntries`, `predictions.json`

Mode d'exécution : `STANDARD`

Scout pre-step : `no` — les points d'intégration sont nommés ci-dessus.

À éviter sauf nécessité : bin/lib/mutate.js, bin/lib/guard.js

## Decisions

- Décision à prendre : `predictionsRequired` accepte un entier (inchangé) **ou** un objet par type ; l'entier reste équivalent à « tous types ».
- Décision à prendre : le type par défaut d'une prédiction enregistrée sans `--type` est `code` (aucune migration de `predictions.json` existant).

## Test Plan

- [ ] Unit : normalisation entier→objet.
- [ ] Intégration `verify` : bloqué sans reality, passant avec.
- [ ] Régression : ancien format.

## Acceptance Traceability

| Acceptance criterion | Test proving it |
| --- | --- |
| Given `ai-learn predict --phase 0 --type reality`, when la prédiction … | `Unit : normalisation entier→objet.` (à nommer `file::test` au `/flow-run`) |
| Given `predictionsRequired: { code: 2, reality: 1 }` et aucune prédict… | `Intégration `verify` : bloqué sans reality, passant avec.` (à nommer `file::test` au `/flow-run`) |
| Given `predictionsRequired: 3` (nombre simple, ancien format), when `v… | `Régression : ancien format.` (à nommer `file::test` au `/flow-run`) |
| Given un projet sans `predictions.json`, when `verify` tourne, then ri… | `Régression : ancien format.` (à nommer `file::test` au `/flow-run`) |
| Given `check`, when une phase `done` n'a aucune prédiction `reality` a… | `Régression : ancien format.` (à nommer `file::test` au `/flow-run`) |

## Commands

- Command: `npm test`
  - Expected: la suite complète passe.

## Rollback

Revert du commit de la story ; aucune migration de données hors champs additifs.
