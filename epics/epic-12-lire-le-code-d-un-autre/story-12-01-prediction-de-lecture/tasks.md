# Tasks — Story 12.01

- [x] Relire `predictions.js` (création, reveal, décompte) et `citation.js`.
- [x] Tests rouges (voir plan).
- [x] `citation.js` : résolution de racine et vérification sous racine.
- [x] `predictions.js` : type `lecture`, reveal `--found`, score, rendu.
- [x] `status.js`, CLI, §1 d'AGENTS, README.
- [x] `npm test`, puis `/flow-review`.

## Status: done

## Result

- `citation.js` : `resolveReadingRoot`, `checkFileLineUnderRoot` (racine déclarée, liens symboliques suivis, ligne dans le fichier ; réutilisables par 12.02). `predictions.js` : type `lecture` (`readingBet`, `scoreReading`, tolérance 10), `--found` au reveal, rendu `.md`, `readingSummary` ; une prédiction `lecture` non révélée n'est pas comptée. `status.js` : ligne « lecture ». CLI `--root`/`--found`, §1 d'AGENTS, gabarit, README. Version 0.6.9 (scaffold : AGENTS).
- Le reveal exige toujours le feedback complet (gaps, score, strengths, weaknesses, flash) en plus de `--found`.
- Limites : l'outil prouve l'existence de l'emplacement, pas le mécanisme ; `--root` est stocké tel que saisi et résolu au reveal (portable d'une machine à l'autre).
- Revue : `bilan` ignore les prédictions `lecture` non révélées (`isCountedPrediction`, partagé avec `verify`) ; tests des racines `~/` et relative.

### Rollback Notes
