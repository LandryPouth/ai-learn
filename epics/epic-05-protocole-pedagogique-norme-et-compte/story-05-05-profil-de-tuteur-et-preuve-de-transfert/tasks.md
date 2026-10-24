# Tasks — Story 05.05

## Status: done

## Pre-Implementation

- [x] Lire `plan.md`, `RULES.md`, et les fichiers « probables » ci-dessus
- [x] Rejouer le comportement actuel sur un projet temporaire (état de départ)

## Implementation Tasks

- [x] Implémenter le plus petit changement qui satisfait les critères, dans l'ordre du plan
- [x] Trancher chaque « Décision à prendre » dans `plan.md` avant d'écrire le code concerné

## Testing Tasks

- [x] Écrire les tests du Test Plan (rouge d'abord pour toute logique de décision)
- [x] Remplir la table `Acceptance Traceability` avec les vrais `file::test`

## Validation Tasks

- [x] `npm test`
- [x] `ai-flow verify --story <dir>`

## Result

### Rollback Notes

Revert du commit de la story ; aucun champ existant n'est modifié — `tutor.json`
est un fichier additif et son absence conserve le comportement d'avant.

### Result

- **Changed**: nouveau module `bin/lib/tutor.js` (lecture/validation/écriture unique de
  `.ai-learn/tutor.json`, `masteryLevel`) ; `init` écrit le profil une fois
  (`assistance: "indices"`, `proof: "explication"`) et ne le réécrit jamais ; `verify`
  bloque `proof: "transfert"` sans prédiction `transfert` et enregistre
  `proof: { tests, mastery }` séparément ; `status` affiche le profil actif ;
  `check` erreur sur une valeur inconnue ; `PREDICTION_TYPES` gagne `transfert` ;
  le template §1 documente les trois niveaux d'assistance et la lecture de
  `tutor.json` avant chaque réponse.
- **Tests**: `npm test` (voir verify) — `test/tutor.test.js`, plus des cas dans
  `test/init.test.js`, `test/verify.test.js`, `test/check.test.js`, `test/status.test.js`.
- **Traceability**:
  - init/defaults: `test/tutor.test.js::ensureTutorConfig writes the defaults once and never rewrites a customized file`, `test/init.test.js::init writes .ai-learn/tutor.json with explicit defaults and never rewrites it`
  - transfert bloquant/passant: `test/verify.test.js::verify blocks when proof is transfert and the phase has no transfert prediction`, `test/verify.test.js::verify marks done and records mastery transfert once the prediction exists`
  - non-régression `tests`: `test/verify.test.js::proof tests keeps the current behaviour and records tests mastery`
  - template: `test/init.test.js::the protocol documents the three assistance levels and reads tutor.json before each response`
  - status/check: `test/status.test.js::statusCommand shows the active tutor profile on one line`, `test/check.test.js::check errors on an unknown tutor assistance or proof value`
  - évidence séparée: `test/verify.test.js::verify blocks when proof is transfert and the phase has no transfert prediction`, `test/verify.test.js::a project without tutor.json keeps the current behaviour and records the default mastery`
