# Story 06.03 — Budget de lecture déclaré et contrôlé

## Goal

Chaque phase déclare `readingBudgetMin` ; `check` avertit quand le digest de la phase dépasse ce budget (mots ÷ vitesse de lecture fixe), et `commands/learn.md` impose de planifier avec un digest plutôt qu'une liste de pointeurs.

## Acceptance Criteria

- [ ] Given une phase avec `readingBudgetMin: 30` et un digest de 12 000 mots, when `ai-learn check` tourne, then un warning donne le temps estimé et le budget.
- [ ] Given une phase sans `readingBudgetMin`, when `check` tourne, then aucun warning (rétro-compatible).
- [ ] Given `commands/learn.md`, when on le lit, then la génération du plan exige un digest par phase et interdit les listes de pointeurs vers de gros fichiers.
- [ ] Given `progress.json` avec le nouveau champ, when `validateProgress` tourne, then il l'accepte (entier positif) et rejette une valeur invalide.

## Implementation Context

Mode : `FAST` · scout pre-step : `no`

Fichiers probables :

- bin/lib/progress.js (`validateProgress`)
- bin/lib/check.js
- commands/learn.md
- test/check.test.js

Ancres de recherche : `validateProgress`, `predictionsRequired (patron de champ de phase)`

À éviter : bin/lib/verify.js

## Decisions

- Décision à prendre : vitesse de lecture constante documentée (200 mots/min) ; c'est un avertissement, jamais un blocage — le budget n'est pas une preuve.

## Tests

- Unit : validation du champ ; calcul du warning.

## Commands

- Command: `npm test`
  - Expected: la suite complète passe.

## Result
