# Tasks — Story 07.02

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
- [ ] `ai-flow verify --story <dir>`

## Result

### What changed

- `bin/lib/verify.js` : `verifyCommand` accepte `revisit`. Refus d'usage avant toute exécution si la phase n'est pas `done` ; l'évidence porte `revisit` ; une revisite verte rafraîchit `lastProvenAt` et ne touche ni statut ni ledgers (`marking: skipped`) ; une revisite rouge trace `ok: false`/`lastProvenAt: null` et laisse la phase `done`.
- `bin/ai-learn.js` : câblage `--revisit` et aide mise à jour.
- `bin/lib/check.js` : `checkProject({ now })` ajoute un warning (jamais une erreur) nommant une phase prouvée dont la revisite est échue, avec la commande `verify <id> --revisit`.
- `templates/AGENTS-apprentissage.md` : § 5bis « Revisite espacée » impose de refaire la phase sans relire notes ni journal de prédictions.
- Tests : `test/verify.test.js` (verte/rouge/refus), `test/check.test.js` (warning + non-régression avant échéance), `test/cli.test.js` (câblage CLI).

### Rollback Notes

Revert du commit de la story ; aucune migration de données (champ d'évidence additif `revisit`, warning `check` conditionnel, `--revisit` optionnel).

## Status: done
