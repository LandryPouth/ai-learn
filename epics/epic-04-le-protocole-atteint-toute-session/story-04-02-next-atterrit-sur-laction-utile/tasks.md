# Tasks — Story 04.02

## Status: done

## Pre-Implementation

- [x] Lire `plan.md`, `RULES.md`, et les fichiers « probables » ci-dessus
- [x] Rejouer le comportement actuel sur un projet temporaire (état de départ)

## Implementation Tasks

- [x] Implémenter le plus petit changement qui satisfait les critères, dans l'ordre du plan
- [x] Trancher chaque « Décision à prendre » dans `plan.md` avant d'écrire le code concerné

## Testing Tasks

- [x] Écrire les tests du Test Plan (rouge d'abord pour toute logique de décision)
- [x] Remplir la table `Acceptance Traceability` avec les vrais `file::test`

## Validation Tasks

- [x] `npm test`
- [x] `ai-flow verify --story <dir>`

## Result

### Summary

`next` nomme désormais la première phase non `done` même quand des phases
`done` ont une preuve périmée ; celles-ci passent en avertissement actionnable
(`ai-learn verify <id>`) après l'action utile. `next --json` expose `next` et
`stale: [ids]` séparément ; `mustReprove` reste présent mais déprécié (toujours
`false`) pour ne pas casser un consommateur. `status` marque toujours les
phases périmées `périmé` dans l'ordre du ledger. Sans phase périmée, la sortie
texte est inchangée octet pour octet.

### Files Changed

- `bin/lib/next.js` — `next` = première phase non `done`, `stale` séparé,
  avertissements déplacés après l'action quand une périmée existe.
- `commands/next.md` — comportement documenté (suivante puis avertissements).
- `test/next.test.js` — matrice 0/1/2 périmées × suite existe/fini, JSON séparé.
- `test/status.test.js` — ordre du ledger préservé avec une phase périmée.

### Issues

Aucun.

### Follow-ups

Aucun.

### Remaining Risks

- `mustReprove` reste dans `--json` un cycle : un consommateur qui s'en sert
  encore pour décider quoi faire doit migrer vers `stale` (toujours `false` ici).
- Une preuve périmée n'empêche plus `next` d'avancer : `check` reste le garde
  qui refuse une phase `done` sans preuve, comme avant.

### Rollback Notes

Revert du commit de la story. Aucune migration : seuls le rendu texte et des
champs JSON additifs changent.
