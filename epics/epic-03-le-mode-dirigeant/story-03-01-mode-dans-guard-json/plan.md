# Plan — Story 03.01

## Implementation Context

Fichiers :

- bin/lib/guard.js (`loadGuardConfig`, `validateGuardConfig`, `decide`, `ensureGuardHook`)
- bin/lib/platforms/codex-guard.js
- bin/lib/source-hash.js, bin/lib/mutate.js, bin/lib/norm.js (consommateurs de `implementationFiles`)
- bin/lib/check.js (signale un `guard.json` invalide)
- test/guard.test.js, test/verdict.test.js, test/norm.test.js, test/mutate.test.js

Ancres de recherche : `learnerFiles`, `implementationFiles`, `DEFAULT_LEARNER_FILES`, `matchesLearnerPath`, `loadGuardConfig`

Mode d'exécution : `STRICT`

Scout pre-step : `no` — les points d'intégration sont nommés ci-dessus.

## Decisions

- **Résolu — inversion portée par le mode.** `loadGuardConfig` résout `mode` puis dérive `learnerFiles` : en `dirigeant` la valeur couvre toutes les conventions de test reconnues par `scan.js#detectTests` (`test/**`, `tests/**`, `__tests__/**`, `*.test.*`, `*.spec.*`, `test_*`, `*_test.*`, etc.) plus `checkpoint/**` — le `learnerFiles` stocké est ignoré, pour qu'une inversion à moitié appliquée soit impossible ; en `apprenti` le comportement existant est inchangé.
- **Résolu — cible de mutation distincte.** Un champ `implementationFiles` est introduit dans `loadGuardConfig`, **dérivé du mode uniquement** : en `dirigeant` il vaut `["src/**"]` (l'implémentation que l'IA écrit), en `apprenti` il suit `learnerFiles` (un projet scopé sur `lib/**` ne doit pas se mettre à muter `src/**`). Une valeur stockée est ignorée : elle survivrait à un changement de mode et pointerait silencieusement les consommateurs sur la mauvaise moitié du projet. Il n'est **pas écrit** dans le `guard.json` généré. Les trois consommateurs (`mutate.js`, `norm.js`, `source-hash.js`) **lisent ce champ** : laissé en `learnerFiles`, `source-hash.js` aurait fait porter l'empreinte de preuve sur la spécification, donc une modification de l'implémentation n'aurait plus périmé une évidence `done` (régression d'epic 01). Ce branchement, d'abord prévu en suivi, est livré ici (revue).
- **Résolu — un `guard.json` invalide est signalé.** `validateGuardConfig`/`guardConfigIssues` suivent la convention des fichiers de données ; `check` émet un warning pour un `mode` inconnu, une version inattendue ou un champ mal typé. Le guard lui-même reste fail-safe et silencieux : un mode inconnu retombe sur `apprenti`.
- **Résolu — le texte suit le mode.** Les raisons de refus, le README généré de `docs/solutions/` et le profil Codex sont dérivés du mode : en dirigeant, l'IA lit « spécification de l'apprenant, écris `src/**` » et non « dépose le code de révélation ».
- **Résolu — le défaut est le plus restrictif.** Seul le littéral exact `"dirigeant"` sélectionne le mode inverse. Toute autre valeur (absente, mal orthographiée, non-chaîne, config corrompue) résout vers `apprenti` : une config cassée ne peut jamais ouvrir `src/**` à l'IA.

## Test Plan

- [x] Matrice complète de décision du guard (unit) — `test/guard.test.js`.
- [x] Intégration : `mode` corrompu → apprenti — `test/guard.test.js`.
- [x] Négatif : retirer le garde (forcer `mode = apprenti`) → le test de la matrice échoue (vérifié manuellement : `fail 1` avec le garde retiré, `fail 0` restauré).
- [x] Consommateurs : `computeSourceHash`, `findAllSites` et `normProject` visent `implementationFiles` — tests dédiés dans `test/verdict.test.js`, `test/mutate.test.js`, `test/norm.test.js`.
- [x] Câblage : `ensureGuardHook` écrit `mode: "apprenti"`, préserve un mode existant, inverse le profil Codex et le README généré en dirigeant.
- [x] Config invalide : `validateGuardConfig` + warning `check` sur un mode inconnu.

## Acceptance Traceability

| Acceptance criterion | Test proving it |
| --- | --- |
| Given `guard.json` en mode `apprenti` (défaut, ou champ absent), when … | `test/guard.test.js` :: `mode apprenti (défaut) : src/** bloqué, test/** et checkpoint/** autorisés — non-régression` |
| Given le mode `dirigeant`, when l'IA écrit dans `test/**` ou `checkpoi… | `test/guard.test.js` :: `mode dirigeant : l'IA écrit src/** (autorisé) et ne touche plus à test/** ni checkpoint/** (bloqués)` |
| Given un `guard.json` sans `mode` ou avec une valeur inconnue, when le… | `test/guard.test.js` :: `mode inconnu, absent ou non-chaîne retombe sur apprenti — jamais le mode le plus permissif` |
| Given le mode `dirigeant`, when une commande git/gh est lancée par l'I… | `test/guard.test.js` :: `matrice de décision du guard : git/gh reste bloqué dans les deux modes (§3bis inchangé)` |
| Given la matrice de décision du guard, when la suite de tests tourne, … | `test/guard.test.js` :: `matrice de décision du guard : chaque case {mode} × {src, test, checkpoint} est couverte` |

## Commands

- Command: `npm test`
  - Expected: la suite complète passe.

## Rollback

Revert du commit de la story ; aucune migration de données hors champs additifs.
