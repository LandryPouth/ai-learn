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
Revue indépendante (sous-agent) : corrigés — défaite si le run des checkpoints lève après injection, restauration non confirmée = incident reste actif, consigne `--cause` au niveau 3, permissions 0600 conservées. Revue /flow-review (pass) puis durcissement : verrou de reprise `.ai-learn/env-fault.lock.json` écrit dès que le listener/l'arrêt existe (un SIGKILL est annulé par la commande suivante), `.env` lu/écrit en latin1 (octet par octet, tout encodage), panne « service » seulement si un fichier compose est dans le projet (plus de remontée vers les parents). Limites assumées : fenêtre de quelques ms entre `spawn` et l'écriture du verrou du listener ; `--level 3` manuel contourne le déblocage (outil de test/maîtrise) ; tier 3 non mesurable « avant réparation » pour port/service ; le tirage est consommé même si la session s'arrête avant `break`. Mode : un mode inconnu retombe déjà sur `apprenti` dans `loadGuardConfig`, rien à changer.

### Rollback Notes
`git revert` du commit ; les enregistrements `~/.ai-learn/incidents/*.offer.json` sont inertes.
