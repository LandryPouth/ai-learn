# Tasks — Story 08.01

- [ ] Lire `coding-flow/bin/lib/opencode.js` et `test/opencode-guard.test.js` ; relever les noms d'arguments d'outils OpenCode vérifiés (`filePath`, `newString`, `patchText`).
- [ ] Vérifier sur `opencode 1.19.3` que `.opencode/plugins/*.js` est chargé (`opencode debug config`, `opencode debug info`).
- [ ] Écrire les tests rouges du plugin généré (write, edit, bash, apply_patch, read, fail-open).
- [ ] Implémenter `bin/lib/platforms/opencode-guard.js`.
- [ ] Câbler `init`, `update`, `check` ; test d'absence de fichier hors OpenCode.
- [ ] Observer un vrai refus dans OpenCode ; consigner le constat.
- [ ] README : cellule OpenCode, seulement après le constat ; `docs/architecture.md` ; `docs/project-context.md` si l'état change.
- [ ] `npm test`, puis `/flow-review`.

## Result

### Rollback Notes
