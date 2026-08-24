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

## Install / usage

```bash
git clone https://github.com/LandryPouth/ai-learn.git
cd ai-learn
bash scripts/install-claude.sh   # rend `ai-learn` dispo partout + commandes Claude Code
```

**L'apprenant ne tape jamais de commande dans un terminal.** Il passe par Claude Code : les commandes `/…` lui suffisent. L'install se fait une fois, par l'outil. Recharge Claude Code après.

### Les commandes de l'apprenant

| Commande | Rôle |
|---|---|
| `/learn` | Crée un parcours d'apprentissage : doc solide + questions + plan + `progress.json` |
| `/status` | Où j'en suis : phases et leur état |
| `/next` | La prochaine phase à faire |
| `/scan` | Analyse un projet déjà avancé, montre où tu en es, propose une suite d'approfondissement |
| `/propose` | Je ne sais pas quoi faire : propose-moi des projets à construire (chaque étape sourcée) |
| `/check` | Scanner : tout est-il cohérent et prouvé ? |

Il n'y a pas de `/verify` : la preuve est **automatique**. En clôture de chaque phase, l'agent lance `ai-learn verify <id>` lui-même — il n'écrit jamais `done` à la main. Et `ai-learn check` refuse tout checkpoint écrit mais jamais prouvé : `verify` ne peut être skippé, même par omission.

Tout le reste est automatique : guard PreToolUse (bloque les écritures non prouvées), `.githooks/pre-push` (lance les tests avant chaque push).

### Autres agents IA

`ai-learn` est un CLI Node zéro dépendance : `ai-learn init/status/next/verify/check/...` tourne dans n'importe quel terminal (Linux, macOS, **Windows/PowerShell testé**), et `AGENTS.md` (écrit par `init`) est déjà lu nativement par Codex, Gemini CLI, OpenCode et Antigravity — le protocole pédagogique fonctionne sans rien installer de plus.

Pour les commandes `/…` dédiées :

```bash
ai-learn install            # liste les plateformes supportées + statut du garde-fou
ai-learn install claude     # ai-learn sur PATH + commandes /… (~/.claude/commands/)
ai-learn install codex      # commandes en prompts Codex (~/.codex/prompts/)
ai-learn install gemini     # commandes en /ai-learn:<nom> (~/.gemini/commands/ai-learn/)
ai-learn install opencode    # commandes en /ai-learn/<nom> (~/.config/opencode/command/ai-learn/)
ai-learn install antigravity # skills en ai-learn-<nom>/SKILL.md (~/.gemini/antigravity/skills/)
```

