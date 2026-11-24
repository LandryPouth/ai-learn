# Epic 16 — Lire le code d'un autre, guidé (mode compagnon)

## Goal

Prendre en main vite un projet qu'on n'a pas écrit. Dans un terminal à côté, l'apprenant ouvre une session dans le dépôt étranger et lance `/learn` : l'agent propose un **parcours guidé** (6 à 10 arrêts : ce que fait le projet, point d'entrée, démarrage, une requête suivie de bout en bout, modèle du domaine, persistance, chemin d'erreur, tests) ou des **questions libres** (chaque réponse cite des lignes réelles). À chaque arrêt, l'apprenant prédit où vit le mécanisme, lit, l'agent explique en citant des `fichier:ligne` vérifiés, et **l'apprenant fait grandir le diagramme du système** (calques de l'epic 15). Un test final prouve la prise en main : localiser trois changements, puis en faire un pour de vrai, test vert, dans une copie jetable. Un incident dans cette copie entraîne à déboguer le code d'un autre.

## Business Value

Avec l'IA, on lit plus qu'on n'écrit : un framework, une bibliothèque, le dépôt d'une nouvelle équipe. L'epic 12 a posé les briques (prédiction de lecture, carte du code vérifiée, kata sur code d'autrui) mais rien ne guide une découverte complète d'un dépôt, ni ne mesure qu'on peut y intervenir. Dessiner le système **pendant** la lecture (demande du mainteneur, 2026-11-24) force à découper ce qu'on lit en boîtes et en flux au lieu de survoler.

## Scope

Inclus :

- [ ] Route « lire un dépôt » de `/learn` (flux `references/lecture.md`), état hors du dépôt étranger dans `~/.ai-learn/reading/<alias>/`.
- [ ] `ai-learn tour start|stop|next|status` : arrêts vérifiés (`fichier:ligne` réel sous la racine).
- [ ] Diagramme du système étranger dans le dossier de lecture, dessiné par l'apprenant à chaque arrêt, corrigé par l'IA dans son calque (protocole de l'epic 15).
- [ ] Un flux suivi de bout en bout (arrêts chaînés), rendu dans la carte du code.
- [ ] Questions libres : règle de citation dans `references/lecture.md` (pas de commande).
- [ ] Test de prise en main : 3 localisations puis un changement réel avec test dans un bac à sable (`git clone --local` dans le dossier de lecture), résultat réussi/non dans `tracks/reading.json`.
- [ ] Incident dans le bac à sable : mutation du catalogue d'`incident.js`, diagnostic `debug`, réparation.
- [ ] Mode d'emploi dans le dossier de lecture (`LISEZ-MOI.md`) : parcours, calques, commandes.

Exclus :

- [ ] Toute écriture dans le dépôt étranger, sauf l'option `--guard` (fichiers locaux non versionnés, voir décisions).
- [ ] Une cinquième commande visible (décision de l'epic 10) : tout passe par `/learn`.
- [ ] Exécuter le code étranger hors du bac à sable, ou à l'initiative de l'agent : seule la commande de test déclarée par l'apprenant tourne, et seulement dans le bac à sable.

## Décisions de l'epic

- **État hors du dépôt** : `~/.ai-learn/reading/<alias>/` contient `tour.json`, `.ai-learn/predictions.json` (même format, mêmes fonctions de `predictions.js` avec ce dossier comme `dir`), `systeme.drawio`, `diagramme.md`, `carte-du-code.md` (avec `Racine :` = le dépôt), `LISEZ-MOI.md`. Exporté vers la mémoire (epic 13) quand elle est livrée.
- **Le mur n'existe pas par défaut dans un dépôt étranger** : le guard est câblé par projet. `tour start --guard` (opt-in) écrit le hook dans `.claude/settings.local.json` du dépôt et l'ajoute à `.git/info/exclude` (jamais au `.gitignore`), retiré par `tour stop`. Sans `--guard`, l'ordre « l'apprenant dessine d'abord » est une consigne ; l'intégrité des calques reste vérifiée par `diagram reveal`.
- **Réutiliser, ne pas refaire** : `citation.js` (vérification sous racine), prédiction `lecture` (12.01), `codemap.js` (12.02), `drawio.js`/`diagram.js` (epic 15).

## Backbone

Backbone: ouvrir un dépôt étranger → parcourir ses arrêts → dessiner le système en lisant → suivre une requête de bout en bout → prouver qu'on peut y intervenir → le déboguer quand il casse

```text
s1 ──┬── s2 ──┐
     └── s3 ──┴── s4 ── s5
```

| Story | Bâtit sur | Pourquoi |
|---|---|---|
| `s1` | — | Racine : route, dossier de lecture, arrêts vérifiés, mode d'emploi. |
| `s2` | `s1`, epic 15 (`15.01`, `15.02`) | Le diagramme du dossier de lecture suit le protocole de calques. |
| `s3` | `s1` | Chaîne des arrêts en flux et carte du code. |
| `s4` | `s2`, `s3` | L'examen exige les arrêts, un flux et le diagramme ; il crée le bac à sable. |
| `s5` | `s4` | L'incident se joue dans le bac à sable et sa commande de test. |

`s2` (`diagram.js` réutilisé, `tour-diagram`) et `s3` (`codemap.js`) touchent des fichiers disjoints ; partagés : `tour.js`, `LISEZ-MOI.md`, `references/lecture.md`, fusion manuelle assumée.

## Stories

1. **[story-16-01-parcours-de-bout-en-bout](story-16-01-parcours-de-bout-en-bout/spec.md)** — walking skeleton.
2. **[story-16-02-diagramme-pendant-le-parcours](story-16-02-diagramme-pendant-le-parcours/spec.md)**
3. **[story-16-03-suivre-un-flux](story-16-03-suivre-un-flux/spec.md)**
4. **[story-16-04-test-de-prise-en-main](story-16-04-test-de-prise-en-main/spec.md)**
5. **[story-16-05-incident-dans-le-code-d-un-autre](story-16-05-incident-dans-le-code-d-un-autre/spec.md)**

## Context Strategy

- Mode : `s1`, `s3`, `s4`, `s5` `STANDARD` ; `s2` `STRICT` (option `--guard` qui écrit dans un dépôt étranger).
- Scout pre-step : `s5` seulement (frontière réutilisable d'`incident.js`).
- Modèles à calquer : `review-source.js#resolveSource` (source étrangère, `~/`), `citation.js#checkFileLineUnderRoot`, `codemap.js`, `tracks/review.js` (forme du ledger), `incident.js` (mutations).
- Documentation obligatoire dans chaque story : `LISEZ-MOI.md` du dossier de lecture (gabarit `templates/lecture-lisez-moi.md`), README, `project-context.md`, `architecture.md`, `commands/references/lecture.md`, `docs/pedagogie.md` si présent.

## Après livraison (hors dépôt)

Premier parcours réel : `node_modules/fastify` depuis `fastify-traducteur-api` (le diagramme `Fastify.drawio` du bureau sert de comparaison), puis le dépôt d'ImobAfrique côté API.

## Clarification Readiness

ready — validé par le mainteneur le 2026-11-24, diagramme pendant le parcours ajouté à sa demande. Hypothèses étiquetées : 6 à 10 arrêts ; localisation réussie à 2 sur 3 (`exact` ou `fichier`) puis changement réel testé ; guard opt-in dans le dépôt étranger. Révision du 2026-11-24 : questions libres réduites à une règle, examen par changement réel, ledger sans paliers, incident ajouté.
