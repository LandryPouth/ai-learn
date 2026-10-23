# Tasks — Story 04.03

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

- **Changed** : `bin/lib/verify.js` — `findStalePhases` (même verdict que `next`/`status`/`check`), `staleCommand` (re-prouve chaque phase via `verifyCommand`, résume « toujours vert » contre « régression »), `failureDetail`, et `verifyCommand` renvoie désormais son issue au lieu de seulement poser `process.exitCode`. `bin/ai-learn.js` — dispatch `verify --stale` + aide. `bin/lib/next.js` / `bin/lib/status.js` — la suggestion de re-preuve devient `ai-learn verify --stale`.
- **Tests** : `npm test` vert (644 tests) ; `ai-flow verify --story` vert (coverage evidence, 4 fichiers de test renforcés).
- **Verify** : green — `ai-flow verify --story epics/epic-04-le-protocole-atteint-toute-session/story-04-03-verify-stale-reprouve-en-bloc`.
- **Issues / follow-ups** : aucun blocage. Le plafond de durée reste celui de `runCommand` (120 s par checkpoint), inchangé.

### Rollback Notes

- Revert du commit de la story. Aucune migration de données : les évidences ajoutées sous `.ai-learn/runs/` sont additives, et les statuts reviennent à leur valeur antérieure par `git revert` de `progress.json` s'il a été touché par une re-preuve.
