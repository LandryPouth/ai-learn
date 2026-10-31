# Tasks — Story 10.07

- [x] Tests rouges (voir plan).
- [x] `templates/bilan.md` + `bin/lib/bilan.js`.
- [x] Branchements `verify`, `check`, `status`.
- [x] `learn-next.md` (parcours terminé) ; README.
- [x] `npm test`.

## Result

## Status: done

Ajouts : `bin/lib/bilan.js`, `templates/bilan.md`, `test/bilan.test.js`. Branchements : `verify` (génération après la dernière phase, jamais d'écrasement), `check` (erreurs nommant la section, seulement parcours terminé), `status` (text + `--json` `bilan`), `commands/learn-next.md`, README. 12 tests existants à projet mono-phase terminé reçoivent `writeCompleteBilan` (helper) : un parcours fini doit désormais un bilan. Placement automatique impossible (fusion `┴` de l'epic) : exécuté sur la branche courante, comme 10.01–10.06.

### Rollback Notes
