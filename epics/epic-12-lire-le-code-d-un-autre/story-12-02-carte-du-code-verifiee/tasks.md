# Tasks — Story 12.02

- [x] Relire `citation.js`, `reviews.js` et la boucle des artefacts de `check.js`.
- [x] Tests rouges (voir plan).
- [x] `citation.js` : extraction de toutes les citations sous une racine.
- [x] `codemap.js` : racine(s), minimum, verdict par citation.
- [x] `check.js` : erreur ou avertissement selon l'état, `--json`.
- [x] README (format de la carte), AGENTS.
- [x] `npm test`, puis `/flow-review`.

## Status: done

## Result

- `citation.js` : `allFileLines`. `codemap.js` (nouveau) : `codeMapState`, `checkCodeMaps` ; `check.js` l'appelle par phase et expose `codeMaps` dans `--json`. Erreur seulement pour une phase `done` dont la racine est joignable ; racine absente ou citation non résolue avec une autre racine absente → avertissement (`unverified`). README, AGENTS, version 0.6.10 (scaffold : AGENTS).

### Rollback Notes

### Review fixes (0.6.11)

- host:port ignorés comme citations ; `./x` et `x` dédupliqués ; résolution contre la première racine où le fichier existe ; une carte qui se cite elle-même est invalide. Tests : symlink, plusieurs cartes. Evidence : `.coding-flow/runs/*-review.json`.
