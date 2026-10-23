# Tasks — Story 07.01

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

### What changed

- `bin/lib/progress.js` : `lastProvenAt(evidence)` (repli sur `generatedAt` pour les évidences antérieures) et `revisitState({ phase, evidence, now })` — calcul pur d'échéance, horloge injectée ; `validateProgress` refuse un `reviewAfterDays` non entier positif.
- `bin/lib/verify.js` : l'évidence d'un run vert porte `lastProvenAt` (même instant que `generatedAt`) ; un run rouge porte `null`, donc ne rafraîchit jamais l'échéance.
- `bin/lib/next.js` : `analyzeDonePhases` sépare preuves cassées (`broken`) et revisites échues (`revisits`) en un seul parcours ; `next` texte imprime « Revisite échue » après la suite normale, `next --json` expose `revisit: [ids]`. Une phase `stale`/`unproven` n'est jamais doublée en revisite.
- Tests : `test/verdict.test.js` (bornes de jours, validation), `test/next.test.js` (revisite texte + JSON, rétro-compatibilité), `test/verify.test.js` (estampille `lastProvenAt` verte / `null` rouge).

### Rollback Notes

Revert du commit de la story ; seuls des champs additifs (`lastProvenAt` dans l'évidence, `revisit` dans le JSON de `next`, `reviewAfterDays` optionnel) — aucune migration de données.

## Status: done
