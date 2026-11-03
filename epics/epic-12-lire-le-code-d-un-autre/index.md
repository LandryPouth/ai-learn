# Epic 12 — Lire le code d'un autre

## Goal

Entraîner et mesurer la lecture de code qu'on n'a pas écrit : prédire où vit un mécanisme dans une base inconnue puis le trouver, citer ses trouvailles dans une « carte du code » dont chaque `fichier:ligne` est vérifié, et relire un diff piégé dont seul l'outil connaît les défauts.

## Business Value

Avec l'IA, on écrit moins et on relit plus : un diff plausible, du code d'une bibliothèque, l'implémentation d'un framework. Aujourd'hui l'outil ne mesure la lecture que par la présence d'un fichier (`docs/carte-du-code*.md` exigé en artefact dans 4 projets du parcours) ; le seul exercice de jugement (`docs/reviews/`, mode dirigeant) est verrouillé derrière les paliers de tests et ne compte pas ce que la revue a manqué.

Origine : 2 entrées du `.ai-learn/dogfood.md` de ce dépôt (2026-11-03) : pas de type de prédiction « lecture », aucun entraînement à relire du code produit par l'IA.

## Scope

Inclus :

- [x] Type de prédiction `lecture` : prédire un emplacement dans une source déclarée, révéler l'emplacement trouvé, score mécanique.
- [x] `check` vérifie chaque `fichier:ligne` cité dans `docs/carte-du-code*.md` contre la racine déclarée dans la carte.
- [ ] `ai-learn review` : kata de revue sur le code de l'apprenant, défauts injectés (banque `faults`) mêlés à des changements neutres (`NEUTRAL_TRANSFORMS`), secret hors projet, score trouvés / faux positifs, ledger `tracks/review.json`.
- [ ] Le même kata sur du code d'autrui (`--from <chemin>`).

Exclus :

- [ ] Un agent générateur séparé ou un appel à un modèle : la génération reste mécanique (voir décisions).
- [ ] Une cinquième commande visible : `review` est de la machinerie, déclenchée par `/learn-next` (décision de l'epic 10 : quatre commandes).
- [ ] Partie B de `pistes-non-mesurees.md` (PR open-source revue par un humain) : piste distincte, toujours conditionnée au tier « revue » du mode dirigeant.

## Décisions de l'epic

- **Promotion décidée par l'utilisateur (2026-11-03)**, même compensation que l'epic 11.
- **Kata généré mécaniquement, pas par une IA.** Le problème posé par le dogfood : l'IA qui écrit le kata connaît les défauts et peut les souffler. Les trois options : (a) un agent séparé, non testable, dépendant d'une plateforme et d'un réseau ; (b) une banque de katas versionnée dans le paquet, lisible par l'IA dans `node_modules` ; (c) l'outil injecte lui-même des défauts tirés de `faults` parmi des changements neutres, et garde la liste hors projet. Retenu : (c), zéro dépendance, déterministe sous générateur fixé, même modèle de secret que `break`. Limite assumée : les défauts sont ceux de la banque, pas l'erreur subtile d'une vraie IA.
- **Le kata est fermé à l'IA tutrice** : le guard refuse `Read`/`Grep`/`Glob` sur le kata actif (mur sous Claude Code, consigne ailleurs), comme pour `~/.ai-learn/incidents/`.

## Backbone

Backbone: prédire où vit un mécanisme → le trouver → le citer dans la carte du code → relire un diff piégé → le relire sur du code d'autrui

```text
s1 ── s2
s3 ── s4
```

| Story | Bâtit sur | Pourquoi |
|---|---|---|
| `s1` | — | Racine : type `lecture`, résolution d'une racine de source déclarée (absolue, relative, `~`). |
| `s2` | `s1` | Réutilise la résolution de racine et la vérification `fichier:ligne` de `s1`. |
| `s3` | epic 11 : `11.02` et `11.04` | Tire ses défauts de `faults` (11.02) et ses leurres de `NEUTRAL_TRANSFORMS` (11.04). Ne dépend pas de `s1`. |
| `s4` | `s3` | Même moteur, source extérieure au projet. |

`s1→s2` et `s3→s4` touchent des fichiers disjoints (`predictions.js`/`check.js`/`citation.js` contre un nouveau `review.js`/`tracks/review.js`/`guard.js`) : les deux branches peuvent tourner en parallèle. Partagés : README, `templates/AGENTS-apprentissage.md`, `docs/project-context.md`, fusion manuelle assumée.

## Stories

1. **story-12-01-prediction-de-lecture** — walking skeleton : prédiction → révélation validée contre la source → score → `predictionsRequired`.
2. **story-12-02-carte-du-code-verifiee**
3. **story-12-03-kata-de-revue**
4. **story-12-04-kata-sur-code-d-autrui**

## Context Strategy

- Mode : `s1`, `s2`, `s4` `STANDARD` ; `s3` `STRICT` (extension du guard, secret hors projet).
- Scout pre-step : aucun.
- Modèles à calquer : `citation.js#findRealFileLine` (citation réelle), `reviews.js` (présence + substance), `tracks/debug.js` (ledger), `incident.js` (secret hors projet, état public).
- À ne pas toucher sans décision : la grammaire shell de `guard.js` (on ajoute un chemin protégé).

## Après livraison (hors dépôt)

`ai-learn update --root` dans `tech-experiments`, puis ajouter `predictionsRequired: {lecture: n}` aux phases qui exigent une carte du code (wire-ts 5, framework-ts 9, prodready-api 14, telemetry-go 4) et des phases taguées `kata` là où le plan prévoit une relecture.

## Clarification Readiness

ready — hypothèses étiquetées dans les `plan.md` : génération mécanique du kata ; tolérance `exact` de 10 lignes pour la lecture ; racine de source déclarée dans la carte elle-même.
