# Tasks — Story 10.01

- [x] Calculer et figer les empreintes des skills retirés (toutes plateformes, versions publiées depuis 08.03) dans `bin/lib/platforms/retired.js`, avant de toucher aux sources.
- [x] Vérifier par plateforme la lecture des fichiers annexes d'un skill ; noter la preuve ou choisir le repli inline.
- [x] Tests rouges (voir plan).
- [x] Déplacer `learn-{scan,propose,check,docs}.md` → `commands/references/` ; réécrire `learn.md` (routage) et `learn-next.md` (`check` silencieux).
- [x] Supprimer `COMMAND_ALIASES` ; rendu des références ; retrait par empreinte dans `install.js`.
- [x] AGENTS template, README, CHANGELOG, `docs/architecture.md`, `docs/project-context.md`.
- [x] `npm test`, puis `/flow-review`.

## Result

Changed:

- `commands/` ne contient plus que `learn.md`, `learn-next.md`, `learn-status.md` ; `learn-{scan,propose,check,docs}.md` → `commands/references/{scan,propose,check,docs}.md` (`git mv`, octets inchangés), installés dans `<skill learn>/references/` (corps seul, sans frontmatter, donc jamais un skill).
- `bin/lib/platforms/commands.js` : `COMMAND_ALIASES` supprimé ; `listCommands` ne rend que les 3 commandes ; `listReferences` ; `listLegacyCommands` (interne à la migration pré-08.03, jamais installé).
- `bin/lib/platforms/retired.js` : SHA-256 des rendus publiés (fe34111, bed8222, d274e60, f1227fb ; 5 plateformes ; 10 noms retirés), reconstruits depuis `git show <rev>:commands/…` avec les rendus de l'époque.
- `bin/lib/install.js` : `retireSkills` (retiré / « conservé (modifié) » / non touché), références écrites avec protection symlink sur chaque dossier intermédiaire, `--dry-run` fidèle ; `update.js` compte les retraits.
- `learn.md` (routage §0), `learn-next.md` (`check` silencieux), template AGENTS, README, CHANGELOG, docs/architecture.md, docs/project-context.md.
- Tests : install (fresh, retrait par empreinte × 5 plateformes, modifié, CRLF, dry-run, idempotence, dossier non vide, symlink, référence éditée/périmée), commands (routage), init (AGENTS/README), plateformes, OpenCode `debug skill`. Fixture `test/fixtures/published-f1227fb/` = octets publiés.

Validation: `node --test` — 927 pass / 0 fail (OpenCode `debug skill` exécuté, binaire présent).

Écarts / à savoir:

- Critère « 5 plateformes à l'emplacement déjà prouvé » : l'accès aux fichiers annexes est prouvé pour Gemini (doc embarquée : le dossier du skill est autorisé en lecture) et OpenCode (références non listées comme skills) ; **non prouvé** pour Codex et Antigravity. Le repli « références inlinées » n'est pas implémenté faute de preuve d'un besoin.
- `ai-flow worktree place` a échoué sur l'arbre de dépendances de l'epic (ligne `s2 ── s3 ──┬── s6`) ; story exécutée dans le checkout courant, voir `docs/DOGFOODING.md`.
- Revue indépendante (sous-agent) faite : empreintes recalculées et identiques, aucun blocage. Corrigés : `references/propose.md` citait encore `/learn-propose` ; `update` nomme les skills retirés ; échec EPERM/EACCES/EBUSY à la suppression → conservé, pas d'abandon ; `package.json` 0.5.0 (RULES.md Versioning). Non traités : en-têtes `# ai-learn: learn-*` des références conservés (reconnaissance « à nous »), ambiguïté du tableau de routage si `/learn <techno>` dans un dossier avec code.

## Status: done

### Rollback Notes

`git revert` du commit. Côté utilisateur : un skill retiré n'est supprimé que s'il est byte-identique à une version publiée (rien d'édité n'est perdu) ; les skills retirés se recréent avec le tag précédent via `ai-learn install`. Les `.bak` déjà écrits ne sont pas touchés.
