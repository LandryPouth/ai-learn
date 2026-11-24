# Plan — Story 16.04

## Implementation Context

Fichiers probables :

- bin/lib/tour.js (`exam`, `--sandbox`, `--check`, `--close`, `--clean`), bin/lib/tour-sandbox.js (nouveau : clone ou copie, diff, lancement de la commande), bin/lib/tracks/reading.js (nouveau ledger, calqué sur `tracks/review.js`)
- bin/lib/ledgers.js (fichier connu de `--repair`), bin/lib/status.js, bin/lib/memory.js (si présent)
- templates/lecture-lisez-moi.md, commands/references/lecture.md, README.md, docs/project-context.md, docs/architecture.md
- test/tour.test.js, test/tour-sandbox.test.js, test/tracks-reading.test.js, test/ledgers.test.js

Ancres : `recordReviewKata`, `ledgerFiles`, `writeLedgerFile`, `scoreReading`, `resolveSource`

Mode : `STANDARD` · scout pre-step : `no`

À éviter : la notation `lecture` existante (réutilisée telle quelle) ; toute écriture dans la source.

## Decisions

- **Localiser puis changer pour de vrai** (2026-11-24) : « où changerais-tu X ? » reste de la parole ; un test vert dans le code d'un autre est une preuve exécutée, cohérente avec la thèse de l'outil.
- **`git clone --local` plutôt que `git worktree`** : un worktree écrit dans le `.git` de la source, un clone non.
- **La commande de test est déclarée par l'apprenant** et ne tourne que dans le bac à sable : exécuter du code étranger est son choix explicite, jamais celui de l'agent.
- **Un seul résultat (réussi ou non), pas de paliers** : allègement décidé le 2026-11-24.
- **Hypothèses** : 2 sur 3 en `exact` ou `fichier` ; copie refusée au-delà de 5 000 fichiers.

## Test Plan

Dépôt fixture git et fixture non git ; commande de test fixture (`node -e "process.exit(0)"` / `exit(1)`) ; empreinte de la source avant/après ; ledger dans un home injecté.

## Acceptance Traceability

| Critère | Preuve |
|---|---|
| arrêt ouvert | test/tour.test.js::the exam needs every stop closed |
| flux manquant | test/tour.test.js::the exam needs a finished flow |
| localisation ratée | test/tour.test.js::a failed localisation opens no sandbox |
| clone | test/tour-sandbox.test.js::a git source is cloned and left untouched |
| pas de test | test/tour-sandbox.test.js::a change without a test fails the check |
| réussi | test/tour.test.js::a green check passes the exam |
| commande rouge | test/tour-sandbox.test.js::a failing command blocks the close |
| repair | test/ledgers.test.js::repair lists reading tours whose source is gone |

## Commands

```
npm test
```
