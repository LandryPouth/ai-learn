# Plan — Story 05.05

## Implementation Context

Fichiers probables :

- bin/lib/init.js (scaffold)
- bin/lib/predictions.js (type `transfert`, story 01)
- bin/lib/verify.js (section `proof`)
- bin/lib/check.js
- bin/lib/status.js
- templates/AGENTS-apprentissage.md
- test/init.test.js
- test/verify.test.js

Ancres de recherche : `ensureNormConfig (patron de config auto-créée)`, `predictionsRequired`, `countJournalEntries`

Mode d'exécution : `STANDARD`

Scout pre-step : `no` — les points d'intégration sont nommés ci-dessus.

À éviter sauf nécessité : bin/lib/guard.js, bin/lib/mutate.js

## Decisions

- Décision à prendre : l'assistance est un **protocole** (l'outil ne peut pas contraindre ce que dit l'IA) ; seule la preuve est mécanique. Le dire dans la doc plutôt que suggérer un blocage de l'aide.
- Décision à prendre : `transfert` réutilise le mécanisme de types de la story 01 (aucun compteur parallèle) ; l'antériorité prédiction < révélation s'applique.
- Décision à prendre : défaut `indices` + `explication` — l'apprenant du journal a dicté exactement ces règles en session ; `transfert` reste opt-in car plus coûteux.

## Test Plan

- [ ] Unit : validation de `tutor.json`.
- [ ] Intégration `verify` : bloqué sans `transfert`, passant avec ; non-régression `tests`.
- [ ] Négatif : retirer l'exigence de preuve → le test de blocage échoue.

## Acceptance Traceability

| Acceptance criterion | Test proving it |
| --- | --- |
| Given `ai-learn init`, when il scaffolde, then `.ai-learn/tutor.json` … | `test/tutor.test.js::validateTutorConfig names an unknown assistance or proof value`, `test/init.test.js::init writes .ai-learn/tutor.json with explicit defaults and never rewrites it` |
| Given `proof: "transfert"` et aucune prédiction de type `transfert` po… | `test/verify.test.js::verify blocks when proof is transfert and the phase has no transfert prediction`, `test/verify.test.js::verify marks done and records mastery transfert once the prediction exists` |
| Given `proof: "tests"`, when `verify` tourne, then le comportement act… | `test/verify.test.js::proof tests keeps the current behaviour and records tests mastery`, `test/init.test.js::the protocol documents the three assistance levels and reads tutor.json before each response`, `test/status.test.js::statusCommand shows the active tutor profile on one line`, `test/check.test.js::check errors on an unknown tutor assistance or proof value`, `test/verify.test.js::a project without tutor.json keeps the current behaviour and records the default mastery` |
| Given `AGENTS-apprentissage.md`, when on le lit, then un paragraphe dé… | `test/verify.test.js::proof tests keeps the current behaviour and records tests mastery`, `test/init.test.js::the protocol documents the three assistance levels and reads tutor.json before each response`, `test/status.test.js::statusCommand shows the active tutor profile on one line`, `test/check.test.js::check errors on an unknown tutor assistance or proof value`, `test/verify.test.js::a project without tutor.json keeps the current behaviour and records the default mastery` |
| Given `ai-learn status`, when il tourne, then le profil actif est affi… | `test/verify.test.js::proof tests keeps the current behaviour and records tests mastery`, `test/init.test.js::the protocol documents the three assistance levels and reads tutor.json before each response`, `test/status.test.js::statusCommand shows the active tutor profile on one line`, `test/check.test.js::check errors on an unknown tutor assistance or proof value`, `test/verify.test.js::a project without tutor.json keeps the current behaviour and records the default mastery` |
| Given l'évidence, when `verify` réussit, then elle enregistre séparéme… | `test/verify.test.js::proof tests keeps the current behaviour and records tests mastery`, `test/init.test.js::the protocol documents the three assistance levels and reads tutor.json before each response`, `test/status.test.js::statusCommand shows the active tutor profile on one line`, `test/check.test.js::check errors on an unknown tutor assistance or proof value`, `test/verify.test.js::a project without tutor.json keeps the current behaviour and records the default mastery` |

## Commands

- Command: `npm test`
  - Expected: la suite complète passe.

## Rollback

Revert du commit de la story ; aucune migration de données hors champs additifs.
