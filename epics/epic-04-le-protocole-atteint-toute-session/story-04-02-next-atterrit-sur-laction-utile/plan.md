# Plan — Story 04.02

## Implementation Context

Fichiers probables :

- bin/lib/next.js (≈27, 49-66, 93-125)
- bin/lib/status.js
- bin/lib/progress.js#phaseVerdict
- test/next.test.js
- test/status.test.js
- commands/next.md

Ancres de recherche : `staleFirst`, `brokenDone`, `mustReprove`, `phaseVerdict`

Mode d'exécution : `STANDARD`

Scout pre-step : `no` — les points d'intégration sont nommés ci-dessus.

À éviter sauf nécessité : bin/lib/verify.js (story 03), check.js

## Decisions

- Décision à prendre : une preuve périmée n'est plus **bloquante** pour `next` — mais `check` reste en échec si une phase `done` n'a aucune évidence (garde inchangée : « done sans preuve » reste une erreur).
- Contrat JSON : `mustReprove` est conservé un cycle (déprécié) pour ne pas casser un consommateur de `--json` (story 01-05).

## Test Plan

- [ ] Unit sur `next` : matrice {0, 1, 2 périmées} × {suite existe, projet fini}.
- [ ] Régression : `--json` garde sa forme additive.

## Acceptance Traceability

| Acceptance criterion | Test proving it |
| --- | --- |
| Given deux phases `done` périmées et une phase 3 jamais commencée, whe… | `Unit sur `next` : matrice {0, 1, 2 périmées} × {suite existe` (à nommer `file::test` au `/flow-run`) |
| Given `next --json`, when des phases sont périmées, then le JSON expos… | `Régression : `--json` garde sa forme additive.` (à nommer `file::test` au `/flow-run`) |
| Given aucune phase périmée, when `next` tourne, then la sortie est ide… | `Régression : `--json` garde sa forme additive.` (à nommer `file::test` au `/flow-run`) |
| Given `status`, when des phases sont périmées, then elles sont marquée… | `Régression : `--json` garde sa forme additive.` (à nommer `file::test` au `/flow-run`) |

## Commands

- Command: `npm test`
  - Expected: la suite complète passe.

## Rollback

Revert du commit de la story ; aucune migration de données hors champs additifs.
