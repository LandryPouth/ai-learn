# Tasks — Story 12.04

- [x] Relire `review.js` (12.03) et `scan.js#walkSources`.
- [x] Tests rouges (voir plan).
- [x] `review.js` : `--from`, sélection, chemins relatifs, en-tête « Source ».
- [x] `tracks/review.js` : palier 3.
- [x] `next`/`progress` : tag `kata` chaîne ; CLI ; README.
- [x] `npm test`, puis `/flow-review`.

## Status: done

## Result

- `review-source.js` (nouveau) : résolution du chemin (`~`, relatif au projet), sélection (JS/TS, hors tests, `.d.ts`, minifiés, > 2 000 lignes, `node_modules` imbriqués ; 20 fichiers, les plus longs d'abord, ordre stable), `isLearnerCode` (pas de palier 3 sur `src/**`). `mutate.js` : `findSitesInFiles` (boucle de détection extraite en `collectSites`, partagée avec `findAllSites`). `review.js` : option `from`, secret `from`/`foreign`, ligne « Source : » dans `kata.diff` et `revue.md`, palier 3 au reveal, `kataOffer` (porte le chemin). `tracks/review.js` : palier 3 optionnel sur disque (un ledger antérieur reste valide). `next` : `kata.from`; `progress` : tag `kata` booléen ou chemin. Version 0.6.14 (scaffold : AGENTS).
- Écarts : le test « kata dû » vit dans `review.test.js` (comme celui de 12.03). Pas de repli `mutators` hors pack JS/TS ; pas de défaut possible hors banque → refus explicite.

### Rollback Notes
