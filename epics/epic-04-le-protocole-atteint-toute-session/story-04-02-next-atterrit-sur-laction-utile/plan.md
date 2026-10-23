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

- Décision : une preuve périmée n'est plus **bloquante** pour `next` — `next` nomme la première phase non `done`, puis liste les périmées en avertissement actionnable. `check` reste inchangé : une phase `done` sans évidence reste une erreur, et une preuve périmée y reste signalée.
- Décision : l'ordre de sortie ne change **que** s'il existe une preuve périmée. Sans périmée, les avertissements restent avant la phase suivante, octet pour octet (critère 3).
- Décision : `next --json` expose `next` (la suite réelle) et `stale: [ids]` séparément. `mustReprove` est conservé un cycle (déprécié) mais vaut toujours `false` : il signifiait « next est la phase périmée », ce que la story supprime. Un consommateur lit désormais `stale`.
- Décision : avec une périmée **et** une non prouvée, les deux avertissements passent après `Next:` (l'ordre « avertissements d'abord » ne vaut que sans aucune périmée). Couvert par test.
- Décision : quand toutes les phases sont `done` mais qu'une preuve ne tient pas, le texte ne dit jamais « All N/N phases done » ; il annonce « marked done, but N proof(s) do not hold » et la liste des commandes de re-preuve.

## Test Plan

- [x] Unit sur `next` : matrice {0, 1, 2 périmées} × {suite existe, projet fini}.
- [x] Régression : `--json` garde sa forme additive.

## Acceptance Traceability

| Acceptance criterion | Test proving it |
| --- | --- |
| Given deux phases `done` périmées et une phase 3 jamais commencée, whe… | `test/next.test.js::with several stale phases, next names the never-started phase and warns for each stale one` |
| Given `next --json`, when des phases sont périmées, then le JSON expos… | `test/next.test.js::next --json keeps the real next phase and stale ids separate (mustReprove no longer masks)` + `test/next.test.js::next --json reports done with stale ids when every phase is marked done` |
| Given aucune phase périmée, when `next` tourne, then la sortie est ide… | `test/next.test.js::the text output is unchanged when --json is not passed` + `test/next.test.js::next points to the first phase that is not done` |
| Given `status`, when des phases sont périmées, then elles sont marquée… | `test/status.test.js::status marks a stale phase in ledger order without reordering the following phase` |

## Commands

- Command: `npm test`
  - Expected: la suite complète passe.

## Rollback

Revert du commit de la story ; aucune migration de données hors champs additifs.
