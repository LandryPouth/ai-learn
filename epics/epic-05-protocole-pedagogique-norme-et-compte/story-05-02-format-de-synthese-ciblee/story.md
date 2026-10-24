# Story 05.02 — §1bis — format de synthèse ciblée

## Status: done

## Goal

Figer dans `AGENTS-apprentissage.md` le format de synthèse (§1bis) que l'apprenant a dû imposer : problème concret tiré de son code d'abord, mécanisme plutôt que vocabulaire, exemple partiel d'un domaine voisin, invitation à questionner, puis prédiction.

## Acceptance Criteria

- [x] Given `templates/AGENTS-apprentissage.md`, when on cherche `1bis`, then la section existe, suit §1, et énumère les cinq étapes dans l'ordre.
- [x] Given un projet scaffoldé par `ai-learn init`, when `AGENTS.md` est généré, then il contient §1bis (copie intégrale du template).
- [x] Given la section, when on la lit, then elle impose que l'exemple voisin ne soit **jamais** le sujet exact de la prédiction.
- [x] Given la suite de tests, when elle tourne, then un test garde la présence et l'ordre des sections numérotées du template.

## Implementation Context

Mode : `FAST` · scout pre-step : `no`

Fichiers probables :

- templates/AGENTS-apprentissage.md
- test/init.test.js ou nouveau test de structure du template

Ancres de recherche : `### 1.`, `### 2.`, `stressCheckpoint`

À éviter : bin/lib/** (hors test)

## Decisions

- Le test de structure vérifie les ids de section et leur ordre, pas le texte — pour ne pas figer la prose. §1bis est placée entre §1 et §2 ; les cinq étapes sont vérifiées comme liste ordonnée (structure), pas mot à mot.
- L'exemple « voisin » est explicitement partiel et jamais le sujet exact (ni la même brique, ni une réponse du projet, ni une solution recopiable) ; il calibre la forme, pas le contenu.

## Tests

- `test/init.test.js::the protocol template keeps its numbered sections present and in order`
- `test/init.test.js::§1bis enumerates its five synthesis steps in order, between §1 and §2`
- `test/init.test.js::init copies §1bis verbatim into the generated AGENTS.md`

## Commands

- Command: `npm test`
  - Expected: la suite complète passe.

## Result

- **Changed**: ajout de `### 1bis. Format de synthèse ciblée — cinq étapes, dans cet ordre`
  au template `AGENTS-apprentissage.md`, entre §1 et §2 : problème concret tiré du
  code, mécanisme avant vocabulaire, exemple partiel d'un domaine voisin (jamais le
  sujet exact), invitation à questionner, puis prédiction. `init` le copie tel quel
  dans `AGENTS.md` (comportement existant, désormais couvert par un test).
- **Tests**: `npm test` — 676/676 pass ; 3 tests de structure ajoutés à `test/init.test.js`.
- **Risks**: aucun — changement de template uniquement, aucun code exécutable modifié.
