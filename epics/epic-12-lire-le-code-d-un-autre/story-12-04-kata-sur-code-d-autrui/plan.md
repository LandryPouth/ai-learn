# Plan — Story 12.04

## Implementation Context

Fichiers probables :

- bin/lib/review.js (option `from`, sélection des fichiers, chemins relatifs, palier 3)
- bin/lib/tracks/review.js (palier 3)
- bin/lib/citation.js (résolution de racine de 12.01, si 12.01 est livrée ; sinon la même logique locale)
- bin/lib/next.js, bin/lib/progress.js (tag `kata` chaîne)
- bin/ai-learn.js (`--from`), README.md
- test/review.test.js, test/next.test.js

Ancres : `walkSources`, `detectStack`, `ALL_SOURCE_EXTS`, la génération de 12.03

Mode : `STANDARD` · scout pre-step : `no`

À éviter : toute écriture hors de `katas/` et de `~/.ai-learn/`.

## Decisions

- **Lecture seule sur la source** : on copie les fichiers touchés, on n'écrit jamais dans `--from`.
- **Bornes de taille** (20 fichiers, 2 000 lignes) : un kata doit rester relisible en une séance.
- **Palier 3 au seuil de la moitié** : sur du code inconnu, trouver tout est rare ; hypothèse à recalibrer.

## Test Plan

Dossiers temporaires hors projet : génération et intégrité de la source, exclusions (minifié, `node_modules`, tests), chemin absent, palier 3, `kata.due` avec chemin.

## Acceptance Traceability

| Critère | Preuve |
|---|---|
| source intacte | test/review.test.js::review from a foreign folder leaves it untouched |
| exclusions | test/review.test.js::minified files and nested node_modules are skipped |
| chemin absent | test/review.test.js::review from a missing path is refused |
| palier 3 | test/review.test.js::half the defects on foreign code reaches tier 3 |
| kata dû | test/next.test.js::a kata tag with a path makes a foreign kata due |

## Commands

```
npm test
```

## Result

- `review --from <chemin>` (`bin/lib/review-source.js`, `review.js`, `mutate.js#findSitesInFiles`) : source lue seule, jusqu'à 20 fichiers JS/TS de 2 000 lignes, hors tests, minifiés et `node_modules`. L'en-tête « Source : » est neutralisé contre une fausse citation `fichier:ligne`.
- Palier 3 au ledger `tracks/review.json` (optionnel sur disque, comblé à la lecture) ; `next` porte `kata.from` pour une phase taguée `"kata": "<chemin>"`.
- Revue : `isLearnerCode` compare désormais le premier segment à `..` ; tests ajoutés pour `~/`, le plafond de 20 fichiers et un chemin contenant `:ligne`.
- Validation : `npm test` (vert), `ai-flow verify`.
- Risque restant : seuil de la moitié des défauts à recalibrer à l'usage ; mélange JS/TS décidé à la majorité des fichiers.
