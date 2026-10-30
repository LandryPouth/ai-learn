# Plan — Story 10.05

## Implementation Context

Fichiers probables :

- bin/lib/incident.js (choix du niveau, déclenchement), bin/lib/incidents/env.js (nouveau : banque de pannes d'environnement)
- bin/lib/tutor.js (`incidents.chance`)
- bin/lib/next.js (`incident.due`)
- bin/lib/tracks/debug.js (palier 4)
- bin/lib/check.js
- commands/learn-next.md (lancer `break` quand `due`)
- templates/AGENTS-apprentissage.md (§3sexies : prédiction de cause pour le niveau 3)
- README.md
- test/incident-env.test.js, test/next.test.js, test/tutor.test.js

Ancres : `buildNextReport`, `uncommittedCount`, `readTutorConfig`, `PROOF_LEVELS`, `syncDebugTrack`

Mode : `STRICT` (processus et services de l'utilisateur) · scout pre-step : `no`

À éviter : arrêter un processus qui n'a pas été lancé par l'outil ; toucher un fichier suivi par git hors `src/**`.

## Decisions

- **Déclenché après une preuve, jamais au milieu d'une phase** : le moment sûr est « phase prouvée + arbre propre », et un seul incident par phase prouvée (horodatage du dernier `verify` comparé à `lastIncidentOfferedAt`).
- **Hasard réel, testable** : générateur injectable, `Math.random` en production.
- **Seuls les pids lancés par l'outil sont arrêtés**, vérifiés par pid + ligne de commande enregistrés.
- **Docker optionnel** : la panne « service » n'existe que si `docker compose ps` répond ; sinon elle disparaît de la banque, sans erreur.
- **Repli explicite** : niveau 3 sans panne applicable → niveau 2, message visible.

## Test Plan

Rouge d'abord : `next` (due / chance 0 / déjà proposé) ; validation `tutor.json` ; choix du niveau selon ledgers injectés ; panne `.env` aller-retour octet par octet ; panne port (processus enfant réel sur port libre, arrêt vérifié) ; repli niveau 3 → 2 ; service Docker auto-skip.

## Acceptance Traceability

| Critère | Preuve |
|---|---|
| due | test/next.test.js::next offers an incident after a fresh proof |
| chance 0 | test/next.test.js::chance zero never offers an incident |
| un seul | test/next.test.js::one incident per proven phase |
| check | test/tutor.test.js::incidents chance out of range is an error |
| niveau | test/incident-env.test.js::level follows the debug and platform ledgers |
| .env | test/incident-env.test.js::env fault round-trips the file byte for byte |
| port | test/incident-env.test.js::port fault kills only the recorded pid |
| repli | test/incident-env.test.js::no applicable env fault falls back to level 2 |
| docker | test/incident-env.test.js::service fault only when docker compose answers |

## Commands

```
npm test
```
