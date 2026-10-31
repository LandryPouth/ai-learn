# Plan — Story 09.06

## Implementation Context

Fichiers probables :

- bin/lib/revisit.js (nouveau : préconditions, diff inverse, sauvegarde, verrou, abandon, orphelin)
- bin/lib/verify.js (`--revisit` exige une revisite active ; intervalle doublé)
- bin/lib/progress.js (`reviewAfterDays` écrit par `verify` uniquement)
- bin/lib/next.js, bin/lib/status.js (revisite active / orpheline en premier)
- bin/ai-learn.js (sous-commande `revisit`)
- commands/learn.md (`reviewAfterDays: 7`), commands/learn-next.md (lancer `revisit` quand due)
- templates/AGENTS-apprentissage.md (§5bis : ce que l'IA ne montre pas pendant une revisite)
- test/revisit.test.js (nouveau), test/verify.test.js, test/next.test.js

Ancres : `mutateLockPath`, `recoverOrphanLock`, `restoreOriginal`, `revisitState`, `uncommittedCount`, `explainCommitCommand`

Mode : `STRICT` · scout pre-step : `no`

À éviter : lancer une commande git qui écrit dans le dépôt (`commit`, `stash`, `checkout`) — seulement `log`, `diff`, `status` en lecture ; l'écriture des fichiers se fait par l'outil, avec sa propre sauvegarde.

## Decisions

- **Retrait par diff inverse des commits de phase** : c'est le seul découpage « ce que la phase a ajouté » que l'outil connaît sans le deviner ; la convention `feat(phase-N)` est déjà proposée par `verify` et imposée par le hook `commit-msg`.
- **Refuser plutôt qu'approximer** : si l'inverse ne s'applique pas, une revisite partielle prouverait n'importe quoi ; l'apprenant en est informé.
- **Le CLI lit git, l'IA non** : la règle « l'IA ne lance pas git » vise l'apprentissage des commandes ; l'outil lit déjà git (`uncommittedCount`, `docs`).
- **Intervalle doublé à chaque succès** : répétition espacée minimale, sans algorithme de type SM-2 (rien dans le journal ne le demande).
- **Moteur réutilisable** : sauvegarde + verrou + abandon servent ensuite à `10-04` (incident), qui ne réécrit pas les siens.

## Test Plan

Dépôt git de fixture avec commits `feat(phase-N)` ; cas nominal, plusieurs commits, fichier créé, fichier hors périmètre, arbre sale, retravail incompatible, abandon octet pour octet, verrou orphelin (processus inexistant), `verify --revisit` sans revisite.

## Acceptance Traceability

| Critère | Preuve |
|---|---|
| retrait | test/revisit.test.js::revisit removes exactly the lines the phase commits added |
| rouge | test/revisit.test.js::a red revisit keeps the lock and the phase done |
| vert | test/revisit.test.js::a green revisit keeps retyped code and doubles the interval |
| sans retrait | test/verify.test.js::verify --revisit refuses without an active revisit |
| abandon | test/revisit.test.js::giveup restores files byte for byte |
| arbre sale | test/revisit.test.js::revisit refuses a dirty tree |
| retravaillé | test/revisit.test.js::revisit refuses when the reverse diff no longer applies |
| orphelin | test/next.test.js::an orphan revisit lock comes first in next |
| learn.md | test/commands.test.js::learn sets reviewAfterDays on generated phases |

## Commands

```
npm test
```
