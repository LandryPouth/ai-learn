# Tasks — Story 11.02

- [x] Relire `mutate.js` (`findAllSites`, `applyMutant`) et `incident.js#trial` ; lister ce qu'il faut exporter.
- [x] Tests rouges (voir plan).
- [x] `faults.js` : cinq opérateurs, `label`, `mechanism`.
- [x] Pack JS : champ `faults`.
- [x] `incident.js` : candidats ordonnés, id dans le record, mécanisme affiché.
- [x] §3sexies, README (liste des pannes possibles, limites du remplacement ligne à ligne).
- [x] `npm test`.

## Result

### Rollback Notes

## Status: done

## Result

- `bin/lib/faults.js` (nouveau) : `FAULT_OPERATORS` (cinq opérateurs, `label`, `mechanism`), `resolveFaults`. Champ `faults` du pack JS.
- `mutate.js#findAllSites(dir, { bank: "faults" })` : sites sémantiques, JSX sans `await`/`throw`, `throw`→`return` jamais tiré en module ES ; vérification lazy `site.rejects` (réécriture qui ne s'analyse plus, `release()` sous un en-tête de contrôle). `mutate` inchangé.
- `incident.js` : `keepDetectableSite` essaie les pannes sémantiques puis les mutants ; `logMechanism` au `--resolve` et `--giveup`.
- README, AGENTS §3sexies.
- Revue STRICT indépendante (sous-agent, 3 tours) : tour 1 fail (3 P1 : `throw`/`release` cassant la syntaxe, aucune barrière de parsing), tour 2 fail (P1 perf quadratique, ESM, flux de contrôle sous en-tête, ASI), tour 3 pass ; P2 restant (`.mjs`) corrigé. Résiduel documenté : guillemet dans un littéral regex, `*.release()` hors pool nommé « connexion », fichiers `.ts`/> 100 Ko sans barrière de parsing.
- Revue finale (self, pass, 3 P3) : `throw-to-return` n'est plus tiré en `.ts`/`.tsx`/`.cts` (retour typé), test de repli quand tous les sites sémantiques sont rejetés. Budget d'essais non partagé entre banques : conforme au spec.
- Validation : `ai-flow verify` vert (`npm test`, 1060 tests). Coverage: evidence.

### Rollback Notes

`git revert` ; aucun ledger ni record modifié (l'id d'opérateur reste une chaîne dans le record d'incident).
