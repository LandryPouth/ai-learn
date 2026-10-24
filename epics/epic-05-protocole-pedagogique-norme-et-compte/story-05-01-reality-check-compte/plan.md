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

- `predictionsRequired` accepte un entier (inchangé) **ou** un objet par type ; l'entier reste équivalent à « tous types ». `normalizePredictionsRequired` est la seule lecture de ce champ, partagée par `verify` et `check`.
- Le type par défaut d'une prédiction enregistrée sans `--type` est `code` (aucune migration de `predictions.json` existant). Une entrée antérieure sans `type` est comptée `code`.
- Types valides : `code`, `casse`, `reality`. Un `--type` inconnu est refusé ; un `type` inconnu dans `predictions.json` rend le fichier corrompu (jamais accepté en silence).
- Un objet de requirement est sommé pour le total (`{code:2, reality:1}` → 3), et le manque est calculé par type : `missing` est la somme des types courts, jamais `total - count`, pour qu'un excédent d'un type ne masque pas le manque d'un autre.
- `next` normalise l'affichage (total + ventilation) : un objet n'y produit jamais `[object Object]`.

## Test Plan

- [x] Unit : normalisation entier→objet.
- [x] Intégration `verify` : bloqué sans reality, passant avec.
- [x] Régression : ancien format.

## Acceptance Traceability

| Acceptance criterion | Test proving it |
| --- | --- |
| Given `ai-learn predict --phase 0 --type reality`, when la prédiction … | `test/cli.test.js::predict --type reality records the type end to end and renders it in the journal` ; `test/predictions.test.js::recording a --type reality prediction stores the type and renders it in the journal` |
| Given `predictionsRequired: { code: 2, reality: 1 }` et aucune prédict… | `test/verify.test.js::verify blocks when a required reality prediction is missing, naming the type and its real/expected count` ; `test/verify.test.js::verify marks done once every required prediction type is covered` |
| Given `predictionsRequired: 3` (nombre simple, ancien format), when `v… | `test/verify.test.js::an integer predictionsRequired still counts every type together (legacy format unchanged)` ; `test/predictions.test.js::predictionsReport: an integer requirement ignores types and keeps counting them all together` |
| Given un projet sans `predictions.json`, when `verify` tourne, then ri… | `test/verify.test.js::verify never blocks a legacy project with no predictions.json at all, even with predictionsRequired set` ; `test/predictions.test.js::predictionsReport: a legacy project with no predictions.json at all never blocks, regardless of predictionsRequired` |
| Given `check`, when une phase `done` n'a aucune prédiction `reality` a… | `test/check.test.js::check signals a done phase missing its required reality prediction` |

## Commands

- Command: `npm test`
  - Expected: la suite complète passe.

## Rollback

Revert du commit de la story ; aucune migration de données hors champs additifs.
