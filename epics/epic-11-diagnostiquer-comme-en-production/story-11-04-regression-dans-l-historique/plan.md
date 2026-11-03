# Plan — Story 11.04

## Implementation Context

Fichiers probables :

- bin/lib/incidents/bisect.js (nouveau : construction, record, resolve, giveup, reprise)
- bin/lib/faults.js (`NEUTRAL_TRANSFORMS`, réutilisé par la story 12.03)
- bin/lib/incident.js (aiguillage `--bisect`, préconditions partagées)
- bin/lib/predictions.js (`--commit` sur le type `debug`)
- bin/lib/tracks/git.js (palier 7 optionnel, enregistrement hors phase)
- bin/lib/util.js (`spawnGit` isolé, identité dédiée)
- bin/ai-learn.js (`--bisect`, `--commits`)
- templates/AGENTS-apprentissage.md (§3sexies), commands/learn-break.md, README.md
- test/incident-bisect.test.js (nouveau), test/tracks-git.test.js, test/predictions.test.js

Ancres : `spawnGit`, `gitIsolatedEnv`, `TIER_IDS` (git), `syncGitTrack`, `assertPreconditions`, `recoverOrphanLockAndLog`, `incidentRecordPath`

Mode : `STRICT` (branche et commits dans le dépôt de l'apprenant, écriture dans `src/**`) · scout pre-step : `no`

À éviter : la grammaire shell de `guard.js` ; toute commande git qui touche une branche autre que la jetable (pas de `reset`, pas de `rebase`).

## Decisions

- **Branche jetable dans le dépôt de l'apprenant, pas un clone.** Un clone n'a pas `node_modules` ni `.env` : le checkpoint n'y tournerait pas. La branche d'origine n'est jamais modifiée.
- **L'outil commite, l'apprenant bisecte.** Les commits sont une fixture, comme le fichier cassé de `break`. Le geste appris (`bisect`) reste tapé par l'apprenant ; le guard qui interdit git à l'IA n'est pas touché.
- **Palier enregistré hors phase.** `syncGitTrack` n'accorde un palier qu'à une phase taguée ; ici l'incident est provoqué par l'outil, ce qui respecte la règle « provoqué, pas laissé au hasard ». Les commits de l'outil n'apportent aucun signal aux paliers 1-6 (ils ne passent que par `verify` d'une phase taguée).
- **Neutralité prouvée par les checkpoints**, pas supposée : une transformation qui fait tomber un test est écartée.

## Test Plan

Dépôts temporaires avec `git init`, identité de test, hook `commit-msg` strict pour un cas : préconditions, construction (auteurs, vert avant / rouge après), transformation non neutre écartée, état public sans secret, resolve exact → palier 7 et retour de branche, giveup, reprise après interruption, ledger git ancien valide.

## Acceptance Traceability

| Critère | Preuve |
|---|---|
| arbre sale | test/incident-bisect.test.js::bisect refuses a dirty tree |
| construction | test/incident-bisect.test.js::the history is green before the faulty commit and red from it |
| neutre écartée | test/incident-bisect.test.js::a transform that breaks a checkpoint is dropped |
| secret | test/incident-bisect.test.js::the public state carries no sha nor file |
| resolve | test/incident-bisect.test.js::an exact commit prediction reaches git tier 7 and restores the branch |
| ledger ancien | test/tracks-git.test.js::a ledger without tier 7 stays valid |
| giveup | test/incident-bisect.test.js::giveup restores the original branch and reveals the commit |
| hook | test/incident-bisect.test.js::the tool commits through a strict commit-msg hook |

## Commands

```
npm test
```
