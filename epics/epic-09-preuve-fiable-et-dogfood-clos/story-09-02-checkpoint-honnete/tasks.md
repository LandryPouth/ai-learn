# Tasks — Story 09.02

- [x] Reproduire dans un test le serveur en arrière-plan ; décider garder/retirer ce point.
- [x] Tests rouges : zéro-test, checkpoint modifié, vert par le test, hors code, rétro-compat.
- [x] Empreintes séparées dans `source-hash.js` et l'évidence.
- [x] `zeroTestsRan` + refus dans `verify` ; groupe de processus si reproduit.
- [x] `phaseVerdict` (motif) ; `check`, `status`, `next`.
- [x] `AGENTS-apprentissage.md` §5 : `contractChanges`.
- [x] Rejouer sur une copie de Fastify : `check` signale-t-il les phases 1-3 du 30/09 ? Consigner.
- [x] `npm test`, `/flow-review`.

## Status: done

## Result

**Changé**

- `exec.js` : `runCommand` écrit stdout/stderr dans des fichiers (plus de pipes), lance le shell dans son propre groupe de processus (`detached`) et tue le groupe à la fin ; `zeroTestsRan(result)` (node:test, Jest, Vitest, pytest, Go, CTest, Cargo « tous les blocs à 0 »). Windows : `taskkill /T` sur un shell déjà terminé — un processus d'arrière-plan peut y survivre (repli consigné, non testé hors Linux).
- `source-hash.js` : `computeLearnerHash`, `computeCheckpointHash` ; `sourceHash` inchangé.
- `verify.js` : `learnerHash`, `checkpointHash`, `zeroTests` dans l'évidence ; zéro test → `ok: false`, « Aucun test exécuté — le checkpoint ne prouve rien » (stress inclus).
- `progress.js` : `phaseVerdict` → `{ state: "stale", reason: "checkpoint-changed" }` si la commande du ledger diffère de celle de la preuve (comparaison sur `evidence.checkpoint`, déjà présent : rétro-compatible).
- `contract.js` (nouveau) : avertissements `check` « passée au vert en modifiant le test » (silencé par `contractChanges[].at` postérieur à la preuve verte) et « checkpoint ne mentionne aucun fichier de l'apprenant ».
- `check`, `status`, `next` : motif « checkpoint modifié depuis la preuve » ; `status` affiche `contractChanges` (date + raison) ; `AGENTS-apprentissage.md` §5 : quand/comment consigner.
- Test existant modifié : « a verified checkpoint file passes cleanly » — son test n'importait rien du code apprenant, exactement le cas que le nouvel avertissement vise ; il importe maintenant `src/`.

**Processus d'arrière-plan** : reproduit (verify attendait la fin du processus, 8 s mesurées pour un `setTimeout` de 8 s ; un vrai serveur aurait tenu jusqu'au délai de 120 s) et corrigé ; test `exec.test.js` (< 4 s, 6 s de processus) ; aucun survivant constaté par `pgrep`.

**Test helper** : `withoutNodeTestContext` — sous `npm test`, `NODE_TEST_CONTEXT` fait qu'un `node --test` imbriqué n'émet pas de TAP et sort 0 sur échec ; les tests qui lancent un vrai checkpoint `node --test` le retirent.

**Rejeu sur copie de Fastify** (`fastify-traducteur-api`) : les phases 1-3 du 30/09 ne sont **pas** signalées — leurs évidences n'ont pas `learnerHash`/`checkpointHash` (rétro-compatibilité voulue), donc l'outil ne peut pas trancher a posteriori. `check` signale en revanche la phase 4 : son checkpoint ne mentionne pas `src/` (à examiner par l'apprenant : vrai défaut ou test passant par le serveur lancé).

**Revue indépendante (sous-agent, STRICT)** : 2 hauts (faux positifs zéro-test : Go multi-paquets, motifs texte libre), 3 moyens, 5 bas. Corrigés : un marqueur de réussite (`# pass N`, `N passed`, ligne `ok`, `running N tests`) l'emporte sur tout motif zéro-test ; Go ne compte plus que `[no test files]` ; Cargo ignoré si la queue est tronquée ; l'avertissement « vert par le test » survit à un `verify` répété (remonte à la première verte après la rouge) ; lecture bornée de la sortie (4 Ko lus à la fin du fichier) ; nettoyage des fichiers temporaires en `finally`. **Limites consignées** : Ctrl-C n'atteint plus le groupe du checkpoint (`spawnSync` bloque, pas de handler possible) ; `maxBuffer` supprimé (sortie bornée à la lecture, pas à l'écriture) ; Windows : processus d'arrière-plan non tués ; avertissement « hors code » littéral (`src/`) ; `learnerHash` d'un test colocalisé en apprenti inclut le test ; `checkpoint-changed` sensible à un simple changement d'espaces ; `node -e 0` re-vérifié reste vert (détection, hors périmètre).

**Validation** : `npm test` 845/845.

### Rollback Notes
`git revert` ; aucune migration. Les évidences gardent des champs en plus (`learnerHash`, `checkpointHash`, `zeroTests`) ignorés par l'ancien code.
