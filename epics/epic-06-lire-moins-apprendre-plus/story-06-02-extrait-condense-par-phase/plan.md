# Plan — Story 06.02

## Implementation Context

Fichiers probables :

- bin/lib/docs.js
- bin/lib/args.js
- docs/plans/plan-apprentissage.md (format des sections ✅/⏭️ lu, pas modifié)
- test/docs.test.js

Ancres de recherche : `citesRealPRUrl (pattern de vérification de citation)`, `traps.js (extraction `fichier:ligne`)`

Mode d'exécution : `STANDARD`

Scout pre-step : `no` — les points d'intégration sont nommés ci-dessus.

À éviter sauf nécessité : bin/lib/traps.js (réutiliser son extraction de citations, ne pas la réécrire), bin/lib/propose.js

## Decisions

- Décision à prendre : l'extrait est **mécanique** (copie de plages de lignes), jamais résumé par un modèle — cohérent avec « jamais inventée » de `traps`.
- Décision à prendre : format de déclaration des sections (plage de lignes ou titre) à fixer ici, une seule forme.

## Test Plan

- [ ] Unit : extraction de plages, citation valide/invalide.
- [ ] Intégration : source temporaire + phase + digest.

## Acceptance Traceability

| Acceptance criterion | Test proving it |
| --- | --- |
| Given une phase avec des sections ciblées déclarées, when `docs digest… | `Unit : extraction de plages, citation valide/invalide.` (à nommer `file::test` au `/flow-run`) |
| Given une citation, when elle est vérifiée, then `fichier:ligne` point… | `Intégration : source temporaire + phase + digest.` (à nommer `file::test` au `/flow-run`) |
| Given un digest déjà généré et une source modifiée, when `docs digest`… | `Intégration : source temporaire + phase + digest.` (à nommer `file::test` au `/flow-run`) |
| Given une phase sans sections ciblées, when `digest` tourne, then mess… | `Intégration : source temporaire + phase + digest.` (à nommer `file::test` au `/flow-run`) |
| Given `check`, when le digest d'une phase pointe vers une ligne dispar… | `Intégration : source temporaire + phase + digest.` (à nommer `file::test` au `/flow-run`) |

## Commands

- Command: `npm test`
  - Expected: la suite complète passe.

## Rollback

Revert du commit de la story ; aucune migration de données hors champs additifs.
