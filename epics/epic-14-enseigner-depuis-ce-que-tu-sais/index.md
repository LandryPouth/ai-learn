# Epic 14 — Enseigner à partir de ce que tu sais

## Goal

Reprendre de LearnHarness (`amosblomqvist/learnharness`, AGPL-3.0 : **les idées seulement, ni code ni texte de prompt**) ce qui renforce le protocole d'ai-learn sans toucher à sa thèse de preuve : la confiance déclarée et le raisonnement séparé de la réponse à chaque prédiction, une théorie pédagogique écrite avant les consignes, un sondage de ce que l'apprenant sait avant de planifier, et une pratique alternée entre phases déjà prouvées.

## Business Value

- Une note /10 dit si la prédiction était juste, pas si l'apprenant **savait** qu'elle l'était : une erreur commise avec 90 % de confiance est une idée fausse, une erreur hésitante est un trou. Aujourd'hui les deux se ressemblent.
- `/learn` planifie à partir du profil et du scan du code, jamais à partir d'une mesure de ce que l'apprenant sait : il réenseigne parfois l'acquis (règle « ne jamais réapprendre un concept déjà maîtrisé ailleurs » appliquée sur déclaration).
- `revisit` refait une phase isolée : la récupération se fait dans le contexte où elle a été apprise. Une revisite au format alterné (rappel, discrimination, composition ; gabarits « à l'envers » et « casser une prémisse ») force la notion à revenir hors de ce contexte.
- `templates/AGENTS-apprentissage.md` mêle théorie et règles : sans document canonique, chaque story ajoute une règle qui peut contredire l'esprit des autres.

Origine : analyse de LearnHarness du 2026-11-24 (`docs/teaching-methodology.md`, prompts `prober/`, `teacher/28-predictions.md`, `practice/10-doctrine.md`, `shared/25-confidence.md`).

## Scope

Inclus :

- [ ] `predict --confidence <0-100> --reasoning "<…>"`, calibration dans `status` et `bilan`.
- [ ] `docs/pedagogie.md` : théorie canonique ; AGENTS en est la version condensée.
- [ ] Sondage avant le plan : `.ai-learn/probe.json`, flux `references/sonde.md` de `/learn`, citations vérifiées par `check`.
- [ ] Budget de friction : au plus 3 gestes bloquants par phase, écrit dans `docs/pedagogie.md` et `RULES.md`, averti par `check`.
- [ ] `revisit --format code|dessin|alterne` : une seule revisite en plusieurs formats ; le format `alterne` (2 phases, mode choisi par l'outil, prédiction `alterne`) remplace la commande `practice` d'abord prévue.

Exclus :

- [ ] Application de bureau, graphe de connaissances extrait par modèle, plugins, multi-fournisseurs.
- [ ] La règle « toujours demander, ne jamais deviner » de LearnHarness : contraire à l'exécution en une passe.
- [ ] Une cinquième commande visible : sondage et revisite alternée sont de la machinerie (décision de l'epic 10).

## Décisions de l'epic

- **Budget de friction (2026-11-24)** : une phase impose au plus 3 gestes bloquants (chaque entrée de `predictionsRequired`, `diagram: true`, une revisite exigée…) ; tout le reste est proposé par `next`, jamais exigé. Une story qui ajoute un geste bloquant dit lequel elle remplace ou rend facultatif quand le budget est atteint.
- **Pratique alternée fusionnée dans la revisite** : un seul mécanisme d'espacement (`revisit`), plusieurs formats.

- **Licence** : AGPL-3.0 côté LearnHarness, MIT ici. Aucune ligne de code ni phrase de prompt copiée ; les idées sont reformulées et la source est citée dans `docs/pedagogie.md`.
- **La confiance et le sondage sont des données, pas des preuves** : comme la note /10, ils restent « non prouvés, assumés » (`project-context.md`). Ce qui est mécanique : l'antériorité (la confiance est enregistrée avant la révélation) et la cohérence des citations.
- **Hypothèse : une prédiction est « juste » pour la calibration si sa note est ≥ 7/10.**

## Backbone

Backbone: sonder ce que l'apprenant sait → planifier sans réenseigner l'acquis → prédire avec sa confiance et son raisonnement → revisiter en alterné ce qui est prouvé

```text
s1
├── s3
└── s4
s2
```

| Story | Bâtit sur | Pourquoi |
|---|---|---|
| `s1` | — | Racine : nouveaux champs de prédiction de bout en bout (CLI → `predictions.json` → `.md` → `status`/`bilan` → protocole). |
| `s2` | — | Documentation seule (`docs/`, renvoi dans AGENTS). Parallélisable avec tout. |
| `s3` | `s1` | Une entrée de sondage porte une confiance (même validation que `s1`). |
| `s4` | `s1` (et 15.03 pour le format `dessin`) | Une revisite alternée est une prédiction `alterne` avec confiance ; le format `dessin` vient de 15.03. |

`s3` (nouveau `probe.js`, `commands/learn.md`, `check.js`) et `s4` (`revisit.js`, nouveau `revisit-formats.js`, `next.js`) sont disjoints. Partagés : `templates/AGENTS-apprentissage.md`, README, fusion manuelle assumée.

Lien avec l'epic 13 : la calibration de `s1` alimente la fiche (13.03) et la métrique `calibration` (13.06). Ordre global recommandé dans `docs/roadmap.md`.

## Stories

1. **[story-14-01-confiance-et-raisonnement](story-14-01-confiance-et-raisonnement/spec.md)** — walking skeleton.
2. **[story-14-02-theorie-pedagogique-canonique](story-14-02-theorie-pedagogique-canonique/story.md)**
3. **[story-14-03-sondage-avant-le-plan](story-14-03-sondage-avant-le-plan/spec.md)**
4. **[story-14-04-revisite-en-plusieurs-formats](story-14-04-revisite-en-plusieurs-formats/spec.md)** — fusion de la pratique alternée et de la revisite (2026-11-24).

## Context Strategy

- Mode : `s1`, `s3`, `s4` `STANDARD` ; `s2` `QUICK`.
- Scout pre-step : aucun.
- Modèles à calquer : `predictions.js` (types, reveal en deux temps), `revisit.js` (offre dans `next`), `citation.js` (citations résolues), `kataOffer` (`next --json`).

## Après livraison (hors dépôt)

`ai-learn update --root` dans `tech-experiments` ; dans `fastify-traducteur-api`, reprendre la phase 6 avec confiance et raisonnement.

## Clarification Readiness

ready — hypothèses étiquetées : seuil de justesse 7/10 ; trois tranches de confiance ; revisite alternée réussie à 7/10 ; formats en rotation ; budget de friction de 3 gestes bloquants par phase.
