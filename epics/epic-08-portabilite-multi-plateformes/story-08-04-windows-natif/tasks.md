# Tasks — Story 08.04

- [x] Reproduire d'abord : exécuter la commande de hook écrite dans un dossier à espace (Linux suffit pour le quoting) ; noter le résultat.
- [x] Tests rouges : espace, `trash` absent, formes PowerShell/`cmd`.
- [x] Corrections minimales dans `guard.js` et `docs.js`.
- [x] Message de portabilité des commandes `verify` (si retenu après lecture de `exec.js`).
- [x] README : section Windows à trois niveaux de preuve.
- [~] `npm test` local (vert), puis run CI sur les trois systèmes ; `/flow-review`. *(`npm test` : 814/814 local. Le run `windows-latest` aura lieu au push ; `/flow-review` fait par un reviewer indépendant, findings traités ci-dessous.)*

## Result

### What changed

- `bin/lib/guard.js` : la commande du hook Claude est `node "<bin>" guard` (`guardHookCommand`), donc un chemin contenant un espace ne la casse plus. `ensureGuardHook` reconnaît la forme quotée **et** l'ancienne forme non quotée, et re-quote une entrée périmée au lieu d'en ajouter une seconde (migration `update`) — sans repointer un projet vers un autre checkout.
- `bin/lib/check.js` : `guardHookWired` utilise le même prédicat que `ensureGuardHook` (`isOwnGuardCommand`), donc `check`/`status` reconnaissent la commande quotée (sinon tout projet câblé paraissait non câblé).
- `bin/lib/docs.js` : `removePath` renvoie `"trash"` ou `"permanent"` ; quand `trash` est absent ou échoue (Windows natif), `removeSource` annonce explicitement la suppression définitive. Aucun `rm -rf` construit depuis un chemin.
- `bin/lib/exec.js` : `portabilityHint(result, platform)` détecte l'échec `cmd.exe` (anglais **et** français, `9009`) et renvoie la forme portable ; `verify` l'affiche après la sortie du checkpoint.
- `test/guard.test.js` : commande quotée générée depuis une copie du paquet dans un dossier à espace puis **exécutée** (refus `deny`, exit 2) ; migration d'un ancien hook non quoté ; caractérisation `Set-Content`/`Out-File`/`copy`/`move`/`New-Item` (autorisés) et redirection `cmd` (refusée).
- `test/check.test.js` : `guardHookWired` reconnaît la commande quotée.
- `test/docs.test.js` : `trash` absent simulé en vidant `PATH` — suppression effective + message « permanent ».
- `test/platforms.test.js` : le littéral `BINARY` du plugin OpenCode accepte `C:\Program Files\…`, le module généré parse comme ESM (`node --check`), et le spawn reste en tableau (aucun chemin interpolé dans un shell).
- `test/exec.test.js` : message de portabilité Windows (anglais/français), silence hors Windows et sur un run vert.
- `README.md` : section « Windows natif » à trois niveaux (CI / observé en session / non vérifié), plus « ce que la garde ne voit pas » et le comportement `cmd.exe` des checkpoints.
- `docs/conventions.md` : un test impossible sous Windows porte sa raison dans le test ; compte de tests actualisé.

### Validation

- `npm test` : 814 tests, 814 pass, 0 fail.
- `ai-flow verify --story …` : preuve capturée, `Coverage: evidence` (un test a bougé à côté du changement ; le projet n'émet pas de rapport de couverture).

### Review follow-ups

- Blocker corrigé : `check.js` ne reconnaissait pas la forme quotée → `guardHookWired` partage désormais le prédicat de `guard.js`.
- Migration corrigée : elle re-quote le chemin existant au lieu de le repointer vers le checkout courant.
- `portabilityHint` : ajout du libellé français et de `9009` ; plus de faux positif sur `127` seul.
- Tests renforcés : CRLF-safe pour le littéral du plugin, `move` couvert, `check` couvert.

### Remaining risks

- Le run CI `windows-latest` n'est pas observé dans cette session : il aura lieu au push. Aucun nouveau test n'est skippé par plateforme.
- Un refus réel de la garde dans une session Claude Code sous Windows, et le refus du plugin OpenCode sous Windows, restent non observés — le README le dit explicitement.
- Un chemin de checkout contenant `$`/backtick (sh) ou `%VAR%` (cmd) reste hors de portée d'une seule chaîne de commande portable ; limite écrite dans le code.

### Rollback Notes

- `git revert` du commit remet l'ancienne détection non quotée : un `update` ultérieur ajouterait alors une **seconde** entrée à côté de la commande quotée. Pour revenir en arrière, supprimer l'entrée `PreToolUse` quotée avant de relancer l'ancienne version (ou garder cette version). Le repli `trash` n'introduit aucune migration de données.

## Status: done
