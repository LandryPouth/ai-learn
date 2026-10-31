# Tasks — Story 10.04

- [x] Lire `mutate.js` (backup/verrou) et `tracks/git.js` ; lister les exports nécessaires.
- [x] Tests rouges (voir plan).
- [x] `tracks/debug.js`, type de prédiction `debug`.
- [x] `incident.js` : préconditions, tirage, détectabilité, niveaux, record secret, resolve, giveup.
- [x] Guard : chemin protégé + matcher `Read|Grep|Glob`.
- [x] `next`, `status`, `check` ; `commands/learn-break.md` ; §3sexies d'AGENTS.
- [x] README (limite `git diff`), `docs/project-context.md`, `pistes-non-mesurees.md` (Partie A promue).
- [x] `npm test`, puis `/flow-review`.

## Result

## Status: done

Ajouté : `ai-learn break [--level 1|2] | --resolve | --giveup` (`bin/lib/incident.js`), ledger `tracks/debug.js`, type de prédiction `debug` (`--file`/`--line`), mur de lecture du secret dans le guard (Read/Grep/Glob + Bash, refus de `break --giveup` à l'IA, matcher du hook élargi et migré), `incident` dans `next`/`status` `--json` et en tête de texte, avertissement `check`, `/learn-break` (4e commande), §3sexies d'AGENTS, README, `.gitignore` du scaffold, version 0.6.0. Tests : 959 verts, dont `test/incident.test.js` et `test/tracks-debug.test.js`.

Revue indépendante (sous-agent, STRICT) : fuite Bash du secret, `--giveup` lancé par l'IA, écrasement de sauvegarde, preuve « prédit avant réparation », fenêtre verrou/état, chemins de prédiction, arbre git sali — tous corrigés avec test. Verify : vert, `Coverage: evidence` (pas de rapport lcov).

### Limites assumées
`git diff` côté apprenant révèle le site ; le mur de lecture ne tient que sous Claude Code (Codex/OpenCode : consigne) ; la preuve « prédit avant réparation » compare à la dernière édition des fichiers d'implémentation (toucher le site après coup la contourne) ; `--resolve` reste lançable par l'IA (il ne fuit rien tant que rouge). Non fait : test de kill réel du processus (couvert par le test du verrou orphelin).

### Rollback Notes
`git revert` du commit de la story. Rien dans le home à nettoyer hors `~/.ai-learn/incidents/` et `tracks/debug.json` créés à l'usage ; un projet mis à jour garde un matcher de hook élargi, inoffensif.
