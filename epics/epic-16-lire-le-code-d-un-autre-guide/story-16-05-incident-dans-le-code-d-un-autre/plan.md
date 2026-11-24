# Plan — Story 16.05

## Implementation Context

Fichiers probables :

- bin/lib/tour-incident.js (nouveau : choix du site, mutation, état, resolve, giveup)
- bin/lib/incident.js (extraire si besoin les fonctions de mutation et `pickSite` vers une interface réutilisable, sans changer `/learn-break`)
- bin/lib/tour-sandbox.js (16.04 : lancer la commande), bin/lib/tour.js (`next`, `status`)
- templates/lecture-lisez-moi.md, commands/references/lecture.md, README.md, docs/project-context.md, docs/architecture.md
- test/tour-incident.test.js, test/incident.test.js (tests existants relancés tels quels)

Ancres : `pickSite`, `breakCommand`, `resolveCommand`, `giveupCommand`, `restoreOriginal`, `lastDebugPrediction`

Mode : `STANDARD` · scout pre-step : `yes` (`incident.js` fait 800 lignes et lie mutation, checkpoints de phase et projet d'apprentissage : repérer la frontière réutilisable avant d'écrire)

À éviter : le comportement de `/learn-break` dans un projet d'apprentissage (ses tests doivent rester verts sans modification).

## Decisions

- **Réutiliser le catalogue de mutations** plutôt qu'en écrire un : un seul comportement, corrigé à un seul endroit (`eng-shared-modules-first`). Si l'extraction touche plus que des fonctions pures, s'arrêter et le noter.
- **Le symptôme est la commande de test déclarée en 16.04** : pas de checkpoints de phase dans un dépôt étranger.
- **Proposé, jamais exigé** : respect du budget de friction.

## Test Plan

Bac à sable fixture avec une fonction et son test ; générateur injecté ; commande fixture `node --test` ; empreinte de la source ; tests d'`incident.js` existants.

## Acceptance Traceability

| Critère | Preuve |
|---|---|
| sans bac à sable | test/tour-incident.test.js::an incident needs a sandbox |
| rouge avant | test/tour-incident.test.js::an incident needs green tests first |
| mutation | test/tour-incident.test.js::an incident breaks a source file and the tests |
| resolve | test/tour-incident.test.js::resolving reveals the site |
| giveup | test/tour-incident.test.js::giving up restores the original bytes |
| un seul ouvert | test/tour-incident.test.js::only one incident at a time |

## Commands

```
npm test
```
