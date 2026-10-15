# Plan — Story 03.01

## Implementation Context

Fichiers probables :

- bin/lib/guard.js (`loadGuardConfig`, ≈87-104)
- bin/lib/platforms/codex-guard.js
- test/guard.test.js

Ancres de recherche : `learnerFiles`, `DEFAULT_LEARNER_FILES`, `matchesLearnerPath`, `loadGuardConfig`

Mode d'exécution : `STRICT`

Scout pre-step : `no` — les points d'intégration sont nommés ci-dessus.

À éviter sauf nécessité : bin/lib/mutate.js (lit `learnerFiles` — voir décision), bin/lib/norm.js

## Decisions

- Décision à prendre : la mutation et `norm` lisent `learnerFiles`. En dirigeant, `learnerFiles` désigne les tests : il faut un champ distinct `implementationFiles` (cible de la mutation) pour que `mutate` continue de muter `src/**` — **à trancher ici, avant d'écrire du code** (point de blocage connu de l'epic 02 : « la mutation ne teste jamais le code que l'apprenant n'a pas écrit »).
- Décision à prendre : le défaut est le mode le plus restrictif ; une config corrompue ne peut jamais ouvrir `src/**` à l'IA.

## Test Plan

- [ ] Matrice complète de décision du guard (unit).
- [ ] Intégration : `mode` corrompu → apprenti.
- [ ] Négatif : retirer le garde → le test de la matrice échoue.

## Acceptance Traceability

| Acceptance criterion | Test proving it |
| --- | --- |
| Given `guard.json` en mode `apprenti` (défaut, ou champ absent), when … | `Matrice complète de décision du guard (unit).` (à nommer `file::test` au `/flow-run`) |
| Given le mode `dirigeant`, when l'IA écrit dans `test/**` ou `checkpoi… | `Intégration : `mode` corrompu → apprenti.` (à nommer `file::test` au `/flow-run`) |
| Given un `guard.json` sans `mode` ou avec une valeur inconnue, when le… | `Négatif : retirer le garde → le test de la matrice échoue.` (à nommer `file::test` au `/flow-run`) |
| Given le mode `dirigeant`, when une commande git/gh est lancée par l'I… | `Négatif : retirer le garde → le test de la matrice échoue.` (à nommer `file::test` au `/flow-run`) |
| Given la matrice de décision du guard, when la suite de tests tourne, … | `Négatif : retirer le garde → le test de la matrice échoue.` (à nommer `file::test` au `/flow-run`) |

## Commands

- Command: `npm test`
  - Expected: la suite complète passe.

## Rollback

Revert du commit de la story ; aucune migration de données hors champs additifs.
