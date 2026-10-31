# Tasks — Story 10.05

- [x] Tests rouges (voir plan).
- [x] `tutor.json` `incidents.chance` + `check`.
- [x] `next` : `incident.due` ; `learn-next.md` lance `break`.
- [x] Choix du niveau à partir des ledgers debug + plateforme.
- [x] `incidents/env.js` : variable, port, service ; détectabilité ; restauration.
- [x] Palier debug 4 ; §3sexies (prédiction de cause) ; README.
- [x] `npm test`, puis `/flow-review`.

## Result

## Status: done

Livré : `incidents.chance` (tutor.js, check), `next --json` → `incident.due` (tirage une fois par phase prouvée, enregistré dans `~/.ai-learn/incidents/<id>.offer.json`), `break --auto`, `chooseLevel`, `bin/lib/incidents/env.js` (variable / port / service), palier debug 4, prédiction `--cause`, doc (learn-next, learn-break, §3sexies, README), version 0.6.1.
Revue indépendante (sous-agent) : corrigés — défaite si le run des checkpoints lève après injection, restauration non confirmée = incident reste actif, consigne `--cause` au niveau 3, permissions 0600 conservées. Limites assumées : un SIGKILL entre injection port/service et écriture du secret laisse la panne en place (pas de verrou de reprise hors `.env`) ; `.env` lu en UTF-8 ; `--level 3` manuel contourne le déblocage ; tier 3 non mesurable « avant réparation » pour port/service ; `docker compose` résolu depuis le cwd (parents compris).

### Rollback Notes
`git revert` du commit ; les enregistrements `~/.ai-learn/incidents/*.offer.json` sont inertes.
