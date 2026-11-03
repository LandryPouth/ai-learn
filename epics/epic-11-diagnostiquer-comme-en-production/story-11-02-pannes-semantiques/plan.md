# Plan — Story 11.02

## Implementation Context

Fichiers probables :

- bin/lib/faults.js (nouveau : `FAULT_OPERATORS`, résolution par pack)
- bin/lib/stacks/javascript.js (champ `faults`)
- bin/lib/mutate.js (exporter ce qui sert à trouver des sites pour une liste d'opérateurs donnée, sans changer `mutate`)
- bin/lib/incident.js (candidats `faults` puis `mutators`, id d'opérateur dans le record, affichage du mécanisme)
- templates/AGENTS-apprentissage.md (§3sexies : les pannes possibles sont nommées), README.md
- test/faults.test.js (nouveau), test/incident.test.js, test/mutate.test.js

Ancres : `MUTATION_OPERATORS`, `FALLBACK_MUTATORS`, `findAllSites`, `applyMutant`, `stripStringsAndComments`, `JSX_EXTS`, `MAX_ATTEMPTS`

Mode : `STRICT` (écriture dans `src/**` de l'apprenant) · scout pre-step : `no`

À éviter : la liste `mutators` des packs, `scan.js`.

## Decisions

- **Champ `faults` séparé de `mutators`** (voir index de l'epic) : `mutate` reste stable, aucune preuve existante ne bascule.
- **Remplacement ligne à ligne, sans AST** : zéro dépendance, même discipline que `mutate` (sous-détecter plutôt que deviner). Les pannes multi-lignes sont différées.
- **Priorité aux pannes sémantiques dans le tirage**, repli sur les mutants : un incident reste toujours possible là où 10.04 en produisait un.
- **Ligne vidée, jamais supprimée** : la comparaison `exact` (±2 lignes) reste juste.

## Test Plan

Table de cas par opérateur (match / non-match) dans `test/faults.test.js` ; incident de bout en bout avec `await-removal` ; repli sur `comparison-operator` ; non-régression de `mutate` sur la fixture existante (mêmes mutants) ; affichage du mécanisme au resolve.

## Acceptance Traceability

| Critère | Preuve |
|---|---|
| await de bout en bout | test/incident.test.js::break injects a semantic fault and keeps the site secret |
| table de cas | test/faults.test.js::each fault operator rewrites only the expected text |
| repli | test/incident.test.js::break falls back to mutators when no semantic site is detectable |
| mécanisme révélé | test/incident.test.js::resolve names the fault mechanism |
| mutate inchangé | test/mutate.test.js::mutate never draws from the fault bank |
| pack sans faults | test/incident.test.js::a pack without faults behaves as before |

## Commands

```
npm test
```
