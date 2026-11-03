# Plan — Story 11.01

## Implementation Context

Fichiers probables :

- bin/lib/predictions.js (champ `by`, validation, refus d'ordre, exclusion du décompte, rendu `.md`)
- bin/lib/incident.js (`resolve`/`giveup` : choix des deux prédictions, double comparaison)
- bin/lib/tracks/debug.js (`secondOpinion` optionnel + `recordSecondOpinion` idempotent)
- bin/lib/status.js (ligne « second avis »)
- bin/lib/ledgers.js (si `--repair` réécrit la forme : tolérer le champ)
- bin/ai-learn.js (drapeau `--by`)
- templates/AGENTS-apprentissage.md (§3sexies), commands/learn-break.md, README.md
- test/predictions.test.js, test/incident.test.js, test/tracks-debug.test.js, test/status.test.js

Ancres : `PREDICTION_TYPES`, `predictionTypeOf`, `countByType`, `EXACT_LINE_TOLERANCE`, `recordDebugTiers`, `validateDebugTracks`, `REQUIRED_TIER_IDS`

Mode : `STANDARD` · scout pre-step : `no`

À éviter : la logique de tirage et d'injection de `incident.js` (story 11.02).

## Decisions

- **L'IA enregistre elle-même son hypothèse via le CLI.** Elle exécute déjà les commandes `ai-learn` ; le champ `by: ia` est déclaratif, mais la comparaison est mécanique. Alternative écartée : un verdict « juste / plausible / à côté » saisi à la main, qui mesurerait une opinion.
- **Ordre vérifié, pas supposé** : l'horodatage de la prédiction IA doit suivre celui de la prédiction de l'apprenant dans le même incident.
- **Pas de nouveau palier** : `secondOpinion` est une statistique, pas une compétence acquise une fois pour toutes. Un palier « battre l'IA » récompenserait une IA faible.
- **Comparaison factorisée** : la fonction qui calcule `exact`/`fichier`/`manqué` sert aux deux prédictions, sans copie.

## Test Plan

Rouge d'abord, projets temporaires comme `test/incident.test.js` (générateur fixé) : refus sans incident, refus sans prédiction apprenant, refus d'une seconde prédiction IA, double comparaison au resolve, idempotence du compteur, exclusion de `predictionsRequired`, ledger ancien valide, ligne `status`.

## Acceptance Traceability

| Critère | Preuve |
|---|---|
| sans incident | test/predictions.test.js::an ai debug prediction needs an active incident |
| ordre | test/predictions.test.js::the learner predicts before the ai |
| une seule | test/predictions.test.js::a second ai prediction for the same incident is refused |
| double comparaison | test/incident.test.js::resolve compares learner and ai predictions to the real site |
| idempotence | test/tracks-debug.test.js::second opinion is counted once per incident |
| décompte | test/predictions.test.js::ai predictions never satisfy predictionsRequired |
| ledger ancien | test/tracks-debug.test.js::a ledger without secondOpinion stays valid |
| status | test/status.test.js::status shows the second opinion line |

## Commands

```
npm test
```
