# Plan — Story 13.04

## Implementation Context

Fichiers probables :

- bin/lib/predictions.js (`gapKinds` au reveal, validation)
- bin/lib/memory.js (source `weaknesses.json`, calcul « prouvée », rendu, ligne de fiche)
- bin/lib/review.js, bin/lib/incident.js (enregistrement des mécanismes manqués ; pondération du tirage)
- bin/lib/faults.js (identifiant stable par faute, s'il manque)
- bin/ai-learn.js (`--gap-kinds`), templates/AGENTS-apprentissage.md (§2), README
- test/predictions.test.js, test/memory.test.js, test/review.test.js, test/incident.test.js

Ancres : `pickSite`, `keepDetectableSite`, `revealPrediction`, `mechanism`, `random = Math.random`

Mode : `STANDARD` · scout pre-step : `no`

À éviter : la logique des niveaux de `break` (`chooseLevel`), le secret hors projet.

## Decisions

- **Seuil « 2 événements distincts »** : une erreur isolée n'est pas un motif (même règle que l'acceptation des préférences du vault : « vue plusieurs fois »).
- **Poids ×3, jamais exclusif** : garder la variété (alternance, LearnHarness) et éviter qu'un apprenant devine où chercher.
- **Vocabulaire fermé** : rend les catégories comparables entre projets ; `autre` absorbe le reste sans inventer.
- **Fenêtre de 90 jours** : une faiblesse ancienne non revue s'efface d'elle-même ; hypothèse à recalibrer.

## Test Plan

Graine fixée pour les tirages ; fixtures de katas et d'incidents résolus ; prédictions avec et sans `gapKinds` sur deux projets. Statistique de fréquence sur 1 000 tirages.

## Acceptance Traceability

| Critère | Preuve |
|---|---|
| valeur inconnue | test/predictions.test.js::unknown gap kinds are refused |
| faiblesse prouvée | test/memory.test.js::a gap kind seen twice becomes a proven weakness |
| seuil | test/memory.test.js::a single occurrence is not a weakness |
| pondération | test/review.test.js::proven weak mechanisms are drawn three times as often |
| inchangé sans faiblesse | test/incident.test.js::draws are unchanged without weaknesses |
| décroissance | test/memory.test.js::a later success decrements the weakness |

## Commands

```
npm test
```
