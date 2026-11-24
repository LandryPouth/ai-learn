# Plan — Story 14.01

## Implementation Context

Fichiers probables :

- bin/lib/predictions.js (`confidence`, `reasoning`, validation, refus au reveal, rendu, `calibrationSummary`)
- bin/lib/tutor.js (`predictions.confidence`), bin/lib/init.js (valeur par défaut des nouveaux projets)
- bin/lib/status.js, bin/lib/bilan.js (ligne et section)
- bin/ai-learn.js, templates/AGENTS-apprentissage.md, templates/predictions.md, README
- test/predictions.test.js, test/status.test.js, test/bilan.test.js, test/tutor.test.js

Ancres : `validatePredictionsData`, `revealPrediction`, `renderJournal`, `readingSummary`, `readTutorConfig`

Mode : `STANDARD` · scout pre-step : `no`

À éviter : la logique de comptage de `verify`.

## Decisions

- **Exigée seulement si `tutor.json` le dit** : un projet existant ne casse pas (règle de compatibilité de l'epic 01) ; `init` l'active pour les nouveaux.
- **Trois tranches, pas dix** : avec une dizaine de prédictions par parcours, dix tranches seraient vides.
- **Le raisonnement n'est pas noté** : le noter pousserait à écrire pour l'outil, pas pour penser (LearnHarness : « la pensée est la donnée primaire »).

## Test Plan

Fixtures de prédictions révélées avec et sans confiance ; `tutor.json` avec et sans la clé. Cas des critères, plus rendu `.md` et section du bilan.

## Acceptance Traceability

| Critère | Preuve |
|---|---|
| bornes | test/predictions.test.js::confidence outside 0-100 is refused |
| antériorité | test/predictions.test.js::confidence cannot be added at reveal |
| exigée | test/predictions.test.js::confidence is required when the tutor says so |
| compatibilité | test/predictions.test.js::legacy projects record without confidence |
| calibration | test/status.test.js::status shows calibration per confidence band |
| erreur confiante | test/status.test.js::status counts confident misses |
| raisonnement | test/predictions.test.js::the journal renders the reasoning |

## Commands

```
npm test
```
