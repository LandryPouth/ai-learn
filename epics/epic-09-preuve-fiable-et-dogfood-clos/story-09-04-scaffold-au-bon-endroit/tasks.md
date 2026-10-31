# Tasks — Story 09.04

- [x] Tests rouges (gitignore, dossier, imbrication, remontée, JSON, paquet).
- [x] `findProjectDir` + résolution commune dans `bin/ai-learn.js`.
- [x] `readJson` avec erreur détaillée ; messages `status`/`next`/`verify`/`check`.
- [x] `init` : dossier choisi, refus d'imbrication, `.gitignore` ; `update` : `.gitignore`.
- [x] `package.json#files`.
- [x] `commands/learn.md` §5, QUICKSTART si concerné.
- [x] `npm test`
- [~] `/flow-review` : auto-relecture seulement (STANDARD, opt-in)

## Result

### Rollback Notes

## Status: done

Changements : `bin/lib/gitignore.js` (nouveau), `init.js` (`chooseInitDir`, `.gitignore`), `update.js`, `progress.js` (`findProjectDir`, `missingProgressMessage`), `ai-learn.js` (résolution depuis un sous-dossier), `check.js`, `package.json#files`, `commands/learn.md` §5. Tests : init, update, cli, package.

Risque restant : la remontée du `progress.json` ne couvre pas `scan`, `propose`, `mode`, `ledgers` (hors liste de la spec).
