# Spec — Story 09.02 — Un verdict de checkpoint honnête

## User Value

Quand une phase est `done`, l'apprenant sait que le test a vraiment exécuté quelque chose contre **son** code, et qu'il n'a pas été remplacé en douce pour passer au vert. Quand le contrat d'une phase évolue légitimement (l'API prend un préfixe `/api/v1`), le changement est visible au lieu d'être confondu avec une réparation.

## Requirements

- **Empreintes séparées dans la preuve** : chaque évidence garde `sourceHash` (inchangé, rétro-compatible) et ajoute `learnerHash` (fichiers de l'apprenant seuls) et `checkpointHash` (commande `checkpoint` + contenu du fichier de checkpoint s'il existe).
- **Checkpoint modifié depuis la preuve** : `phaseVerdict` rend `stale` avec `reason: "checkpoint-changed"` quand la commande `checkpoint` de `progress.json` diffère de celle de la dernière preuve passante. `status`, `next` et `check` l'affichent : « checkpoint modifié depuis la preuve ».
- **Vert obtenu en changeant le test** : `check` avertit quand, pour une phase, une preuve rouge est suivie d'une preuve verte avec `learnerHash` identique et `checkpointHash` différent : « phase N : passée au vert en modifiant le test, pas le code (<date>) ». Avertissement, pas erreur (une évolution de contrat est légitime) ; l'avertissement disparaît après une preuve verte suivante sur un `learnerHash` différent ou une prise de connaissance explicite (`progress.json` → `phase.contractChanges[]` avec `at` + `why`, écrit par l'agent sur demande de l'apprenant).
- **Zéro test refusé** : `verify` échoue (preuve `ok: false`) quand la sortie du checkpoint montre qu'aucun test n'a tourné. Motifs : `node:test` (`# tests 0`), Jest (`No tests found`), Vitest (`No test files found`), pytest (exit 5 ou `no tests ran`), Go (`no test files`), Cargo (`running 0 tests` sans autre bloc), CTest (`No tests were found`). Message : « aucun test exécuté — le checkpoint ne prouve rien ».
- **Checkpoint qui ne touche pas le code de l'apprenant** : `check` avertit quand le fichier de checkpoint existe et ne mentionne aucun chemin couvert par `learnerFiles` (import, require, chemin de fichier, ou script `npm` lancé — recherche textuelle sur les racines des motifs, ex. `src/`).
- **Processus d'arrière-plan** : reproduire d'abord un checkpoint qui lance un serveur en arrière-plan (`node server.js & …`). S'il bloque `verify` jusqu'au délai ou laisse un processus vivant, `runCommand` lance le checkpoint dans son propre groupe de processus et tue le groupe à la fin ; sinon, consigner le résultat négatif au Result et retirer ce point.

## Acceptance Criteria

- [x] Given une phase prouvée avec `node --test checkpoint/phase-1.test.mjs`, when `progress.json` passe à `node -e 0`, then `status` et `check` affichent la phase `stale` « checkpoint modifié depuis la preuve ».
- [x] Given une preuve rouge puis une verte où seul le fichier de checkpoint a changé, when `check`, then l'avertissement « passée au vert en modifiant le test » nomme la phase et la date.
- [x] Given le même cas avec un `contractChanges` daté après la preuve verte, when `check`, then l'avertissement disparaît et le motif est affiché une fois dans `status`.
- [x] Given un projet vide et le checkpoint `node --test`, when `verify 1`, then exit 1, phase non `done`, message « aucun test exécuté ».
- [x] Given chacun des motifs zéro-test listés (sortie simulée), when la détection tourne, then elle répond vrai ; given une sortie avec au moins un test passé, then faux.
- [x] Given un fichier de checkpoint qui ne mentionne aucun chemin de `learnerFiles`, when `check`, then un avertissement nomme le fichier.
- [x] Given une évidence ancienne sans `learnerHash`/`checkpointHash`, when `check`/`status`, then aucun nouvel avertissement (rétro-compatible).
- [x] Given un checkpoint qui démarre un serveur en arrière-plan puis réussit, when `verify`, then il rend la main sans attendre le délai et aucun processus du checkpoint ne survit — ou le Result consigne que le cas ne se reproduit pas.

## Edge Cases

- Windows : groupe de processus via `taskkill /T` (ou repli consigné).
- Sortie tronquée (`stdoutTail` 4 000 caractères) : chercher le motif zéro-test dans les deux flux ; en cas de doute, ne pas refuser.
- Phase `stressCheckpoint` : la règle zéro-test s'applique à chaque commande.
- Un checkpoint `npm test` : le fichier de checkpoint est `package.json` ? Non — pas de fichier détecté, donc pas d'avertissement « ne touche pas le code » (pas de faux positif).

## Out of Scope

- Interdire à l'IA d'éditer `progress.json` (décision d'epic : détecter).
- Juger la qualité d'un test (c'est le rôle de la mutation).
