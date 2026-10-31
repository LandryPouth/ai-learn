# Project Context — ai-learn

> État courant durable du projet. Pas un journal de décisions : les décisions
> d'une story vivent dans son `plan.md`, l'historique d'exécution dans son
> `## Result`.

## Ce qu'est le projet

CLI Node **zéro dépendance** (stdlib uniquement, `node --test`) qui transforme un
parcours d'apprentissage en structure **prouvée** : chaque phase est prouvée par un
checkpoint exécuté, suivie dans un ledger `progress.json`, et recoupée contre la
réalité par un scanner.

Thèse : *« l'agent a dit que la phase était faite » ne vaut rien.* Seul le CLI peut
dire `PROVEN`, parce qu'il exécute le checkpoint lui-même.

- Paquet : `@landry_pouth/ai-learn` v0.4.0, `bin: ai-learn`
- Node >= 18, CI GitHub Actions sur Node 18/20/22 (**Linux uniquement**)
- Licence MIT · dépôt `LandryPouth/ai-learn`

## Utilisateurs

1. **L'apprenant** — ne tape jamais de commande. Il passe par les 4 commandes
   `/learn-*` de son agent (`/learn`, `/learn-status`, `/learn-next`, `/learn-break`) ; scan, propose,
   check et docs tournent en machinerie, appelés par `/learn` (flux dans
   `learn/references/`). Les anciens noms et alias sont retirés (story 10.01).
   En mode `apprenti` (défaut), il tape **tout le code** de `src/**` ; en mode
   `dirigeant`, il garde la **spécification** (`test/**`, `tests/**`,
   `__tests__/**`, `checkpoint/**`, conventions test/spec) et l'IA écrit
   l'implémentation. Dans les deux cas, il tape **toutes** les commandes git/gh.
2. **L'agent IA** — exécute les commandes `ai-learn`, applique le protocole
   pédagogique (`AGENTS.md` posé par `init`), et est **mécaniquement bloqué**
   sur les fichiers de l'apprenant (`src/**` en apprenti, la spécification en
   dirigeant), sur sa propre policy et sur git/gh.
3. **Le mainteneur** — dogfoode l'outil sur un vrai parcours (une API Fastify) et
   consigne toute friction dans `docs/DOGFOODING.md`.

## Mécanismes en place

| Mécanisme | Fichier | Nature |
|---|---|---|
| Ledger de phases | `progress.json` (v1) | données commitées |
| Preuve exécutée | `ai-learn verify` → `.ai-learn/runs/*-verify.json` | exécution réelle |
| Scanner de dérive | `ai-learn check` | erreurs bloquantes / warnings |
| Blocage IA sur les fichiers de l'apprenant + policy + git/gh | `ai-learn guard` (hook PreToolUse) | mur (Write/Edit), haie (Bash) |
| Norme clean-code | `ai-learn norm` | heuristique, blocage dur |
| Banque de pièges | `ai-learn traps` → `.ai-learn/traps.json` | extraite des docs, citée `fichier:ligne` |
| Ledger git/gh cross-projet | `~/.ai-learn/tracks/git.json` | 6 tiers, jamais remis à zéro |
| Ledger plateforme cross-projet | `~/.ai-learn/tracks/platform.json` | 7 paliers, `achieved` par `verify` d'une phase taguée `platformTier` seulement ; ligne « plateforme : n/7 » dans `status` ; classement de `propose` |
| Ledger de tests cross-projet | `~/.ai-learn/tracks/tests.json` | 6 tiers observés depuis les évidences `verify` |
| Mode dirigeant mérité | `ai-learn mode` + `ai-learn check` | tiers 1-3 requis, ledger illisible = refus, écart signalé en erreur |
| Incident de code | `ai-learn break` (`--resolve`, `--giveup`) → secret `~/.ai-learn/incidents/`, état `.ai-learn/incident.json` | moteur de `mutate` inversé ; secret fermé à `Read`/`Grep`/`Glob` (mur sous Claude Code, haie ailleurs) |
| Ledger de débogage cross-projet | `~/.ai-learn/tracks/debug.json` | 3 tiers : incident résolu, niveau 2, site prédit exact |
| Ledger de domaine cross-projet | `~/.ai-learn/domains/<stack>.json` | couverture de concepts |
| Ledgers propres | `ai-learn ledgers --repair [--dry-run]` / `--sync` (machinerie, `update` synchronise) | écriture unique `tracks/store.js` ; refus du home réel sous `node --test` ; échec de synchro averti par `verify`, projet absent averti par `check` |
| Profil apprenant | `ai-learn profile [--json]` / `profile set --json '<objet>'` (machinerie, appelée par `/learn`) | `~/.ai-learn/profile.json` v1, écrit par le CLI seul ; absent = aucun blocage, invalide = erreur `check` ; ligne « profil » dans `status` ; lu par `/learn` et `/learn-next` |
| Journal de friction | `.ai-learn/dogfood.md` (par projet) + `docs/DOGFOODING.md` (agrégé) | prose |

## Cinq plateformes supportées

Claude Code (garde-fou mécanique complet), Codex (bac à sable OS sur les chemins
littéraux des fichiers de l'apprenant ; `src/**` en apprenti, la spécification
en dirigeant ; git/gh non traité), OpenCode (plugin
`.opencode/plugins/ai-learn-guard.js` câblé par `init`/`update`, même `decide`
que Claude : fichiers de l'apprenant et git/gh via Bash), Gemini CLI /
Antigravity (commandes `/…` seulement, `AGENTS.md` comme seule protection). Les
limites sont documentées honnêtement dans le README — ne jamais les masquer.

## Ce qui est mesuré et ce qui ne l'est pas

**Prouvé mécaniquement** : le checkpoint passe, l'artefact existe, la norme est
respectée, l'IA n'a pas écrit dans les fichiers de l'apprenant (`src/**` en
apprenti, la spécification en dirigeant), le format de commit est conforme.

**Non prouvé, assumé** : la cognition. L'honnêteté d'une prédiction reste humaine.
Le README l'écrit noir sur blanc — c'est ce qui rend le reste crédible.

## État connu au 2026-09-01 (audit)

Trois bugs reproduits et cinq trous structurels identifiés — voir
`docs/roadmap.md` et `epics/epic-01-verdict-fiable/`.

Le plus grave : **`ai-learn check` est rouge pendant tout le temps de travail d'une
phase** (une phase `in_progress` dont le fichier de checkpoint existe déclenche une
erreur bloquante). C'est exactement le scénario que `docs/DOGFOODING.md` désigne
comme le pire défaut possible — *« un check qui se déclenche sur un cas qu'on ne
peut pas résoudre légitimement, c'est un check qu'on apprend à désactiver »*.
