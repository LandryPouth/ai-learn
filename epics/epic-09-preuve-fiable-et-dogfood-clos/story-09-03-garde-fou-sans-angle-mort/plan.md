# Plan — Story 09.03

## Implementation Context

Fichiers probables :

- bin/lib/guard.js (`PROTECTED_FILES`, `protectedPathReason`, réparation du chemin mort dans `ensureGuardHook`)
- bin/lib/norm.js (même réparation pour `norm --hook`)
- bin/lib/platforms/opencode-guard.js, bin/lib/platforms/codex-guard.js (chemin du plugin/profil)
- bin/lib/predictions.js (`recordPrediction` sans révélation, `revealPrediction`)
- bin/ai-learn.js (`predict --reveal`, aide `--type` complète)
- bin/lib/check.js (hook mort = erreur ; prédiction non révélée ; « après coup »)
- templates/AGENTS-apprentissage.md (§2 : ordre predict → feedback → reveal)
- test/guard.test.js, test/predictions.test.js, test/check.test.js, test/update.test.js

Ancres : `PROTECTED_FILES`, `isOwnGuardCommand`, `guardHookCommand`, `NORM_HOOK_MARKER`, `revealedAt`, `anomalies`

Mode : `STRICT` · scout pre-step : `no`

À éviter : la grammaire shell de `guard.js` (on ajoute des chemins, pas de détecteurs).

## Decisions

- **Protéger les réglages plutôt que les surveiller** : contrairement à `progress.json`, l'IA n'a aucune raison légitime de les écrire ; un mur ne coûte rien à l'usage.
- **Deux temps plutôt qu'une signature** : l'outil ne peut pas prouver que la prédiction vient de l'apprenant ; il peut prouver qu'elle a été écrite avant la révélation. C'est la limite déjà assumée par AGENTS §2, rendue vérifiable.
- **Hook mort = erreur** : un garde-fou affiché actif alors qu'il est éteint est un verdict faux, la classe de défaut la plus grave pour cet outil.

## Test Plan

Cas guard (Write, Edit, Bash redirection, `tee`, `cp`) sur les 4 fichiers ; `predict` en deux temps (compte, id inconnu, rétro-compat) ; `check` sur hook mort (guard, norm), réparation par `update`, conservation d'une installation vivante.

## Acceptance Traceability

| Critère | Preuve |
|---|---|
| mur Write | test/guard.test.js::tuning files are a wall for the AI |
| haie Bash | test/guard.test.js::shell writes to tuning files are denied |
| predict sans reveal | test/predictions.test.js::a prediction recorded before reveal counts |
| reveal | test/predictions.test.js::reveal stamps revealedAt and refuses unknown ids |
| après coup | test/check.test.js::one-step predictions are reported as recorded after the fact |
| non révélée | test/check.test.js::a prediction left unrevealed for a week is warned |
| hook mort | test/check.test.js::a hook pointing at a missing script fails check |
| réparation | test/update.test.js::update repoints a dead hook to the current tool |
| installation vivante | test/update.test.js::update keeps a hook pointing at another live install |

## Commands

```
npm test
```
