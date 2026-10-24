# Portabilité d'ai-learn : OpenCode d'abord, puis toutes les plateformes

> Étude, 2026-10-24. Rien n'est planifié ni construit. Tout ce qui est écrit ici est lu dans le code
> de `~/dev/tools/coding-flow` (0.14.0) et d'`ai-learn` (0.4.0), ou observé sur `opencode 1.19.3`
> installé localement. Ce qui n'a pas été exécuté est marqué **à vérifier**.

## 1. Où en est ai-learn

| Plateforme | Commandes `/…` | Garde `src/**` | Garde git/gh | Hook norm (PostToolUse) |
|---|---|---|---|---|
| Claude Code | oui | hook `PreToolUse` | hook | oui (07-03) |
| Codex | oui | bac à sable OS | non traité | non |
| Gemini CLI | oui | non câblé | non | non |
| **OpenCode** | oui, découverte vérifiée | **non câblé** | **non câblé** | **non** |
| Antigravity | oui | non câblé | non | non |

Le trou n°1 est OpenCode : le README dit « nécessiterait un plugin TS event-driven, pas encore écrit ».
Or ce plugin existe déjà, écrit, testé et vérifié en session réelle, dans Coding Flow.

## 2. Ce que Coding Flow a déjà résolu pour OpenCode

Source : `coding-flow/bin/lib/opencode.js` (394 lignes), `opencode-config.js`, décision 10 de
`docs/design-decisions.md`, tests `opencode-guard.test.js`, `platform-install-opencode.test.js`.

1. **Un plugin `.opencode/plugins/<nom>.js`** qui implémente `tool.execute.before` : un `throw` refuse
   l'appel. Vérifié par eux sur OpenCode 1.19, sous-agents compris (corrigé en amont,
   anomalyco/opencode#5894).
