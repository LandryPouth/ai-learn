# Plan — Story 03.02

## Implementation Context

Fichiers probables :

- bin/lib/mode.js (nouveau)
- bin/ai-learn.js (dispatch)
- bin/lib/tracks/tests.js (lecture seule)
- bin/lib/check.js
- test/mode.test.js (nouveau)

Ancres de recherche : `readOrDefaultTestsTracks`, `TIER_IDS`, `loadGuardConfig`

Mode d'exécution : `STRICT`

Scout pre-step : `no` — les points d'intégration sont nommés ci-dessus.

À éviter sauf nécessité : bin/lib/tracks/tests.js (aucune écriture)

## Decisions

- Décision à prendre : la porte lit le ledger, ne le modifie jamais. Un ledger illisible **refuse** (échec fermé), contrairement aux syncs qui échouent en silence (échec ouvert) — c'est le contraire exact, à justifier dans le plan.
- Décision à prendre : ledger éditable à la main → la porte est un garde-fou pédagogique, pas un contrôle de sécurité ; le dire dans la doc plutôt que le suggérer inviolable.

## Test Plan

- [ ] Unit : chaque tier manquant isolément.
- [ ] Intégration : ledger corrompu → refus.
- [ ] Négatif : retirer la lecture du ledger → le test de refus échoue.

## Acceptance Traceability

| Acceptance criterion | Test proving it |
| --- | --- |
| Given les tiers 1-3 atteints, when `ai-learn mode dirigeant` tourne, t… | `Unit : chaque tier manquant isolément.` (à nommer `file::test` au `/flow-run`) |
| Given le tier 3 (« rouge d'abord ») non atteint, when la commande tour… | `Intégration : ledger corrompu → refus.` (à nommer `file::test` au `/flow-run`) |
| Given un ledger absent, corrompu ou de version inconnue, when la comma… | `Négatif : retirer la lecture du ledger → le test de refus éc` (à nommer `file::test` au `/flow-run`) |
| Given `ai-learn mode apprenti`, when il tourne, then le retour est tou… | `Négatif : retirer la lecture du ledger → le test de refus éc` (à nommer `file::test` au `/flow-run`) |
| Given une édition manuelle de `guard.json` vers `dirigeant` sans passe… | `Négatif : retirer la lecture du ledger → le test de refus éc` (à nommer `file::test` au `/flow-run`) |

## Commands

- Command: `npm test`
  - Expected: la suite complète passe.

## Rollback

Revert du commit de la story ; aucune migration de données hors champs additifs.
