# Spec — Story 10.03 — Progression plateforme cross-projet

## User Value

Quel que soit le langage du projet, chaque parcours fait progresser l'apprenant d'un ou deux paliers plateforme, et la progression se cumule d'un projet à l'autre sans jamais repartir de zéro. Quand il ne sait pas quoi construire, les propositions visent d'abord ses paliers manquants.

## Requirements

- Ledger `~/.ai-learn/tracks/platform.json` (v1), calqué sur `tracks/git.js` : `tiers["1".."7"] = { achieved, evidence[] }`, `projects{}`, `updatedAt`.
- Paliers :

  | Palier | Thème | Exemples de preuve attendue au checkpoint |
  |---|---|---|
  | 1 | Linux & processus | signaux, codes de sortie, variables d'environnement, descripteurs |
  | 2 | Réseau | HTTP brut, TCP, DNS, TLS observés (`curl -v`, `ss`, `dig`, `openssl s_client`) |
  | 3 | Données | transaction, contrainte, index prouvé par `EXPLAIN` |
  | 4 | Conteneurs | image, réseau, volume, compose reproductible |
  | 5 | CI/CD | pipeline qui lance les tests et bloque un échec |
  | 6 | Observabilité | logs structurés, health check, arrêt propre sur `SIGTERM` |
  | 7 | Fiabilité | timeout, retry, idempotence, file de tâches |

- Champ de phase `platformTier: 1-7` dans `progress.json`. Un palier est `achieved` uniquement par un `verify` réussi d'une phase taguée (même règle que `gitTier`).
- `verify` met le ledger à jour automatiquement ; `status` affiche « plateforme : n/7 » et les paliers manquants ; `check` valide le champ et le ledger.
- `/learn` : lit le ledger (et `focus` du profil s'il existe) et tague **1 à 2 phases maximum** avec un palier manquant ; le checkpoint de ces phases exerce réellement le thème (commande réelle, pas un test qui l'affirme).
- `propose` : chaque projet de la banque porte `platformTiers[]` ; quand le ledger existe, les projets qui couvrent des paliers manquants sont classés en tête. Ajout de 6 projets plateforme, chaque étape adossée à une ressource vérifiable : file de tâches Postgres (retries, idempotence, `SKIP LOCKED`), arrêt propre + health checks, observabilité (logs/métriques/traces), rate limiter, reverse proxy, pipeline CI.

## Acceptance Criteria

- [x] Given une phase `platformTier: 3` et un checkpoint vert, when `ai-learn verify`, then `platform.json` marque le palier 3 `achieved` avec une évidence (projet, phase).
- [x] Given la même phase et un checkpoint rouge, when `verify`, then le ledger n'est pas modifié.
- [x] Given `platformTier: 9`, when `ai-learn check`, then erreur nommant la phase et la plage 1-7.
- [x] Given un ledger avec les paliers 1 et 2 atteints, when `ai-learn status`, then « plateforme : 2/7 » et la liste des paliers manquants.
- [x] Given un ledger où seul le palier 7 manque, when `ai-learn propose --stack javascript`, then le premier projet listé couvre le palier 7.
- [x] Given la banque, when `propose --validate` tourne sur chaque nouveau projet, then aucun n'est refusé (toutes les étapes sourcées).
- [x] Given `commands/learn.md`, when on le lit, then la section paliers impose 1-2 phases max et un checkpoint qui exécute réellement le thème.

## Edge Cases

- Ledger absent → créé au premier `verify` tagué ; ledger corrompu → `verify` ne l'écrase pas, `check` le signale (contrat de `tracks/tests.js`).
- Phase taguée à la fois `gitTier` et `platformTier` : les deux ledgers avancent.

## Out of Scope

- Détecter un palier sans tag (signal ambiant) : enregistré nulle part, pour ne jamais compter un hasard comme une maîtrise.