2. **Traduction des outils OpenCode vers la charge utile Claude** que la garde comprend déjà :
   `write` → `Write`, `edit` → `Edit`, `bash` → `Bash`, `apply_patch` → un `Write` par fichier du patch
   (c'est l'outil d'édition des modèles GPT ; sans lui la garde laisse passer toutes les éditions).
   `decide` reste inchangé : c'est la seule partie testée en profondeur.
3. **Exécution en processus** : OpenCode tourne sous Bun, le plugin charge `guard.js` via `createRequire`.
   Pas de `node` requis dans le PATH (un lanceur IDE n'en a souvent pas), pas de processus par écriture.
   Repli : `spawnSync` puis `npx` à version épinglée.
4. **Fail-open mais jamais silencieux** : seul un refus explicite bloque ; tout le reste est tracé
   (stderr + journal) comme « NOT checked ».
5. **Double format d'export** : OpenCode 1.x charge `default.server`, la 2.x charge `{ id, server, setup }` ;
   la 1.x appelle aussi `setup` avec un contexte partiel, d'où le retour anticipé sans `ctx.tool`.
6. **Marqueur de première ligne** (`// coding-flow:guard-plugin`) : un fichier avec le marqueur est
   régénéré librement, un fichier sans est celui de l'utilisateur et n'est pas touché. Même règle que
   `NORM_HOOK_MARKER` pour `settings.json`.
7. **`opencode.json` `instructions`** : OpenCode lit `CLAUDE.md` mais n'expand pas `@RULES.md`. Ils ajoutent
   `RULES.md` dans `instructions` (fusion non destructive, JSONC illisible → « skipped » nommé).
8. **Skills globaux** dans `~/.config/opencode/skills/*/SKILL.md`, plus lecture native de `.claude/skills`
   et `.agents/skills`.
9. **Sonde de version** `opencode --version` seule (la 2.x démarre un service en arrière-plan pour d'autres
   sous-commandes), `doctor` qui relit l'état `current | stale | foreign | absent`.

## 3. Écarts entre les deux dépôts

- ai-learn n'exporte pas d'`evaluate` : `decide(hook, root)` et `findProjectRoot` sont exportés, mais
  `guardCommand` lit stdin et fait `process.exit(2)`. Un plugin en processus appellerait `decide` directement,
  comme le fait `evaluate` de Coding Flow.
- La charge utile attendue est la même (`tool_name`, `tool_input.file_path`, `command`, `cwd`) : la table de
  traduction de la section 2.2 se réutilise telle quelle. Les noms `MultiEdit` et `NotebookEdit` n'ont pas
  d'équivalent OpenCode connu.
- ai-learn a un **second** besoin que Coding Flow n'a pas : `ai-learn mode`, `~/.ai-learn/**` et le ledger
  sont protégés. La traduction ne change rien, mais les tests doivent couvrir ces refus côté OpenCode.
- `ai-learn install opencode` écrit des commandes dans `~/.config/opencode/command/ai-learn/`. Coding Flow
  est passé aux **skills** (`skills/*/SKILL.md`) et a retiré les `command/*.md`. À arbitrer (section 6).

## 4. Le hook norm (PostToolUse) côté OpenCode : faisable, câblé

**Constat (OpenCode 1.19.3, session réelle `ses_e91e9f639ffeL6XlNWXrTlwd7h`).** `tool.execute.after`
reçoit `(input, output)` avec `input = { tool, sessionID, callID, args }` et
`output = { title, output, metadata }`. `output` est l'objet résultat déjà construit : le muter
fonctionne, et la mutation est ce que l'agent lit au tour suivant. Preuve : un plugin d'essai ajoute
`[PROBE-AFTER tool=write]` à `output.output` ; dans la sortie de
`opencode run --auto --format json` (modèle `opencode/deepseek-v4.1-flash-free`, répertoire
`/tmp/ai-learn-norm-spike-zwI3tI`), la partie `tool_use` du `write` porte
`output: "Wrote file successfully.\n[PROBE-AFTER tool=write]"`, et le texte final du modèle reprend
cette ligne — il l'a bien vue. L'événement est aussi déclenché pour `bash`, et `input.args` contient le
chemin écrit (`filePath`), donc pas besoin de relire stdin.

Ce qui n'est pas offert : remplacer le résultat par un objet neuf, ou bloquer l'écriture depuis
`after` — ce qui convient, `norm` est consultatif. Le plugin de 08-01 enregistre donc
`tool.execute.after` : pour `write`/`edit`/`apply_patch`, il charge `lib/norm.js` en processus et
appelle `normHookContext` — la fonction que le CLI `ai-learn norm --hook` enveloppe — une fois par
fichier, ajoute le contexte à `output.output` s'il y a violation, et ne touche à rien sinon. Le
chargement en processus évite de spawner `node` (OpenCode compilé sous Bun n'en a pas, et
`process.execPath` y désigne OpenCode lui-même). Un module absent, une exception ou un fichier
illisible sont avalés : l'écriture n'est jamais bloquée.

**Preuve du plugin réel** (session `ses_e91e41134ffeZQ99FwZcZ50mOQ`, même commande) : le `write` de
`src/index.js` rend `"Wrote file successfully.\n\nai-learn norm — 1 violation(s) dans src/index.js
(non bloquant) :\n  src/index.js:1 — function \`tooLong\` is 7 lines (max 3) [function-length]\n..."`
et le modèle répond en citant la règle et en laissant l'apprenant refactorer.

## 5. Portabilité hors OpenCode

**Windows natif.** `docs/plans/windows-native.md` de Coding Flow liste six points ; trois concernent ai-learn :

- Le hook Claude d'ai-learn est `node <bin> guard` (`guard.js` ~ligne 1458), sans syntaxe POSIX : il est
  **meilleur** que celui de Coding Flow (`R=…; if [ -f … ]`). La CI d'ai-learn couvre déjà
  ubuntu/windows/macos × Node 18/20/22. Le chemin du binaire contenant un espace n'est pas testé : **à vérifier**.
- La grammaire de la garde ne lit que du shell POSIX (`>`, `tee`, `sed -i`, `cp`, `mv`). PowerShell
  (`Set-Content`, `Out-File`) et `cmd` (`copy`) ne sont pas analysés. Même limite que Coding Flow.
  Seuls Write/Edit sont fiables sous Windows ; c'est à écrire dans le README, pas à masquer.
- `exec.js` lance les checkpoints avec `shell: true` : `cmd.exe` sous Windows. Les commandes de `verify`
  doivent rester portables (`npm test`, `node script.js`).
- `docs.js` appelle `trash` ; absent sous Windows. **À vérifier** : repli ou erreur claire ?

**macOS / Linux.** Rien de spécifique ; Seatbelt et bwrap sont déjà utilisés par Codex.

**Gemini et Antigravity.** Coding Flow ne câble aucune garde pour eux, et sa règle est nette : *une
plateforme n'obtient une garde que si on l'a vue refuser une écriture pour de vrai*. Un hook `BeforeTool`
existe côté Gemini mais le champ du chemin n'est pas confirmé. Ne rien promettre.

## 6. Ce qui nous est utile dans Coding Flow, classé

| # | Élément | Valeur | Coût | Reco |
|---|---|---|---|---|
| 1 | Plugin de garde OpenCode (traduction d'outils, processus, repli, double export) | comble le trou n°1 | moyen : ~150 lignes + tests, réécrit sur `decide` | **faire** |
| 2 | `apply_patch` : un Write par fichier + `Move to` | sans lui la garde ne voit pas les modèles GPT | faible, vient avec le 1 | **faire** |
| 3 | Marqueur de première ligne + états `current/stale/foreign/absent` dans `check`/`update` | réutilise le schéma de `NORM_HOOK_MARKER` | faible | **faire** |
| 4 | `opencode.json` `instructions` | `AGENTS.md` est lu nativement, donc peu utile ; utile si on ajoute `RULES.md` | faible | différer |
| 5 | Sonde de version OpenCode + `doctor` | détecte un plugin 1.x vs 2.x | faible | **faire** avec le 1 |
| 6 | Journal « NOT checked » visible | rend le fail-open honnête | faible | **faire** |
| 7 | `docs/agent-contract.md` : « supprime toutes les skills, la contrainte tient-elle ? » | critère de conception réutilisable pour nos commandes | nul | adopter |
| 8 | Règle « pas de garde non vue refuser » | déjà la nôtre (Gemini/Antigravity) | nul | conserver |
| 9 | Format skills `SKILL.md` au lieu de `command/*.md` | un seul format pour Claude, OpenCode, Antigravity | moyen : migrer 7 commandes | à arbitrer |
| 10 | `evals/cases/<skill>.json` obligatoire par skill | nos commandes n'ont aucune éval | moyen | à étudier |
| 11 | `plugin sync` : `skills/` généré depuis un gabarit | évite la dérive entre plateformes | moyen | si 9 est retenu |
| 12 | Preuve indexée sur tout le dépôt | **à ne pas copier** (voir DOGFOODING) | — | éviter |

## 7. Proposition de découpage (pour `/flow-plan`)

Une epic « portabilité », trois stories verticales, chacune prouvée par exécution :

1. **Garde OpenCode** : `bin/lib/platforms/opencode-guard.js` génère `.opencode/plugins/ai-learn-guard.js`,
   `decide` en processus, repli `spawnSync`, tests qui chargent le plugin généré et lui passent des appels
   `write`/`edit`/`bash`/`apply_patch`. Preuve réelle : un refus observé dans `opencode 1.19.3` (il est
   installé ici). `init`/`update`/`check` l'écrivent et le contrôlent. README : passer la cellule OpenCode de
   « non câblé » à « mécanique (plugin) » **seulement après** la preuve réelle.
2. **Hook norm côté OpenCode** : commence par un spike (section 4). Sortie possible : « impossible, documenté ».
3. **Windows natif** : test du chemin avec espace, repli de `trash`, section « ce que la garde ne voit pas »
   du README pour PowerShell/`cmd`. Une preuve sur `windows-latest` qui fait refuser une écriture avant de
   l'écrire dans le README.

Le point 9 (migration vers `SKILL.md`) est une décision à part : elle touche `install` pour les 5 plateformes.

## 8. Risques et limites de cette étude

- Je n'ai pas exécuté le plugin de Coding Flow ; je m'appuie sur son code et ses tests, pas sur une session.
- OpenCode évolue vite (1.x et 2.x coexistent ; la 2.x démarre des services). Tout est à revérifier avant le
  démarrage.
- Les chemins du hook stale dans `.claude/settings.json` de ce dépôt pointent sur le cache du plugin
  coding-flow **0.10.0**, alors que 0.14.0 est installé : sans lien avec cette étude, mais à rafraîchir.
