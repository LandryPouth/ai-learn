# Tasks — Story 10.02

- [x] Tests rouges (validation, CLI, check, status).
- [x] `bin/lib/profile.js` + sous-commande `profile`.
- [x] Branchements `status` / `check`.
- [x] `learn.md` (création au premier lancement) et `learn-next.md` (calibrage + transfert).
- [x] README, `docs/project-context.md`.
- [x] `npm test` ; `/flow-review` non lancé (STANDARD, opt-in).

## Status: done

## Result

- `bin/lib/profile.js` (nouveau) : `validateProfile`, `readProfile` (absent / invalide / valide), `setProfile` (écriture via `writeLedgerFile`, donc refus du home réel sous `node --test`), `profileCommand`.
- `bin/ai-learn.js` : sous-commande `profile` (`--json`, `set --json '<objet>'`) + aide.
- `status.js` : ligne « profil : … » ; `check.js` : erreur nommant `~/.ai-learn/profile.json`.
- `commands/learn.md` (§0 bis : création au premier lancement, jamais redemandé) et `learn-next.md` (calibrage `dailyMinutes`, transfert via `projects[]`).
- README et `docs/project-context.md`. Tests : `test/profile.test.js` (nouveau), 2 tests ajoutés à `test/commands.test.js`.
- Placement : `ai-flow worktree place` a refusé l'arbre de dépendances de l'epic (ligne `s2 ── s3 ──┬── s6`) ; exécuté séquentiellement dans le checkout principal, comme 10.01 (cf. `docs/DOGFOODING.md`).
- Pas de bump de version : `package.json` est déjà à 0.5.0 pour l'epic 10.

### Rollback Notes

`git revert` du commit.
