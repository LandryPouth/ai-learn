# Story 06.03 — Budget de lecture déclaré et contrôlé

## Goal

Chaque phase déclare `readingBudgetMin` ; `check` avertit quand le digest de la phase dépasse ce budget (mots ÷ vitesse de lecture fixe), et `commands/learn.md` impose de planifier avec un digest plutôt qu'une liste de pointeurs.

## Acceptance Criteria

- [x] Given une phase avec `readingBudgetMin: 30` et un digest de 12 000 mots, when `ai-learn check` tourne, then un warning donne le temps estimé et le budget.
- [x] Given une phase sans `readingBudgetMin`, when `check` tourne, then aucun warning (rétro-compatible).
- [x] Given `commands/learn.md`, when on le lit, then la génération du plan exige un digest par phase et interdit les listes de pointeurs vers de gros fichiers.
- [x] Given `progress.json` avec le nouveau champ, when `validateProgress` tourne, then il l'accepte (entier positif) et rejette une valeur invalide.

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

- **Vitesse de lecture constante : 200 mots/min**, documentée dans `check.js`
  (`READING_WORDS_PER_MINUTE`). Le budget produit un **avertissement**, jamais un
  blocage : ce n'est pas une preuve, seulement un garde-fou contre la relecture
  de fichiers entiers.
- **Un `readingBudgetMin` malformé est une erreur**, pas un warning : sinon
  `check` sauterait son avertissement de dépassement en silence.

## Tests

- Unit : validation du champ ; calcul du warning.

## Commands

- Command: `npm test`
  - Expected: la suite complète passe.

## Result

- **Changed**: `bin/lib/progress.js` valide `readingBudgetMin` (entier positif,
  sinon erreur) ; `bin/lib/check.js` estime le temps de lecture du digest
  (`mots ÷ 200`) et avertit au-delà du budget déclaré ; `commands/learn.md`
  documente `sections`/`readingBudgetMin` et impose « Lire un extrait, pas des
  pointeurs » (interdit les listes de pointeurs vers de gros fichiers).
- **Tests**: `npm test` — 715 tests verts. `test/check.test.js` couvre
  dépassement, absence de budget, budget respecté, validation du champ ;
  `test/docs.test.js` vérifie les exigences de `commands/learn.md`.
- **Traceability**:
  - dépassement: `test/check.test.js::check warns when a phase digest exceeds its declared reading budget`
  - rétro-compatibilité: `test/check.test.js::a phase without readingBudgetMin keeps check silent about reading time`
  - budget respecté: `test/check.test.js::a digest within its reading budget stays silent`
  - validation: `test/check.test.js::readingBudgetMin accepts a positive integer and rejects anything else`
  - `commands/learn.md`: `test/docs.test.js::the learn command requires a per-phase digest and forbids pointer lists`

## Status: done
