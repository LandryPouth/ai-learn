# Plan — Story 09.07

## Implementation Context

Fichiers probables :

- bin/lib/verify.js, bin/lib/next.js, bin/lib/status.js, bin/lib/init.js, bin/ai-learn.js (messages, prochaine action, aide)
- bin/lib/check.js (`pending` → information)
- bin/lib/docs.js (étape + délai dans l'erreur de clone)
- bin/lib/mutate.js (annonce avant la boucle)
- bin/lib/predictions.js (sélection « À revoir »)
- bin/lib/update.js, bin/lib/progress.js (`toolVersion`)
- commands/learn-next.md (mise à niveau automatique)
- docs/QUICKSTART.md, docs/DOGFOODING.md
- hors dépôt, lignes `Statut` seulement : `~/dev/learning/tech-experiments/{fastify-traducteur-api,mini-redis-cpp,tradelog-postgres-lab}/.ai-learn/dogfood.md`
- test/verify.test.js, test/next.test.js, test/status.test.js, test/check.test.js, test/docs.test.js, test/messages.test.js (nouveau)

Ancres : `Verifying phase`, `marked done`, `demoted`, `When it passes`, `consignée dans docs/plans/predictions.md`, `missing predictions in the journal is a warning`, `git sparse clone failed`, `failureDetail`

Mode : `STANDARD` · scout pre-step : `no`

À éviter : changer une clé `--json` ; réécrire le texte des entrées de friction.

## Decisions

- **Revenir sur l'avertissement des phases `pending`** : la story d'origine voulait des prédictions « au fil de l'eau ». C'est gardé pour la phase en cours ; pour les phases futures, l'avertissement était du bruit permanent (5 sur 7 sur le seul projet réel).
- **`failureDetail` existe déjà** pour `--stale` : la prochaine action le réutilise au lieu d'un second calcul.
- **Mise à niveau par `/learn-next`** : cohérent avec l'epic 10 (machinerie) ; l'apprenant ne retient pas `update`.
- **« À revoir » déterministe** : seuil de note plutôt que regroupement de textes libres (les `weaknesses` ne se recoupent pas mot pour mot).
- **Clore après rejeu** : une entrée n'est marquée résolue qu'après rejeu sur une copie du projet, pas sur la foi d'une story `done`.

## Test Plan

Test de messages (liste de chaînes anglaises interdites dans les sorties texte) ; prochaine action par type d'échec ; `check` avec phases `pending` ; erreur de clone simulée (statut nul, stderr vide) ; « À revoir » ; `toolVersion` absent / égal / supérieur.

## Acceptance Traceability

| Critère | Preuve |
|---|---|
| prochaine action | test/verify.test.js::a failed verify ends with the next action |
| une langue | test/messages.test.js::learner-facing output has no known English strings |
| next predict | test/next.test.js::next points to ai-learn predict |
| bruit pending | test/check.test.js::pending phases without predictions are one info line |
| clone git | test/docs.test.js::a timed-out sparse fetch names the step and suggests --regen |
| à revoir | test/status.test.js::status lists flash notes of low-scored predictions |
| outdated | test/next.test.js::next reports an outdated scaffold until update |
| learn-next | test/commands.test.js::learn-next runs update when outdated |
| aide | test/cli.test.js::help lists transfert and init --dir |
| dogfood clos | Result (diff des lignes Statut + DOGFOODING.md) |

## Commands

```
npm test
```
