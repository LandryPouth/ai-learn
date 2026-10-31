# ai-learn

**Evidence-based learning tracks.** `ai-learn` turns a learning path into a checked, shareable structure: every phase is proven by an executed checkpoint, tracked in a `progress.json` ledger, and cross-checked against reality — not by the word of an AI that could decide to skip the rule.

[![CI](https://github.com/LandryPouth/ai-learn/actions/workflows/ci.yml/badge.svg)](https://github.com/LandryPouth/ai-learn/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Node >= 18](https://img.shields.io/badge/node-%3E%3D18-brightgreen.svg)](package.json)

> Zero dependencies — Node stdlib only, tests run with `node --test`.

The problem it answers is the same one Coding Flow answers for engineering work, applied to learning: *"the agent said the phase was done"* is worth nothing. Only the CLI can say `PROVEN` and mean it — it runs the checkpoint itself.

## What it gives you

| Mécanisme | Rôle |
|---|---|
| `ai-learn init` | Scaffolde un projet d'apprentissage : `progress.json` (le ledger), `docs/plans/`, `checkpoint/`, journal de prédictions |
| `ai-learn verify <phase>` | Exécute le checkpoint de la phase, capture la sortie verbatim, écrit l'évidence, marque `done` **seulement si ça passe vraiment** |
| `ai-learn revisit <phase>` | Revisite espacée : retire de `src/**` ce que la phase avait ajouté (inverse de ses commits `feat(phase-N)`) pour le retaper de mémoire, puis `verify --revisit` prouve ; `--giveup` restaure tout |
| `ai-learn check` | Scan une racine (ex. un monorepo) : croise chaque `progress.json` contre la réalité — phase `done` sans évidence = erreur |
| `ai-learn status` | Vue lisible des phases et de leur état |
| `ai-learn next` | La prochaine phase à faire (et alerte sur les phases `done` sans évidence) |
| `ai-learn scan` | Analyse un projet déjà avancé : montre où tu en es et propose une suite d'approfondissement — jamais de reprise à zéro |
| `ai-learn propose` | Propose des projets à construire quand tu ne sais pas quoi faire — tout est fait automatiquement, chaque étape sourcée |
| `ai-learn docs` | Embarque les sources de doc (clone, URL, ou source fichier) — la vérité de référence des phases |
| `ai-learn traps` | Extrait la **banque de pièges** (zones de friction) des docs embarquées, citée `fichier:ligne` — jamais inventée |
| `ai-learn update` | Propage le protocole + la banque de pièges + le guard à tous les projets sous `--root` |
| `ai-learn guard` | Hook PreToolUse qui bloque l'IA dans `src/**` **et sur toute commande git/gh** (lecture incluse) — l'apprenant tape tout ça lui-même ; `update`/`init` le câblent automatiquement |
| `ai-learn` (module git/gh) | Ledger cross-projet `~/.ai-learn/tracks/git.json` (jamais remis à zéro), hook `commit-msg` mécanique (Conventional Commits), tiers 1-6 de la banque git/gh — voir `AGENTS.md` §3bis |
| `ai-learn norm` | Vérifie la norme clean-code (longueur fichier/fonction, imbrication, params) — bloque `verify`/`check` sur violation, lecture seule et standalone pour un retour rapide |
| `ai-learn mode <apprenti\|dirigeant>` | Bascule le mode. `dirigeant` **se mérite** : tiers 1-3 du ledger global de tests atteints, sinon refus exit 1 nommant le tier manquant ; ledger absent/corrompu/version inconnue = refus. `apprenti` toujours permis. `check` signale l'écart si `guard.json` est passé en `dirigeant` à la main |
| `ai-learn mutate` | Mutation testing : casse `src/**` d'une façon précise puis relance le checkpoint de la phase — un mutant **survécu** prouve qu'un test ne protège rien ; `verify` bloque sur les phases `mutation: true`, protocole de prédiction en `AGENTS.md` §3quinquies |

## Install / usage

```bash
git clone https://github.com/LandryPouth/ai-learn.git
cd ai-learn
bash scripts/install-claude.sh   # rend `ai-learn` dispo partout + skills Claude Code
```

**L'apprenant ne tape jamais de commande dans un terminal.** Il passe par Claude Code : les commandes `/…` lui suffisent. L'install se fait une fois, par l'outil. Recharge Claude Code après.

### Les commandes de l'apprenant

| Commande | Rôle |
|---|---|
| `/learn` | Crée un parcours d'apprentissage : doc solide + questions + plan + `progress.json` |
| `/learn-status` | Où j'en suis : phases et leur état |
| `/learn-next` | La prochaine phase à faire |

Trois commandes, pas plus. `/learn` route seul : projet existant sans parcours →
analyse (`scan`), pas d'idée de projet → propositions (`propose`), parcours
existant → reprise ; il lance lui-même `check` et `docs`. `/learn-next` lance
`check` en silence. Ces flux vivent dans `learn/references/*.md`, à côté du skill
`learn`.

**Rupture assumée (story 10.01).** Les anciennes commandes `/learn-scan`,
`/learn-propose`, `/learn-check`, `/learn-docs` et les alias `/status`, `/next`,
`/scan`, `/propose`, `/check`, `/docs` n'existent plus : tape `/learn`. À
`ai-learn install` / `update`, un skill retiré est supprimé **seulement** s'il est
byte-identique à une version publiée par `ai-learn` ; modifié, il est conservé et
nommé (« conservé (modifié) »). Les sous-commandes du CLI (`ai-learn scan`, …)
sont inchangées.

Il n'y a pas de `/verify` : la preuve est **automatique**. En clôture de chaque phase, l'agent lance `ai-learn verify <id>` lui-même — il n'écrit jamais `done` à la main. Et `ai-learn check` refuse tout checkpoint écrit mais jamais prouvé : `verify` ne peut être skippé, même par omission.

Tout le reste est automatique : guard PreToolUse (bloque les écritures non prouvées), `.githooks/pre-push` (lance les tests avant chaque push).

### Autres agents IA

`ai-learn` est un CLI Node zéro dépendance : `ai-learn init/status/next/verify/check/...` tourne dans n'importe quel terminal (Linux, macOS, **Windows/PowerShell testé**), et `AGENTS.md` (écrit par `init`) est déjà lu nativement par Codex, Gemini CLI, OpenCode et Antigravity — le protocole pédagogique fonctionne sans rien installer de plus.

Pour les commandes `/…` dédiées :

```bash
ai-learn install            # liste les plateformes supportées + statut du garde-fou
ai-learn install claude     # ai-learn sur PATH + skills (~/.claude/skills/)
ai-learn install codex      # skills (~/.codex/skills/)
ai-learn install gemini     # skills (~/.gemini/skills/)
ai-learn install opencode   # skills (~/.config/opencode/skills/)
ai-learn install antigravity # skills (~/.gemini/antigravity/skills/)
ai-learn install <plateforme> --dry-run  # montre les écritures/retraits sans rien toucher
```

Chaque commande est installée comme un skill `<nom>/SKILL.md` (frontmatter
`name` + `description`, description toujours quotée). Les anciens fichiers de
commande qu'`ai-learn` avait écrits (Claude `commands/`, Codex `prompts/`,
Gemini `commands/ai-learn/`, OpenCode `command/ai-learn/`) sont retirés
**seulement si leur contenu est encore byte-identique** à ce qu'il avait généré.
Un fichier modifié est conservé et nommé dans la sortie ; rien n'est supprimé
en silence.

| Plateforme | Emplacement du skill | Preuve de l'emplacement de lecture |
|---|---|---|
| Claude Code | `~/.claude/skills/<nom>/SKILL.md` | Chargeur de skills Claude Code ; OpenCode auto-charge aussi ce chemin |
| OpenCode | `~/.config/opencode/skills/<nom>/SKILL.md` | `opencode debug skill` après install, test automatisé `test/integration-opencode.test.js` (auto-skip sans binaire) |
| Gemini CLI | `~/.gemini/skills/ai-learn-<nom>/SKILL.md` | Doc embarquée du paquet installé (`bundle/docs/cli/skills.md`, « User Skills: `~/.gemini/skills/` ») ; répertoire réellement peuplé sur cette machine |
| Codex CLI | `~/.codex/skills/ai-learn-<nom>/SKILL.md` | Binaire installé codex-cli 0.138.0 (`$CODEX_HOME/skills`, commande TUI `/skills`) ; répertoire réellement peuplé sur cette machine |
| Antigravity | `~/.gemini/antigravity/skills/ai-learn-<nom>/SKILL.md` | Format `SKILL.md` déjà utilisé par l'adaptateur ; chemin non revérifié sur cette machine (Antigravity absent), découverte live non vérifiée — laissé à son format actuel |

| Plateforme | Commandes `/…` | Garde-fou `src/**` | Garde-fou git/gh |
|---|---|---|---|
| Claude Code | ✓ 3 skills + `learn/references/` | **mécanique** — hook `PreToolUse`, l'écriture n'a jamais lieu | **mécanique** — même hook `PreToolUse` : toute commande `git`/`gh` de l'IA est refusée, lecture incluse |
| Codex CLI | ✓ skills `ai-learn-*` | **mécanique** — profil de permissions bac à sable OS (`.codex/config.toml`, câblé par `init`/`update`) ; vérifié avec `codex sandbox` (bloque écriture shell **et** Python dans `src/**`, sans toucher au reste du workspace), **pas encore vérifié en session interactive réelle** (pas d'abonnement Codex) ; nécessite que le projet soit « trusted » côté Codex (approbation ponctuelle, comportement normal de leur modèle de sécurité) | **non traité** — le sandbox Codex bloque par *chemin de fichier*, pas par intention/binaire exécuté ; un blocage exec `git`/`gh` au niveau sandbox casserait aussi les checkpoints internes d'`ai-learn` qui appellent `git`/`gh` légitimement (ex. les checkpoints des tiers 3-5 du module git/gh). Limite ouverte, documentée ici plutôt que silencieuse |
| Gemini CLI | ✓ skills `ai-learn-*` | non câblé — un hook `BeforeTool` existe (confirmé dans la doc embarquée du paquet installé), mais le nom exact du champ `tool_input` pour un chemin de fichier n'a pas pu être confirmé sans casser un vrai hook silencieusement inopérant ; `AGENTS.md` + trous non-collables seuls protègent `src/**` | non câblé — même limite que le garde-fou `src/**` ; `AGENTS.md` §3bis seul |
| OpenCode | ✓ skills (**découverte confirmée en conditions réelles** : `opencode debug skill` liste `learn`, `learn-next` et `learn-status`, test automatisé dans `test/integration-opencode.test.js`, auto-skip si `opencode` absent) | **mécanique** — plugin `.opencode/plugins/ai-learn-guard.js` (`tool.execute.before`) généré par `init`/`update` : `write`/`edit`/`bash`/`apply_patch` sont traduits vers `decide` (le même que Claude), en processus sous Bun ; un module indisponible laisse passer mais écrit « NOT checked » sur stderr et dans `.ai-learn/guard-unchecked.jsonl`. **Refus observé en session réelle** OpenCode 1.19.3 : un appel `write` sur `src/a.js` rend l'erreur `ai-learn guard` et le fichier n'est pas créé | **mécanique par construction** — le plugin passe `bash` à `decide` : toute commande `git`/`gh` (lecture incluse) et `ai-learn mode` sont refusées comme sous Claude Code |
| Antigravity | ✓ skills `ai-learn-*` (format `SKILL.md` déjà utilisé par l'adaptateur ; YAML validé avec un parseur strict ; découverte effective par Antigravity non vérifiée faute de session live, chemin non revérifié sur cette machine) | non câblé — un système `hooks.json` plus riche existe côté doc publique mais n'a pas pu être confirmé sur l'install réelle disponible ; `AGENTS.md` + trous non-collables seuls | non câblé — même limite ; `AGENTS.md` §3bis seul |

Symlinks (`install claude`) : sous Windows sans Developer Mode activé, la création de lien symbolique est refusée par l'OS (`EPERM`) — `ai-learn` bascule alors automatiquement sur une copie de fichier pour le binaire, testé en conditions réelles (PowerShell + Node natif Windows). Les skills eux-mêmes sont des fichiers ordinaires, donc ils ne dépendent pas des symlinks.

### Windows natif

Trois niveaux de preuve, à ne pas confondre :

- **Testé en CI** (`windows-latest`, Node 18/20/22, `.github/workflows/ci.yml`) : la matrice exécute toute la suite `npm test`, dont les tests de cette plateforme — commande de hook écrite dans un dossier dont le chemin contient un espace puis **exécutée** (elle refuse bien une écriture dans `src/**`), repli de `docs` quand `trash` est absent, littéral du chemin du plugin OpenCode, et caractérisation des écritures PowerShell/`cmd`. Aucun de ces tests n'est skippé par plateforme ; le run Windows de cette branche n'a pas encore été observé, donc la catégorie reste à confirmer au push.
- **Observé en session** : `ai-learn` en PowerShell + Node natif Windows (copie du binaire quand le symlink est refusé en `EPERM`, cf. ci-dessus).
- **Non vérifié** : le hook Claude `node "<chemin>" guard` (chemin quoté, sans syntaxe POSIX) est exécuté par un test sous Linux seulement ; son comportement sous Windows est attendu, pas observé. Un refus réel de la garde dans une **session Claude Code sous Windows**, et le refus du plugin OpenCode sous Windows. Rien de cela n'est revendiqué tant qu'il n'a pas été observé.

**Ce que la garde ne voit pas sous Windows.** La grammaire de `guard.js` est du shell POSIX (`>`, `tee`, `cp`/`mv`, `sed -i`, one-liners `python -c`/`node -e`). Elle ne lit **pas** `Set-Content`, `Out-File`, `copy`, `move` ni `New-Item` : une écriture dans `src/**` par ces commandes est autorisée (un test la fige pour qu'un changement futur soit visible). En revanche, une redirection `cmd` (`type nul > src\index.ts`) est refusée, et `git`/`gh` restent bloqués quel que soit le shell. Seuls `Write`/`Edit` sont des murs fiables sous Windows.

**Commandes de checkpoint.** `verify` exécute un checkpoint avec `shell: true` : sous Windows c'est `cmd.exe`, pas bash. Une commande POSIX (`FOO=1 node …`, `[ -f x ]`, `source …`) échoue ; le message de `verify` renvoie alors vers la forme portable (`npm test`, `node script.js`).

## La philosophie

- **La preuve est exécutée, pas déclarée.** `verify` lance le checkpoint lui-même. « L'agent a dit que les tests passaient » ne vaut rien.
- **Le suivi est des données, pas de la prose.** `progress.json` est commité et inspectable ; `check` le lit et le compare aux fichiers.
- **Le check est la ceinture de sécurité.** C'est lui qui rend visible un AGENTS.md qu'on « oublie » : une phase `done` sans évidence, un artefact manquant, un journal de prédictions vide → erreur ou warning, exit 1.
- **Ce qu'il ne peut pas garantir : la cognition.** Le tool prouve les preuves visibles (tests, artefacts, journal) ; l'honnêteté de la prédiction reste humaine. Même contrat que Coding Flow : il prouve que les tests tournent, pas que l'agent a raisonné.
- **`verify` exige les prédictions, pas seulement le checkpoint.** Une phase dont `predictionsRequired` n'est pas atteint dans `.ai-learn/predictions.json` n'est jamais marquée `done`, même checkpoint vert — même mur que la norme et les artefacts, avec le compte réel et attendu dans le message. Les prédictions portent un `type` (`code`, `casse`, `reality`) et `predictionsRequired` peut être ventilé par type (`{ "code": 2, "reality": 1 }`) : le blocage porte alors sur le type réellement manquant, et une phase ne part plus `done` avec zéro reality check. Un projet qui n'a jamais adopté le journal de données (aucun `predictions.json`) n'est jamais bloqué par ce mécanisme (rétro-compatibilité silencieuse) ; une prédiction enregistrée après sa révélation est signalée, jamais bloquante — l'horodatage est déclaré par l'agent, pas observé. Limite assumée : ce qui est prouvé est **l'ordre d'écriture**, jamais l'honnêteté de la prédiction elle-même.
- **L'apprenant tape le code — la frappe est protégée, pas le sens.** `ai-learn guard` bloque mécaniquement l'IA dans `src/**` (mode `apprenti`, le défaut ; en mode `dirigeant`, `.ai-learn/guard.json` inverse la propriété — l'IA écrit `src/**`, ou `implementationFiles` déclaré dans `guard.json`, et l'apprenant garde `test/**` et `checkpoint/**`). Le mode `dirigeant` **se mérite** : `ai-learn mode dirigeant` refuse tant que les tiers 1-3 du ledger global de tests ne sont pas atteints (un mutant tué, 100 % sur une phase, rouge d'abord observé) et refuse aussi un ledger absent, corrompu ou de version inconnue ; `check` signale en erreur un `guard.json` passé en `dirigeant` à la main sans cette preuve. Le guard refuse aussi à l'IA de lancer `ai-learn mode` (ou de surcharger `HOME=` devant `ai-learn`, ce qui déplacerait le ledger lu) et de réécrire `~/.ai-learn/**` et `.ai-learn/runs/**` : la bascule est un acte de l'apprenant. Le ledger restant éditable à la main, et Bash restant une haie (chemin calculé, autre `$VAR`, `env HOME=…` ou `export HOME=…` hors détecteur), c'est un garde-fou pédagogique, pas un contrôle de sécurité. Le guard bloque aussi dans sa propre configuration (`.ai-learn/guard.json`, `.claude/settings.json`, `.claude/settings.local.json`, `.codex/config.toml`) et dans les réglages des contrôles (`.ai-learn/tutor.json`, `norm.json`, `mutate.json`, `predictions.json` — l'IA enregistre les prédictions via `ai-learn predict`, en deux temps `predict` puis `predict --reveal`, jamais à la main) : pour Write/Edit/MultiEdit/NotebookEdit c'est un mur (l'écriture n'a jamais lieu) ; pour Bash c'est une haie, pas un sandbox — elle reconnaît les façons courantes d'écrire (redirection, `tee`, `cp/mv/ln/install`, `sed -i`/`perl -i`, one-liners `python -c`/`node -e`) et fail-open sur le reste. La référence de révélation (`docs/solutions/`) est écrite **non-collable** (des trous à compléter) : un Cmd+A aveugle produit un code qui échoue au checkpoint. Le checkpoint teste le code réellement tapé ; le débogage est mené par l'apprenant. L'échappatoire reste visible : un journal `Corrigé par : IA` est signalé par `check`. Limite assumée : la frappe est garantie, pas l'attention — recopier en réfléchissant reste possible, c'est la même frontière que la cognition.
- **Le mode `dirigeant` prouve le jugement, pas seulement l'écriture.** L'apprenant n'écrit plus l'implémentation, il la spécifie et la juge : chaque phase `done` doit porter une revue sourcée dans `docs/reviews/<brique>.md` citant un `fichier:ligne` réel du diff (dans `implementationFiles`) et une décision (`accepter`, `rejeter`, `demander un changement`). `check` refuse une revue absente, sans citation résolue ou sans décision ; `status` compte les revues manquantes ou invalides. Contrat presence + minimum substance (le `file:line` doit résoudre), jamais un jugement sur la qualité de la revue.
- **L'apprenant tape aussi git et `gh` — même mur, étendu.** `ai-learn guard` refuse à l'IA toute commande `git`/`gh` via Bash, lecture incluse (pas seulement les écritures, contrairement à `src/**`) : quand l'IA a besoin d'un état git, elle le demande à l'apprenant. La maîtrise se suit dans un ledger **global, cross-projet** (`~/.ai-learn/tracks/git.json`) — jamais remise à zéro par un nouveau projet — par tiers ancrés sur l'usage réel (commit/diff/branches/conflit réel/rebase interactif/workflow PR complet via `gh`/lecture de diffs d'autrui), avec un hook `commit-msg` mécanique (Conventional Commits) plutôt qu'une convention sur parole.
- **Les ledgers cross-projet ne racontent que la vraie progression.** Toute écriture dans `~/.ai-learn/` passe par un point unique qui refuse le home réel du compte quand il tourne sous `node --test` : la suite de tests du mainteneur ne peut plus y inscrire ses projets `/tmp`. Une synchronisation ratée (bac à sable, permissions) n'est plus muette : `verify` l'annonce (la phase reste prouvée) et `check` signale un projet prouvé qu'aucun ledger ne connaît. `ai-learn ledgers --sync` rejoue les preuves d'un projet (idempotent, aussi lancé par `update`) ; `ai-learn ledgers --repair --dry-run` puis `--repair` retire les projets disparus, recalcule chaque tier depuis les preuves restantes (un tier sans preuve redevient non atteint) et sauvegarde chaque fichier modifié en `.bak-<horodatage>`.
- **Le clean code est un mur mécanique, pas un conseil.** `ai-learn norm` (inspiré de la Norminette 42, sans en reprendre l'infra hébergée — heuristique, zéro dépendance, local) mesure longueur de fichier/fonction, imbrication et nombre de paramètres sur le code de l'IA (`implementationFiles` — le scope `learnerFiles` du projet en apprenti ; en dirigeant `implementationFiles` s'il est déclaré, sinon `src/**`), avec les seuils de la stack détectée ou `.ai-learn/norm.json`. `verify` et `check` bloquent dur sur violation, comme sur un checkpoint qui échoue. Limite assumée : c'est une heuristique par accolades/indentation, pas un vrai parseur — une ambiguïté résout toujours vers « ne pas bloquer » plutôt que vers un faux positif.

## Développement

```bash
npm test                 # suite complète (node --test, stdlib only)
ai-learn check --root .  # croise le ledger contre la réalité
```

- Le projet est **dogfoodé** dans un vrai parcours d'apprentissage (une API web) et développé avec **Coding Flow** (guard PreToolUse + validation `npm test` configurée dans `.coding-flow/config.json`).
- Toute friction rencontrée en l'utilisant est notée dans [`docs/DOGFOODING.md`](docs/DOGFOODING.md) — jamais masquée.

## License

[MIT](LICENSE) © Landry Pouth
