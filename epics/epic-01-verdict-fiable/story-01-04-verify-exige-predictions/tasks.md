# Tasks — Story 01.04

## Status: done

## Pre-Implementation

- [x] Lire `plan.md` (Implementation Context)
- [x] Relire le `## Result` de la story 01.03 (schéma exact des données)
- [x] Relire le calcul de `ok` dans `verify.js` et la forme des messages norme/artefacts

## Implementation Tasks

- [x] Ajouter `predictionsReport({ dir, phase })` dans `bin/lib/predictions.js`
- [x] Brancher le facteur dans le calcul de `ok` de `verify`, calculé inconditionnellement
- [x] Ajouter la section prédictions à l'évidence, symétrique de `norm`
- [x] Afficher le manque au format des violations de norme
- [x] Signaler (sans bloquer) l'anomalie d'antériorité
- [x] Faire consommer le même rapport par `check`
- [x] Écrire la limite dans `README.md` et `templates/AGENTS-apprentissage.md` :
      l'ordre d'écriture est contrôlé, l'honnêteté ne l'est pas

## Testing Tasks

- [x] Étendre `test/verify.test.js` (9 cas)
- [x] Étendre `test/predictions.test.js` (3 cas d'antériorité)
- [x] Étendre `test/check.test.js` (cohérence des comptes)

## Validation Tasks

- [x] `npm test`
- [x] `node bin/ai-learn.js check --root .`
- [ ] Vérifier sur le dogfood Fastify qu'aucun `verify` ne se met à bloquer
      (aucun projet dogfood Fastify trouvé sur cette machine — non exécutable ;
      couvert à la place par le test unitaire retro-compat : "verify never
      blocks a legacy project with no predictions.json at all")

## Result

Ajouté `predictionsReport({ dir, phase })` et `formatPredictionsGap(phase, report)`
dans `bin/lib/predictions.js` : le calcul par-phase (compte, manquant, anomalies
d'antériorité) vit à un seul endroit, consommé par `verify.js` (bloquant) et
`check.js` (avertissant, message identique). `verify.js` calcule la section
`predictions` inconditionnellement (même schéma que `norm`), l'ajoute au facteur
`ok`, et journalise le manque et les anomalies sans que l'un masque l'autre en
cas de `stressCheckpoint` en échec simultané. Rétro-compatibilité : un projet
sans `.ai-learn/predictions.json` du tout n'est jamais bloqué (`missing` reste 0) ;
un fichier présent mais corrompu, en revanche, bloque (traité comme
« manquant, pas absent », pour ne pas ouvrir une échappatoire par corruption).
`check.js` a été refactoré pour consommer `predictionsReport`/`formatPredictionsGap`
côté JSON, en gardant son propre comptage `.md` seulement pour le cas hérité
sans JSON (`predictionsReport` ne sait pas lire le `.md`).

### Files Changed

- `bin/lib/predictions.js` — `predictionsReport`, `formatPredictionsGap`
- `bin/lib/verify.js` — facteur prédictions dans `ok`, section évidence, logs
- `bin/lib/check.js` — consomme le rapport partagé au lieu de recompter
- `test/predictions.test.js` — 5 tests (antériorité × 3, rétro-compat, corruption)
- `test/verify.test.js` — 8 tests (blocage, déblocage, évidence, `--no-mark`, stress)
- `test/check.test.js` — 1 test de cohérence check/verify
- `README.md`, `templates/AGENTS-apprentissage.md` — limite documentée

### Tests And Validation

- Command: `npm test`
  - Result: 375/375 passed
- Command: `node bin/ai-learn.js check --root .`
  - Result: exit 0 (aucun projet d'apprentissage à la racine de ce dépôt)
- Command: `npx @landry_pouth/coding-flow verify --story <dir>`
  - Result: green (`npm test`), evidence captured

### Post-Review Fixes

La revue de cette story a relevé deux points non-bloquants, corrigés dans la
foulée :

- **Test gap (P2)** : le chemin antériorité n'était couvert qu'au niveau
  unitaire (`predictions.test.js::predictionsReport`), jamais à travers
  `verifyCommand` — l'AC exige pourtant que l'anomalie apparaisse « dans la
  sortie et dans l'évidence » de `ai-learn verify`. Ajouté
  `test/verify.test.js::verify signals — never blocks on — a prediction
  recorded after its own revelation`, qui pose un `predictions.json` écrit à
  la main (antériorité inversée) et vérifie le bloc de log `Antériorité
  prédiction/révélation` et `evidence.predictions.anomalies` en bout de
  chaîne.
- **Quality (P3)** : `check.js` lisait déjà `predictions.json` une fois
  (`readPredictions(dir)`), puis `predictionsReport` le relisait et le
  reparsait à chaque phase exigeant des prédictions dans la boucle —
  I/O redondante à chaque `check`. `predictionsReport({ dir, phase,
  predictions })` accepte désormais l'objet déjà lu en paramètre optionnel ;
  `check.js` passe le sien, `verify.js` (un seul appel par run) continue de
  laisser `predictionsReport` lire lui-même.

### Rollback Notes

Retirer `predReport.missing === 0` du calcul de `ok` dans `verify.js` (une ligne)
et l'appel à `predictionsReport` dans `check.js` (revert vers le comptage
`countsByPhase` seul) suffit à annuler le blocage ; les évidences déjà écrites
gardent leur section `predictions`, jamais relue comme un blocage par du code
plus ancien.
