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

- **Extrait mécanique.** `docs digest` copie des plages de lignes, il ne résume
  jamais : aucune phrase du digest n'est inventée, seulement citée.
- **Format de déclaration : plages de lignes, une seule forme.**
  `phase.sections = [{ source, file, from, to }]`, lignes 1-indexées et inclusives.
  Les titres sont écartés : un titre peut être renommé ou dupliqué, une plage
  existe ou n'existe pas. `docs/plans/plan-apprentissage.md` reste en lecture
  seule — les ✅/⏭️ sont matérialisés par les plages déclarées, tout le reste est
  ignoré.
- **Citation machine dans un commentaire HTML.** Chaque section écrit
  `<!-- digest: <source>/<file>:<from>-<to> -->` en plus du titre lisible : un
  extrait de doc markdown peut contenir des `##`, qui ne doivent jamais être
  confondus avec une nouvelle citation par `check`.
- **`check` avertit, ne bloque pas.** Un digest périmé se répare par
  `docs digest --phase <id>`, ce n'est pas un projet cassé.

## Test Plan

- [x] Unit : extraction de plages, citation valide/invalide.
- [x] Intégration : source temporaire + phase + digest.

## Acceptance Traceability

| Acceptance criterion | Test proving it |
| --- | --- |
| Given une phase avec des sections ciblées déclarées, when `docs digest… | `test/docs.test.js::docs digest copies the declared line ranges and cites them` |
| Given une citation, when elle est vérifiée, then `fichier:ligne` point… | `test/docs.test.js::docs digest refuses a citation that does not point at real lines` |
| Given un digest déjà généré et une source modifiée, when `docs digest`… | `test/docs.test.js::docs digest regenerates and overwrites a stale digest` |
| Given une phase sans sections ciblées, when `digest` tourne, then mess… | `test/docs.test.js::docs digest without declared sections says so and writes no file` |
| Given `check`, when le digest d'une phase pointe vers une ligne dispar… | `test/check.test.js::check warns when a phase digest cites lines the source no longer has` |

## Commands

- Command: `npm test`
  - Expected: la suite complète passe.

## Rollback

Revert du commit de la story ; aucune migration de données hors champs additifs.
