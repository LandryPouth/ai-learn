# Spec — Story 11.04 — Régression dans l'historique (`git bisect`)

## User Value

« Ça marchait la semaine dernière » : l'apprenant retrouve le commit fautif parmi une série, avec `git bisect run` et son checkpoint comme juge, au lieu de relire chaque diff. L'outil construit l'historique et garde le commit fautif secret.

## Requirements

- `ai-learn break --bisect [--commits N]` (N défaut 12, borné 6-32). Préconditions de `break` (arbre propre, phase `done` avec checkpoint, mode apprenti, aucun incident actif), plus : HEAD sur une branche (pas détaché).
- Banque `NEUTRAL_TRANSFORMS` dans `bin/lib/faults.js` : réécritures ligne à ligne sans effet attendu (ex. `a === b` → `b === a` pour des opérandes simples, `x.length > 0` → `x.length !== 0`, `!== undefined && … !== null` laissé de côté si incertain). Chaque transformation retenue est **prouvée neutre** : checkpoints verts après application seule, sinon écartée.
- Construction : branche `ai-learn/bisect-<id>` créée depuis HEAD et extraite ; N commits, chacun une transformation neutre ; le commit d'index tiré au hasard dans le tiers central porte en plus une panne détectable (banque `faults` puis `mutators`, comme `break`). Commits faits par l'outil avec une identité dédiée (`ai-learn <ai-learn@localhost>`), un environnement git isolé et `--no-verify` (le hook `commit-msg` du projet ne s'applique pas à l'outil). Messages neutres et plausibles, sans indice.
- Record secret (`~/.ai-learn/incidents/`) : branche d'origine, branche jetable, sha du commit fautif, site. État public : `{ active, level: "bisect", startedAt, branch }`.
- Prédiction : `ai-learn predict --type debug --commit <sha>` (sha court accepté, résolu par l'outil).
- `break --resolve` : checkpoints verts sur la branche jetable (l'apprenant a réparé ou annulé le commit) ; compare le sha prédit au sha fautif (`exact` = même commit) ; `exact` → palier git 7 (« régression localisée avec bisect »), enregistré dans `~/.ai-learn/tracks/git.json`. Puis l'outil réextrait la branche d'origine ; la branche jetable reste (l'apprenant la supprime lui-même).
- `break --giveup` : réextrait la branche d'origine, révèle le sha et le site, aucun palier.
- §3sexies et README : protocole (`git bisect start <mauvais> <bon>`, `git bisect run <commande du checkpoint>`, `git bisect reset`), tapé par l'apprenant ; l'IA ne lance aucune commande git (guard inchangé).

## Acceptance Criteria

- [x] Given un arbre sale, when `break --bisect`, then exit 1 et aucune branche n'est créée.
- [x] Given un projet de test, when `break --bisect --commits 8` (générateur fixé), then la branche jetable est extraite, porte 8 commits d'auteur `ai-learn`, les commits avant le fautif ont des checkpoints verts, ceux à partir du fautif ont un checkpoint rouge.
- [x] Given une transformation neutre qui casse un checkpoint, when la construction, then elle est écartée et n'apparaît dans aucun commit.
- [x] Given l'incident actif, when on lit `.ai-learn/incident.json`, then il ne contient ni sha ni fichier.
- [x] Given une prédiction `--commit` égale au commit fautif et la panne réparée, when `break --resolve`, then palier git 7 atteint et la branche d'origine est réextraite.
- [x] Given un `git.json` à 6 paliers, when `check`, then aucune erreur.
- [x] Given l'incident actif, when `break --giveup`, then la branche d'origine est réextraite, le sha révélé, aucun palier.
- [x] Given le projet a un hook `commit-msg` strict, when `break --bisect`, then la construction réussit sans modifier le hook.

## Edge Cases

- Moins de N transformations neutres trouvées : N réduit au nombre trouvé, minimum 6, sinon refus « pas assez de code pour construire un historique ».
- L'apprenant change de branche pendant l'incident : `--resolve` refuse tant que la branche jetable n'est pas extraite.
- Interruption pendant la construction : verrou + retour à la branche d'origine au démarrage suivant (contrat `recoverOrphanLock`), branche jetable supprimée car jamais livrée.
- Durée : N+1 exécutions de checkpoints pendant la construction ; annoncé avant de commencer.

## Out of Scope

- Historique construit à partir des vrais commits de l'apprenant (réécriture de son historique : exclu).
- `git bisect` sur un dépôt distant.
