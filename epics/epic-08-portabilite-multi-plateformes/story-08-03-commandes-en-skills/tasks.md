# Tasks — Story 08.03

- [x] Inventorier ce que chaque plateforme lit réellement (`opencode debug skill`, doc embarquée de `codex` et `gemini`) ; noter les preuves.
- [x] Tests rouges : rendu `SKILL.md`, frontmatter strict, idempotence, retrait par empreinte, `--dry-run`.
- [x] Rendu partagé + adaptateurs ; branchement dans `install.js`.
- [x] Migration des anciens fichiers et des alias.
- [x] Test d'intégration OpenCode (auto-skip).
- [x] README (tableau, symlink/EPERM), CHANGELOG, `docs/architecture.md`.
- [x] `npm test`, puis `/flow-review`.

## Result

### What changed

- `bin/lib/platforms/skills.js` : rendu `SKILL.md` partagé (`name` + `description` quotée) et parseur strict (champs requis, nom valide, deux-points non quoté refusé).
- `bin/lib/platforms/{claude,opencode,codex,gemini,antigravity}.js` : `renderCommand` produit désormais `<nom>/SKILL.md` ; l'ancien rendu reste disponible sous `renderLegacyCommand` pour la migration.
- `bin/lib/install.js` : installation des skills pour les 5 plateformes, retrait des anciens fichiers par empreinte de contenu, conservation nommée des fichiers modifiés, `--dry-run`, et refus d'écrire à travers un symlink utilisateur.
- `bin/lib/platforms/ensure.js` : marqueurs de self-heal déplacés vers les skills, avec les anciens chemins conservés pour détecter une installation à migrer.
- `bin/ai-learn.js` : `install --dry-run` et aide mise à jour.
- `bin/lib/{init,update,check}.js` : messages « skills » au lieu de « commandes ».
- `README.md`, `docs/architecture.md`, `CHANGELOG.md` : emplacements, preuves, migration et changement d'invocation.

### Proofs of read location

- OpenCode : `opencode debug skill` liste les 13 skills (canoniques + alias) ; test d'intégration `test/integration-opencode.test.js`.
- Gemini CLI : doc embarquée du paquet installé (`bundle/docs/cli/skills.md`, « User Skills: `~/.gemini/skills/` ») ; `~/.gemini/skills/` réellement peuplé sur la machine.
- Codex CLI : binaire codex-cli 0.138.0 (`$CODEX_HOME/skills`, commande TUI `/skills`) ; `~/.codex/skills/` réellement peuplé.
- Antigravity : format `SKILL.md` déjà utilisé par l'adaptateur ; chemin non revérifié sur cette machine (Antigravity absent), découverte live non vérifiée — laissé à son format actuel.
- Claude Code : `~/.claude/skills/<nom>/SKILL.md` (chargeur de skills ; OpenCode auto-charge aussi ce chemin).

### Validation

- `npm test` : 801 tests, 801 pass, 0 fail (dont l'intégration OpenCode réelle).
- `install --dry-run` vérifié en test unitaire et via le CLI : aucune écriture, aucun retrait.

### Review follow-ups

- Un skill réécrit alors qu'il différait est sauvegardé en `SKILL.md.bak` et listé par `install`.
- Un ancien lien symbolique vers n'importe quel `ai-learn/commands/*.md` (dépôt déplacé) est reconnu et retiré.
- `update` nomme les fichiers conservés.

### Remaining risks

- La découverte réelle par Claude Code, Codex, Gemini et Antigravity n'a pas été exercée dans une session modèle (pas d'abonnement / pas de session live) ; seuls OpenCode et les emplacements sur disque sont prouvés.
- Un fichier pré-04.05 dont le contenu ne correspond plus au rendu legacy courant est conservé par prudence (il n'est pas byte-identique à ce que l'outil génère aujourd'hui) ; le nouvel alias déprécié est tout de même installé. `install` le nomme ; `update` n'en affiche que le compte.
- Un skill étranger (sans en-tête `# ai-learn:` ni note de dépréciation) n'est jamais écrasé : il est conservé et nommé. En revanche, un skill généré puis modifié par l'utilisateur en gardant cet en-tête est réécrit à l'install suivante — choix assumé, l'en-tête sert de preuve d'appartenance.

### Rollback Notes

- Revenir au commit précédent puis relancer `ai-learn install <plateforme>` : les skills restent sur disque, les anciens fichiers de commande ne sont pas recréés. Supprimer les répertoires `skills/<nom>` et réinstaller l'ancienne version restaure les commandes natives.

## Status: done
