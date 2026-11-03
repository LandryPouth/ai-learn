# Tasks — Story 11.01

- [x] Lire `predictions.js` (création, reveal, décompte) et `incident.js#resolve` ; repérer où la « dernière prédiction debug » est choisie.
- [x] Tests rouges (voir plan).
- [x] `predictions.js` : champ `by`, refus d'ordre et de doublon, exclusion du décompte, rendu « (IA) ».
- [x] `incident.js` : double comparaison au resolve et au giveup.
- [x] `tracks/debug.js` : `secondOpinion` optionnel, enregistrement idempotent ; `ledgers.js` le tolère.
- [x] `status.js` : ligne « second avis ».
- [x] §3sexies d'AGENTS, `commands/learn-break.md`, README.
- [x] `npm test` (`/flow-review` opt-in, non exécuté).

## Status: done

## Result

- `predictions.js` : champ `by` (`apprenant` | `ia`), refus d'ordre / de doublon / de niveau (`--cause` au niveau 3, `--file` sinon), entrées IA exclues de `predictionsReport` et `countByPhase`, rendu « second avis (IA) ».
- `incident.js` : `compareBets` factorise la comparaison pour les deux prédictions ; `resolve` et `giveup` affichent les deux ; seul `resolve` alimente `secondOpinion`.
- `tracks/debug.js` : `secondOpinion` optionnel, validé, idempotent par `incidentId` (`recordSecondOpinion`). `status.js` : ligne « second avis ».
- AGENTS §3sexies, `commands/learn-break.md`, README, drapeau `--by`.
- Validation : `ai-flow verify` vert (`npm test`, 1041 tests). Coverage: evidence.
- Revue : `/flow-review` faite (pass), 2 P2 corrigés (check « non révélée », total du bilan). Version 0.6.5 (scaffold AGENTS modifié).

### Rollback Notes

`git revert` ; un `debug.json` portant `secondOpinion` reste lisible par l'ancien code (champ ignoré).
