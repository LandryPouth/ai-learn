# Tasks — Story 05.01

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

- **Changed**: `predict` accepte `--type code|casse|reality` (défaut `code`), stocke
  `type` dans `.ai-learn/predictions.json` et l'affiche dans `docs/plans/predictions.md`.
  `predictionsRequired` accepte un entier (inchangé, tous types) ou un objet par type ;
  `predictionsReport` calcule le manque par type et `formatPredictionsGap` cite le type
  court avec son compte réel/attendu (`reality 0/1`). `verify` bloque et `check` signale
  en conséquence. `next` affiche le total ventilé sans `[object Object]`. Templates
  (`predictions.md`, `AGENTS-apprentissage.md`, `plan-apprentissage.md`) et README mis à jour.
- **Tests**: `npm test` — 672/672 pass. Nouveaux tests : unit de normalisation et de
  typage (`test/predictions.test.js`), blocage/passage `verify` et preuve par type
  (`test/verify.test.js`), signalement `check` sur phase `done` (`test/check.test.js`),
  aller-retour CLI `--type reality` (`test/cli.test.js`).
- **Issues**: aucune.
- **Follow-ups**: le rendu de `docs/plans/predictions.md` ajoute une ligne `- Type : …` à
  chaque entrée (y compris les anciennes, désormais rendues `code`) ; un journal
  personnalisé n'est pas réécrit, donc son ancien format reste en place.
- **Remaining risks**: le type est déclaré par l'agent, comme le reste de l'entrée — le
  moteur prouve la présence et l'ordre d'écriture, pas la nature réelle de la prédiction.

### Rollback Notes

Revert du commit de la story ; aucune migration de données hors champs additifs.
