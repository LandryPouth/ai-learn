# Plan — Story 13.05

## Implementation Context

Fichiers probables :

- bin/lib/memory-proposals.js (nouveau : résolution des preuves, écriture, lecture des statuts)
- bin/lib/memory.js (lecture des `accepted` pour la fiche ; agrégat de friction avec `--root`)
- bin/lib/dogfood.js (lecture des titres d'entrées, si un parseur existe déjà)
- bin/lib/util.js (`findLearningProjects`)
- bin/ai-learn.js, templates/AGENTS-apprentissage.md, README
- test/memory-proposals.test.js, test/memory.test.js

Ancres : `_templates/proposal.md` (vault), `findLearningProjects`, `### <low|medium|high>`

Mode : `STANDARD` · scout pre-step : `no`

À éviter : `predictions.js` (13.04/13.06), le guard.

## Decisions

- **L'acceptation reste dans Obsidian** : c'est la porte que le vault impose (« une par une, jamais un lot »). Un `--accept` en CLI serait appelable par l'agent.
- **Limite assumée** : l'outil ne peut pas prouver que c'est l'humain qui a passé `accepted`. Le risque est visible dans l'historique git du vault (commits `vault:`), et documenté.
- **Preuves résolues, pas seulement formatées** : même exigence que `citation.js` pour les `fichier:ligne`.

## Test Plan

Vault et home injectés ; deux projets fixtures avec prédictions, un kata, un `dogfood.md`. Cas : preuve introuvable, seuil idée fausse, écriture, statut accepté à la main, proposé non montré, agrégat de friction, doublon de titre.

## Acceptance Traceability

| Critère | Preuve |
|---|---|
| preuve introuvable | test/memory-proposals.test.js::an unresolved evidence id refuses the proposal |
| seuil | test/memory-proposals.test.js::a misconception needs two pieces of evidence |
| écriture | test/memory-proposals.test.js::a proposal is written as proposed with its evidence |
| accepté | test/memory.test.js::accepted misconceptions reach the card |
| proposé caché | test/memory.test.js::proposed misconceptions stay off the card |
| friction | test/memory.test.js::friction entries are aggregated by surface |
| doublon | test/memory-proposals.test.js::a duplicate title is refused |

## Commands

```
npm test
```
