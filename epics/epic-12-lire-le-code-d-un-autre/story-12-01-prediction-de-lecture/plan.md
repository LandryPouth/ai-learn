# Plan — Story 12.01

## Implementation Context

Fichiers probables :

- bin/lib/predictions.js (type `lecture`, champs `root`/`file`/`line`/`found`/`score`, validation, rendu `.md`)
- bin/lib/citation.js (résolution d'une racine déclarée ; vérification d'un `fichier:ligne` sous une racine autre que le projet)
- bin/lib/status.js (ligne « lecture »)
- bin/ai-learn.js (`--root`, `--found`)
- templates/AGENTS-apprentissage.md (§1), templates/predictions.md si le gabarit liste les types, README.md
- test/predictions.test.js, test/citation.test.js, test/status.test.js

Ancres : `PREDICTION_TYPES`, `revealPrediction`, `isInsideRoot`, `findRealFileLine`, `countLines`, `normalizePortable`

Mode : `STANDARD` · scout pre-step : `no`

À éviter : `incident.js` (la comparaison `debug` reste la sienne).

## Decisions

- **Tolérance de 10 lignes** (contre ±2 pour `debug`) : on prédit un mécanisme, qui s'étend sur une fonction, pas une ligne fautive. Hypothèse à recalibrer sur les premières prédictions réelles.
- **Score `dossier`** en plus d'`exact`/`fichier`/`manqué` : deviner le bon module est déjà une compétence dans une grosse base.
- **La racine est stockée dans la prédiction**, pas dans `progress.json` : une phase peut lire plusieurs sources.
- **Vérification sous racine factorisée dans `citation.js`** : 12.02 la réutilise telle quelle.

## Test Plan

Fixture : une petite arborescence de source dans le dossier temporaire du test (`lib/route.js`, `lib/reply.js`), plus un lien symbolique qui sort de la racine. Cas : racine absente, scores `exact`/`fichier`/`dossier`/`manqué`, ligne hors fichier, évasion, décompte `verify`, ligne `status`.

## Acceptance Traceability

| Critère | Preuve |
|---|---|
| racine absente | test/predictions.test.js::a reading prediction needs an existing root |
| exact | test/predictions.test.js::a found line within ten lines is exact |
| dossier | test/predictions.test.js::a sibling file scores dossier |
| hors fichier | test/predictions.test.js::reveal refuses a line past the end of the file |
| évasion | test/citation.test.js::a citation escaping the declared root is refused |
| verify | test/predictions.test.js::unrevealed reading predictions do not count |
| status | test/status.test.js::status shows the reading line |

## Commands

```
npm test
```
