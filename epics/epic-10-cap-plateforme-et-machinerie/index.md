# Epic 10 — Cap plateforme, tout en machinerie

## Goal

Garder `ai-learn` généraliste tout en le tournant vers les compétences du dev plateforme (Linux, réseau, données, conteneurs, CI/CD, observabilité, diagnostic de pannes), et réduire ce que l'apprenant doit connaître de l'outil à **quatre commandes** : `/learn`, `/learn-next`, `/learn-status`, `/learn-break`. Tout le reste (`scan`, `propose`, `check`, `docs`, profil, ledgers, incidents, bilan) tourne en machinerie, appelé par l'agent.

## Business Value

L'apprenant doit apprendre les commandes de son métier (`git`, `curl`, `docker`, `psql`, `ss`, `dig`), pas celles de l'outil. Aujourd'hui il en voit sept, plus six alias. Côté contenu, rien ne mesure la compétence plateforme d'un projet à l'autre, ni la capacité à diagnostiquer une panne — la compétence la moins délégable du métier (`docs/plans/pistes-non-mesurees.md`, Partie A).

Origine : demande explicite de l'utilisateur (2026-10-30), à partir de deux notes personnelles (contexte de parcours + méta-prompt pédagogique). Ce qui en était déjà couvert par l'outil n'est pas refait ; rien de personnel n'entre dans le dépôt (le profil vit dans `~/.ai-learn/`).

## Scope

Inclus :

- [ ] Quatre commandes visibles ; `scan`/`propose`/`check`/`docs` deviennent des références internes du skill `/learn` ; anciens skills et alias retirés sans détruire un fichier modifié.
- [ ] Profil apprenant global `~/.ai-learn/profile.json`, créé par `/learn` au premier lancement, lu par `/learn` et `/learn-next`.
- [ ] Ledger cross-projet `~/.ai-learn/tracks/platform.json` (paliers), phase taguée `platformTier`, banque `propose` enrichie de projets plateforme.
- [ ] Incidents : `ai-learn break` casse le code sans dire où ; l'apprenant prédit le site, répare, `verify` prouve ; ledger `~/.ai-learn/tracks/debug.json`.
- [ ] Incidents déclenchés automatiquement par `/learn-next`, et pannes d'environnement (niveau 3).
- [ ] Analyse de pertinence automatique dans `/learn`, une seule validation.
- [ ] Bilan de fin de projet `docs/bilan.md`, préparé automatiquement, vérifié par `check`.

Exclus :

- [ ] Toute donnée personnelle dans le dépôt (projets, objectifs, technos de l'utilisateur).
- [ ] Une référence de cours imposée (ex. un dépôt GitHub « central ») : les sources passent par `ai-learn docs add` comme les autres.
- [ ] Les couches pédagogiques (mécanisme → expérience minimale → tests → échecs → framework → comparaison) en règle obligatoire : guide de séquençage dans `/learn` uniquement.
- [ ] Les tiers 4-6 de la Partie A (non déterministe, lent, observable par logs) : différés tant que le journal de friction ne les a pas montrés.
- [ ] Cacher une panne de code à `git diff` : limite assumée, écrite au README.

## Dépendance

**Exécuter l'epic 09 d'abord** (`epics/epic-09-preuve-fiable-et-dogfood-clos/`). Les incidents (`s4`, `s5`) s'appuient sur `verify`, le garde-fou et les ledgers que l'epic 09 rend fiables, et `s4` réutilise le moteur sauvegarde/verrou/abandon de la story 09.06 au lieu d'en écrire un second.

## Backbone

Backbone: `/learn` (profil → pertinence → parcours avec paliers plateforme) → `/learn-next` (phase prouvée → incident → diagnostic → réparation prouvée) → `/learn-status` → bilan de fin de projet

```text
s1
├── s2 ── s3 ──┬── s6
│              │
├── s4 ── s5 ──┘
└── s7
```

`s1` est le squelette : il traverse la source des commandes (`commands/`), le rendu des skills, l'installation et le retrait sur les 5 plateformes, `AGENTS.md` et le README — toute la surface que les stories suivantes enrichissent sans la redessiner. `s2`→`s3` : le choix des paliers lit le profil. `s4`→`s5` : `s5` réutilise le moteur d'incident. `s5` lit le ledger plateforme pour choisir le niveau (arête vers `s3`). `s6` lit profil + ledgers. Les branches partagent `commands/learn.md`, `bin/lib/check.js`, `bin/lib/status.js` et le README : **exécuter en séquence** (ordre numérique) sauf fusion manuelle assumée.

## Stories

1. **story-10-01-quatre-commandes**
2. **story-10-02-profil-apprenant**
3. **story-10-03-progression-plateforme**
4. **story-10-04-incident-de-code**
5. **story-10-05-incident-auto-et-environnement**
6. **story-10-06-analyse-de-pertinence**
7. **story-10-07-bilan-de-fin-de-projet**

## Context Strategy

- Mode par défaut : `STANDARD` ; `s1`, `s4`, `s5` sont `STRICT` (suppression dans le home de l'utilisateur ; écriture dans `src/**` de l'apprenant ; arrêt de services et processus).
- Scout pre-step : aucun — fichiers et ancres nommés dans chaque story.
- Modèles à calquer, pas à réécrire : `tracks/git.js` / `tracks/tests.js` (ledgers), `tutor.js` (config à trois états), `mutate.js` (backup, verrou, restauration), `install.js#migrateLegacyCommands` (retrait par empreinte), `check.js#citesRealPRUrl` (présence + substance).
- Zones à ne pas toucher sans décision : `scan.js` (moteur de détection), la grammaire shell de `guard.js` (s4 y ajoute un chemin protégé, pas une grammaire).

## Décisions de l'epic

- **Promotion de la Partie A hors règle de promotion.** `pistes-non-mesurees.md` exige trois entrées de friction avant de construire le module debug ; il y en a zéro. L'utilisateur, propriétaire du produit, le décide explicitement (2026-10-30). Compensation : seuls les tiers 1-3 sont construits, et `s4`/`s5` ajoutent une ligne `DOGFOODING.md` à chaque tier jamais atteint après trois incidents, pour que la banque soit recalibrée sur l'observé.
- **Pas de seconde source pour les flux internes** : le contenu de `learn-scan.md`, `learn-propose.md`, `learn-check.md`, `learn-docs.md` devient des fichiers de référence installés **dans** le dossier du skill `learn` (`learn/references/*.md`), pas des skills.

## Clarification Readiness

ready — les choix produits (4 commandes, automatisme maximal, profil hors dépôt, ordre des stories) sont tranchés par l'utilisateur. Les inconnues restantes (lecture des fichiers `references/` d'un skill par Codex/Gemini/Antigravity ; services Docker disponibles pour le niveau 3) sont des vérifications explicites de `s1` et `s5`, avec un repli décrit.