| Plateforme | Commandes `/…` | Garde-fou `src/**` | Garde-fou git/gh |
|---|---|---|---|
| Claude Code | ✓ | **mécanique** — hook `PreToolUse`, l'écriture n'a jamais lieu | **mécanique** — même hook `PreToolUse` : toute commande `git`/`gh` de l'IA est refusée, lecture incluse |
| Codex CLI | ✓ (format vérifié contre la doc embarquée du paquet) | **mécanique** — profil de permissions bac à sable OS (`.codex/config.toml`, câblé par `init`/`update`) ; vérifié avec `codex sandbox` (bloque écriture shell **et** Python dans `src/**`, sans toucher au reste du workspace), **pas encore vérifié en session interactive réelle** (pas d'abonnement Codex) ; nécessite que le projet soit « trusted » côté Codex (approbation ponctuelle, comportement normal de leur modèle de sécurité) | **non traité** — le sandbox Codex bloque par *chemin de fichier*, pas par intention/binaire exécuté ; un blocage exec `git`/`gh` au niveau sandbox casserait aussi les checkpoints internes d'`ai-learn` qui appellent `git`/`gh` légitimement (ex. les checkpoints des tiers 3-5 du module git/gh). Limite ouverte, documentée ici plutôt que silencieuse |
| Gemini CLI | ✓ (syntaxe TOML validée avec un parseur strict ; **découverte réelle par `gemini` non vérifiée**, pas de moyen non-interactif trouvé pour le confirmer sans appel modèle) | non câblé — un hook `BeforeTool` existe (confirmé dans la doc embarquée du paquet installé), mais le nom exact du champ `tool_input` pour un chemin de fichier n'a pas pu être confirmé sans casser un vrai hook silencieusement inopérant ; `AGENTS.md` + trous non-collables seuls protègent `src/**` | non câblé — même limite que le garde-fou `src/**` ; `AGENTS.md` §3bis seul |
| OpenCode | ✓ (**découverte confirmée en conditions réelles** : `opencode debug config` après `ai-learn install opencode` résout les 7 commandes, test automatisé dans `test/integration-opencode.test.js`, auto-skip si `opencode` absent) | non câblé — nécessiterait un plugin TS event-driven, pas encore écrit ; `AGENTS.md` + trous non-collables seuls | non câblé — même limite ; `AGENTS.md` §3bis seul |
| Antigravity | ✓ (**structure confirmée sur disque** — `~/.gemini/antigravity/skills/<nom>/SKILL.md`, identique aux skills Gemini CLI, retrouvée réellement installée sur une machine de dev ; le YAML est validé avec un parseur strict, un vrai bug de description non-quotée — un `:` mi-phrase cassait le frontmatter — a été trouvé et corrigé ainsi ; découverte effective par Antigravity non vérifiée faute de session live) | non câblé — un système `hooks.json` plus riche existe côté doc publique mais n'a pas pu être confirmé sur l'install réelle disponible ; `AGENTS.md` + trous non-collables seuls | non câblé — même limite ; `AGENTS.md` §3bis seul |

Symlinks (`install claude`) : sous Windows sans Developer Mode activé, la création de lien symbolique est refusée par l'OS (`EPERM`) — `ai-learn` bascule alors automatiquement sur une copie de fichier, testé en conditions réelles (PowerShell + Node natif Windows).

## La philosophie

- **La preuve est exécutée, pas déclarée.** `verify` lance le checkpoint lui-même. « L'agent a dit que les tests passaient » ne vaut rien.
- **Le suivi est des données, pas de la prose.** `progress.json` est commité et inspectable ; `check` le lit et le compare aux fichiers.
- **Le check est la ceinture de sécurité.** C'est lui qui rend visible un AGENTS.md qu'on « oublie » : une phase `done` sans évidence, un artefact manquant, un journal de prédictions vide → erreur ou warning, exit 1.
- **Ce qu'il ne peut pas garantir : la cognition.** Le tool prouve les preuves visibles (tests, artefacts, journal) ; l'honnêteté de la prédiction reste humaine. Même contrat que Coding Flow : il prouve que les tests tournent, pas que l'agent a raisonné.
- **L'apprenant tape le code — la frappe est protégée, pas le sens.** `ai-learn guard` bloque mécaniquement l'IA dans `src/**` : pour Write/Edit/MultiEdit/NotebookEdit c'est un mur (l'écriture n'a jamais lieu) ; pour Bash c'est une haie, pas un sandbox — elle reconnaît les façons courantes d'écrire (redirection, `tee`, `cp/mv/ln/install`, `sed -i`/`perl -i`, one-liners `python -c`/`node -e`) et fail-open sur le reste. La référence de révélation (`docs/solutions/`) est écrite **non-collable** (des trous à compléter) : un Cmd+A aveugle produit un code qui échoue au checkpoint. Le checkpoint teste le code réellement tapé ; le débogage est mené par l'apprenant. L'échappatoire reste visible : un journal `Corrigé par : IA` est signalé par `check`. Limite assumée : la frappe est garantie, pas l'attention — recopier en réfléchissant reste possible, c'est la même frontière que la cognition.
- **L'apprenant tape aussi git et `gh` — même mur, étendu.** `ai-learn guard` refuse à l'IA toute commande `git`/`gh` via Bash, lecture incluse (pas seulement les écritures, contrairement à `src/**`) : quand l'IA a besoin d'un état git, elle le demande à l'apprenant. La maîtrise se suit dans un ledger **global, cross-projet** (`~/.ai-learn/tracks/git.json`) — jamais remise à zéro par un nouveau projet — par tiers ancrés sur l'usage réel (commit/diff/branches/conflit réel/rebase interactif/workflow PR complet via `gh`/lecture de diffs d'autrui), avec un hook `commit-msg` mécanique (Conventional Commits) plutôt qu'une convention sur parole.
- **Le clean code est un mur mécanique, pas un conseil.** `ai-learn norm` (inspiré de la Norminette 42, sans en reprendre l'infra hébergée — heuristique, zéro dépendance, local) mesure longueur de fichier/fonction, imbrication et nombre de paramètres sur `src/**`, avec les seuils de la stack détectée ou `.ai-learn/norm.json`. `verify` et `check` bloquent dur sur violation, comme sur un checkpoint qui échoue. Limite assumée : c'est une heuristique par accolades/indentation, pas un vrai parseur — une ambiguïté résout toujours vers « ne pas bloquer » plutôt que vers un faux positif.

## Développement

```bash
npm test                 # suite complète (node --test, stdlib only)
ai-learn check --root .  # croise le ledger contre la réalité
```

- Le projet est **dogfoodé** dans un vrai parcours d'apprentissage (une API web) et développé avec **Coding Flow** (guard PreToolUse + validation `npm test` configurée dans `.coding-flow/config.json`).
- Toute friction rencontrée en l'utilisant est notée dans [`docs/DOGFOODING.md`](docs/DOGFOODING.md) — jamais masquée.

## License

[MIT](LICENSE) © Landry Pouth
