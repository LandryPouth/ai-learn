# Tasks — Story 11.04

- [x] Relire `incident.js` (préconditions, record, reprise) et `tracks/git.js` (forme, `syncGitTrack`).
- [x] Tests rouges (voir plan).
- [x] `faults.js` : `NEUTRAL_TRANSFORMS` + preuve de neutralité.
- [x] `incidents/bisect.js` : construction, record, resolve, giveup, reprise.
- [x] `predictions.js` : `--commit` ; `tracks/git.js` : palier 7 optionnel.
- [x] CLI, §3sexies, `commands/learn-break.md`, README (protocole bisect, durée annoncée).
- [x] `npm test`, puis `/flow-review` (STRICT).

## Status: done

## Result

- `faults.js` : `NEUTRAL_TRANSFORMS` (`equality-operand-swap`, `length-positive`, pack JS `neutral`), banque `neutral` de `findAllSites`. `incidents/bisect.js` : fautif choisi sur l'arbre propre puis reporté à partir du commit tiré, neutres prouvés par les checkpoints, verrou `bisect.lock.json` (ignoré par git), reprise, `--resolve` (palier git 7 si commit exact), `--giveup`. `predict --commit`. `tracks/git.js` : palier 7 optionnel, `recordIncidentTier`. `ledgers --repair` compte `kind: bisect`. Docs : §3sexies, `learn-break.md`, README. Version 0.6.8 (scaffold : `.gitignore`).
- Revue STRICT indépendante (sous-agent) : tour 1 fail (2 P1 : réécriture suivant l'apprenant sur sa branche après interruption, échecs git avalés ; 5 P2 : `n !== n`, regex non neutres, sites neutres consommés / N non réduit, giveup pendant `git bisect`) → corrigés, chacun par un test (négatif vérifié sur le P1 : sans `checkout -- .` le test tombe). Le tour 2 (revue de l'auteur, `self`) : fail, 1 P1 (le journal de prédictions, suivi par git, était perdu au retour sur la branche d'origine ; `isClean` le bloquait aussi), 1 P2 (fixture de test qui ignorait le journal), 1 P3 (variables inutilisées) → corrigés : `isClean` exclut le journal, `backToOriginKeepingJournal` le restitue sur l'origine, sha ambigu signalé, tests ajoutés (négatif vérifié : sans la restitution le test tombe). Pas de second tour indépendant (sous-agent).
- Limites : la neutralité n'est prouvée que sur le code couvert par les checkpoints ; JS seulement (autre pile : « pas assez de code ») ; second avis de l'IA sans source de sha sous le garde-fou (elle ne lance pas git) ; `status` affiche désormais le palier 7 comme restant pour les ledgers à 6/6.

### Rollback Notes
