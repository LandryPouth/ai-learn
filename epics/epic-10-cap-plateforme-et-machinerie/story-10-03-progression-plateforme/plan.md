# Plan — Story 10.03

## Implementation Context

Fichiers probables :

- bin/lib/tracks/platform.js (nouveau, calqué sur `tracks/git.js` sans les signaux git)
- bin/lib/verify.js (appel `syncPlatformTrack` à côté de `syncGitTrack`)
- bin/lib/progress.js (validation du champ `platformTier`)
- bin/lib/status.js, bin/lib/check.js
- bin/lib/propose.js (`PROJECTS[].platformTiers`, classement, 6 projets)
- commands/learn.md, commands/references/propose.md
- README.md, docs/project-context.md
- test/tracks-platform.test.js (nouveau), test/propose.test.js, test/verify.test.js

Ancres : `syncGitTrack`, `gitTier`, `TIER_IDS`, `PROJECTS`, `validateProject`

Mode : `STANDARD` · scout pre-step : `no`

À éviter : `scan.js`, `tracks/domain.js` (le ledger de domaine reste par stack).

## Decisions

- Ledger séparé du ledger de domaine : la plateforme est transverse aux langages, le domaine est par stack.
- Tag déclaré + preuve exécutée, jamais de détection ambiante : même discipline que `gitTier`.
- Chaque ressource des nouveaux projets est vérifiée à la main (URL ouverte) pendant le run et notée dans `## Result` ; aucune page inventée. Préférer doc officielle (postgresql.org, nodejs.org, docs.docker.com, docs.github.com, opentelemetry.io, RFC).
- Pas de Kubernetes, Kafka ni multi-bases dans la banque : contrainte « pas de technologie sans question pédagogique ».

## Test Plan

Unitaires du ledger (sync vert/rouge, corrompu non écrasé) ; `verify` d'une phase taguée ; `check` sur tag hors plage ; `status` ; classement `propose` sur ledger injecté ; `--validate` sur chaque nouveau projet.

## Acceptance Traceability

| Critère | Preuve |
|---|---|
| verify vert | test/tracks-platform.test.js::a verified tagged phase achieves its tier |
| verify rouge | test/tracks-platform.test.js::a failed verify leaves the ledger untouched |
| check | test/check.test.js::platformTier out of range is an error |
| status | test/status.test.js::status shows platform progress and missing tiers |
| propose classement | test/propose.test.js::projects covering missing platform tiers rank first |
| banque sourcée | test/propose.test.js::every bank project validates |
| learn.md | test/commands.test.js::learn caps platform tiers at two phases |

## Commands

```
npm test
```
