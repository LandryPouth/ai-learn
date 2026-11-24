# Plan — Story 13.06

## Implementation Context

Fichiers probables :

- bin/lib/memory-experiments.js (nouveau : démarrage, affectation, métriques, rapport)
- bin/lib/predictions.js (déclencher l'affectation à la première prédiction d'une phase)
- bin/lib/next.js (`experiment` dans `--json`)
- bin/lib/revisit.js, bin/lib/incident.js (lecture seule des résultats pour les métriques)
- bin/lib/memory.js (rendu `experiments/<id>.md`)
- commands/learn-next.md (appliquer la variante), README
- test/memory-experiments.test.js, test/next.test.js

Ancres : `recordPrediction`, `revisitState`, `kataOffer`, `predictionTypeOf`

Mode : `STANDARD` · scout pre-step : `no`

À éviter : la notation des prédictions.

## Decisions

- **Deux apprenants, données séparées** : chaque machine garde ses expériences ; la mise en commun passe par un export anonymisé importé à la demande (`--with`), jamais par le vault (privé au mainteneur). Résultat affiché par apprenant pour ne pas confondre un effet individuel avec un effet du protocole.

- **Affectation par phase, pas par prédiction** : les métriques sont des résultats de phase (revisite, transfert, incident) ; alterner dans une même phase mélangerait les causes.
- **Hypothèse : seuil 6 phases par variante.** Un parcours fait 8 à 15 phases ; une expérience couvre donc un parcours entier. Honnête : c'est lent, et c'est le prix d'une mesure sur une seule personne.
- **La note /10 exclue des métriques** : c'est l'agent qui la donne, il pourrait la gonfler sans le vouloir (loi de Goodhart).
- **Pas de verdict sous 10 points d'écart** : en dessous, le bruit (difficulté inégale des phases) domine.

## Test Plan

Horloge et home injectés ; fixtures de phases avec revisites réussies/ratées, prédictions `transfert`, incidents. Cas : unicité, alternance, `next --json`, métrique refusée, seuil, écart faible, calibration indisponible.

## Acceptance Traceability

| Critère | Preuve |
|---|---|
| deux apprenants | test/memory-experiments.test.js::an imported export adds phases and keeps per-learner results |
| export différent | test/memory-experiments.test.js::a mismatched export is refused |
| anonymisé | test/memory-experiments.test.js::an export carries no alias path or prediction text |
| unicité | test/memory-experiments.test.js::only one experiment runs at a time |
| alternance | test/memory-experiments.test.js::phases alternate between variants |
| next | test/next.test.js::next --json carries the phase variant |
| métrique refusée | test/memory-experiments.test.js::the self-given score is not a metric |
| seuil | test/memory-experiments.test.js::no conclusion below the sample threshold |
| écart faible | test/memory-experiments.test.js::a small gap names no winner |
| calibration | test/memory-experiments.test.js::calibration needs confidence data |

## Commands

```
npm test
```
