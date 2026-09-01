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

1. **L'apprenant** — ne tape jamais de commande. Il passe par les 7 commandes `/…`
   de son agent (`/learn`, `/status`, `/next`, `/scan`, `/propose`, `/check`, `/docs`).
   Il tape en revanche **tout le code** de `src/**` et **toutes** les commandes git/gh.
2. **L'agent IA** — exécute les commandes `ai-learn`, applique le protocole
   pédagogique (`AGENTS.md` posé par `init`), et est **mécaniquement bloqué** hors
   de `src/**` et de git/gh.
3. **Le mainteneur** — dogfoode l'outil sur un vrai parcours (une API Fastify) et
   consigne toute friction dans `docs/DOGFOODING.md`.

## Mécanismes en place

| Mécanisme | Fichier | Nature |
|---|---|---|
| Ledger de phases | `progress.json` (v1) | données commitées |
| Preuve exécutée | `ai-learn verify` → `.ai-learn/runs/*-verify.json` | exécution réelle |
| Scanner de dérive | `ai-learn check` | erreurs bloquantes / warnings |
| Blocage IA sur `src/**` + git/gh | `ai-learn guard` (hook PreToolUse) | mur (Write/Edit), haie (Bash) |
| Norme clean-code | `ai-learn norm` | heuristique, blocage dur |
| Banque de pièges | `ai-learn traps` → `.ai-learn/traps.json` | extraite des docs, citée `fichier:ligne` |
| Ledger git/gh cross-projet | `~/.ai-learn/tracks/git.json` | 6 tiers, jamais remis à zéro |
| Ledger de domaine cross-projet | `~/.ai-learn/domains/<stack>.json` | couverture de concepts |
| Journal de friction | `.ai-learn/dogfood.md` (par projet) + `docs/DOGFOODING.md` (agrégé) | prose |

## Cinq plateformes supportées

Claude Code (garde-fou mécanique complet), Codex (bac à sable OS sur `src/**`,
git/gh non traité), Gemini CLI / OpenCode / Antigravity (commandes `/…` seulement,
`AGENTS.md` comme seule protection). Les limites sont documentées honnêtement dans
le README — ne jamais les masquer.

## Ce qui est mesuré et ce qui ne l'est pas

**Prouvé mécaniquement** : le checkpoint passe, l'artefact existe, la norme est
respectée, l'IA n'a pas écrit dans `src/**`, le format de commit est conforme.

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
