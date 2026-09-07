# Tasks — Story 02.01

## Status: done

## Pre-Implementation

- [x] Lire `RULES.md` et `docs/conventions.md`
- [x] Lire `plan.md` (Implementation Context) et `index.md` de l'epic
- [x] Relire `bin/lib/norm.js` en entier (gabarit du moteur) et
      `bin/lib/verify.js#runCommand`/`verifyCommand` (exécution + message
      d'erreur « pas de checkpoint » à répliquer)
- [x] Relire `bin/lib/args.js` (parseur partagé de l'epic 01, story 01-05)

## Implementation Tasks

- [x] Créer `bin/lib/mutate.js` : détection du site (`true`/`false` hors
      chaîne/commentaire, via `stripStringsAndComments` importé de `norm.js`),
      balayage trié des fichiers `learnerFiles`
- [x] Écrire la fonction d'application/restauration (backup en mémoire,
      écriture du mutant, `finally` de restauration)
- [x] Brancher l'exécution du test tueur sur `verify.js#runCommand`
      (`phase.checkpoint`)
- [x] Vérifier le checkpoint non muté avant de muter quoi que ce soit (détecter
      un test déjà rouge)
- [x] Écrire `mutateCommand({ dir, phaseId })` (rapport + code de sortie)
- [x] Enregistrer la sous-commande `mutate --phase <id> [--dir <dir>]` dans
      `bin/ai-learn.js`

## Testing Tasks

- [x] Créer `test/mutate.test.js` (tous les cas du Test Plan de `plan.md`)
- [x] Vérifier manuellement qu'un `kill`/exception simulé pendant le test tueur
      restaure quand même le fichier
- [x] Justifier dans le `## Result` toute modification d'un test existant

## Validation Tasks

- [x] `npm test`
- [x] `node bin/ai-learn.js mutate --phase 0 --dir <projet-temporaire>` sur un
      cas SURVÉCU et un cas TUÉ, vérifier que le fichier est restauré à
      l'identique après coup dans les deux cas

## Result

**Résumé.** `ai-learn mutate --phase <id>` existe de bout en bout avec un seul
opérateur en dur (inversion d'un littéral booléen). `bin/lib/mutate.js` détecte
le premier site mutable dans le périmètre `learnerFiles` (réutilise
`walkSources`, `loadGuardConfig`/`matchesLearnerPath`, et
`norm.js#stripStringsAndComments` — nouvellement exporté, voir ci-dessous),
applique le mutant, lance `phase.checkpoint` via `verify.js#runCommand`
(réutilisé tel quel, pas dupliqué), puis restaure inconditionnellement le
fichier original dans un `finally`. Le rapport affiche
`fichier:ligne — boolean-literal — SURVÉCU/TUÉ` ; code de sortie 1 si survécu
ou si le checkpoint était déjà rouge avant toute mutation, 0 si tué ou si
aucun site mutable n'a été trouvé.

**Fichiers modifiés.**
- `bin/lib/mutate.js` (nouveau) — moteur + `mutateCommand`
- `bin/lib/norm.js` — `stripStringsAndComments` ajouté à `module.exports`
  (déjà implémentée, jamais exportée avant cette story ; aucun changement de
  comportement, seule sa visibilité change)
- `bin/ai-learn.js` — sous-commande `mutate --phase <id> [--dir <dir>]`
  enregistrée, aide (`help`) et section « Commands » mises à jour
- `test/mutate.test.js` (nouveau) — 16 tests

**Décision non prévue au plan.** `--phase <id>` est lu directement via
`getFlagValue` (même mécanisme que `predict`), pas via le parseur partagé
`args.js#parseArgs` de la story 01-05 : ce dernier existe pour distinguer
positionnels et valeurs de flags (le bug `--dir` qui avale un positionnel) —
`mutate` n'a aucun positionnel, seulement des flags à valeur, donc
`getFlagValue` suffit et reste cohérent avec `predict`, qui a exactement la
même forme d'arguments.

**Aucun test existant n'a été modifié** — seul un nouveau fichier de test a
été ajouté, et `norm.js` a gagné un export sans changer son comportement (ses
propres tests, `test/norm.test.js`, passent inchangés).

**Tests exécutés.**
- `node --test test/mutate.test.js` → 16/16, 0 échec.
- `npm test` → 419/419, 0 échec (aucune régression sur la suite existante).
- Vérification manuelle via un script driver dans le scratchpad (supprimé
  après usage) invoquant le vrai binaire CLI (`node bin/ai-learn.js mutate
  --phase 0 --dir <tmp>`) sur un projet Node minimal :
  - Checkpoint faible (`require('./src/index.js')`, n'inspecte jamais le
    retour) → `SURVÉCU`, exit 1, fichier restauré identique (comparaison de
    buffer).
  - Checkpoint fort (vérifie `isReady() === true`) → `TUÉ`, exit 0, fichier
    restauré identique.
- Restauration sous exception : `test/mutate.test.js::testMutant restores the
  file even when the executor throws` force `execute` (paramètre injectable,
  même patron que `{ home = os.homedir() }` ailleurs dans le dépôt) à lever
  une erreur ; le fichier est bit-à-bit restauré malgré l'exception qui
  remonte ensuite normalement à l'appelant.

### Rollback Notes

Retirer `bin/lib/mutate.js`, l'enregistrement de la sous-commande `mutate`
dans `bin/ai-learn.js` (bloc `case "mutate"`, la ligne d'usage et la ligne de
description dans `help`), `test/mutate.test.js`, et retirer
`stripStringsAndComments` de `module.exports` dans `norm.js` (aucun autre
module ne l'importe à ce stade). Aucune donnée persistante n'est créée par
cette story (pas de config, pas d'évidence) — un `git revert` du commit
suffit.
