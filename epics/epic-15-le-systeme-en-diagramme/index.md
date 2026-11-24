# Epic 15 — Le système en diagramme

## Goal

Chaque projet d'apprentissage porte un diagramme draw.io de son système (`docs/systeme.drawio`). L'apprenant le dessine **d'abord**, dans son calque `apprenant`, avant la phase : c'est une prédiction visuelle de la structure. Après la phase, l'IA corrige **seulement dans un calque à elle** (`ia-phase-N`, autre couleur). L'apprenant compare en masquant ou affichant ce calque, puis reporte lui-même les corrections dans le sien. L'outil garantit l'ordre et l'intégrité des calques, note les écarts, fait redessiner de mémoire en revisite, et entraîne à découper un système en boîtes et à l'expliquer.

## Business Value

- Apprentissage visuel et rétention : le dessin avant la révélation est une récupération active, le report des corrections ancre le souvenir.
- Compétence d'ingénieur : découper un système (une responsabilité par boîte, flèches nommées, frontières visibles, chemin d'erreur) et l'expliquer.
- Cohérent avec la thèse d'ai-learn : l'ordre « l'apprenant d'abord, l'IA ensuite » est vérifié par l'outil, pas promis par l'agent.

Origine : demande du mainteneur (2026-11-24), à partir de ses diagrammes `Fastify.drawio` (fait à la main, 203 éléments) et du mémo `http-lifecycle-cheatsheet.png`. **Décision du mainteneur : pas de mémo PNG généré en fin de parcours, le diagramme suffit.**

## Scope

Inclus :

- [ ] `docs/systeme.drawio` posé par `init`/`update` (calque `apprenant`, page `contexte`) et un **mode d'emploi généré dans le projet** (`docs/diagramme.md`) : calques, cycle d'une phase, commandes, règles. Chaque story de l'epic le complète.
- [ ] Drapeau de phase `diagram: true` : `verify` exige que le calque `apprenant` ait changé depuis la phase prouvée précédente.
- [ ] `ai-learn diagram snapshot|reveal|status` ; mur du guard sur le `.drawio` hors de la fenêtre de correction ; `check` détecte une IA qui a touché au calque `apprenant`.
- [ ] Écarts comptés au reveal (prédiction de type `schema`) ; revisite : redessiner de mémoire, boîtes retrouvées comptées.
- [ ] Grille de découpage : `ai-learn diagram lint` (7 boîtes au plus par page, flèches étiquetées, pages par niveau de zoom C4) et prédiction `explication` notée sur la grille.

Exclus :

- [ ] Mémo ou cheat sheet PNG généré (décision du mainteneur).
- [ ] Rendu SVG/PNG du diagramme, éditeur intégré : l'apprenant édite avec draw.io (bureau Windows) ou l'extension VS Code « Draw.io Integration ».
- [ ] Format compressé de draw.io : refusé avec un message (draw.io : Fichier → Propriétés → décocher « Compressé »).
- [ ] Mermaid ou Excalidraw : draw.io est déjà l'outil du mainteneur et son XML a des calques.

## Décisions de l'epic

- **draw.io, XML non compressé** : lisible par l'outil (zéro dépendance, parseur minimal des `mxCell`), diffable dans git, calques natifs.
- **Calques = frontière de propriété** : `apprenant` est à l'apprenant, `ia-phase-N` à l'IA. L'IA n'ajoute ni ne modifie rien hors de son calque ; l'outil le vérifie par empreinte du calque `apprenant`.
- **Fenêtre de correction** : l'IA n'écrit dans le `.drawio` qu'entre `diagram snapshot` (après la phase prouvée) et `diagram reveal`. Hors fenêtre, le guard refuse (mur sous Claude Code et OpenCode, consigne ailleurs, limite documentée comme pour `src/**`).
- **Heuristiques non bloquantes** (invariant 6) : le lint de découpage avertit, il ne bloque jamais `verify`. Ce qui bloque : calque `apprenant` inchangé sur une phase `diagram: true`, calque `apprenant` modifié par l'IA.
- **Documentation obligatoire dans chaque story** : `docs/diagramme.md` du projet d'apprentissage (gabarit `templates/diagramme.md`, régénéré par `update` s'il n'est pas personnalisé), README, `docs/project-context.md`, `docs/architecture.md`, `templates/AGENTS-apprentissage.md`, et `docs/pedagogie.md` si 14.02 est livrée.

## Backbone

Backbone: l'apprenant dessine avant la phase → la phase est prouvée → l'IA corrige dans son calque → l'apprenant compare et reporte → il redessine de mémoire → il découpe et explique

```text
s1 ── s2 ──┬── s3
           └── s4
```

| Story | Bâtit sur | Pourquoi |
|---|---|---|
| `s1` | — | Racine : fichier, mode d'emploi, lecture des calques, exigence de `verify`, rappels de `next`/`status`. |
| `s2` | `s1` | Fenêtre de correction et intégrité, sur le parseur et l'empreinte de `s1`. |
| `s3` | `s2` | Les écarts se comptent au `reveal` de `s2`. |
| `s4` | `s2` | Le lint lit les calques ; l'explication suit un reveal. Fichiers disjoints de `s3` (`diagram-lint.js` contre `revisit.js`), parallélisables. |

## Stories

1. **[story-15-01-diagramme-de-bout-en-bout](story-15-01-diagramme-de-bout-en-bout/spec.md)** — walking skeleton.
2. **[story-15-02-calque-de-l-ia-et-mur](story-15-02-calque-de-l-ia-et-mur/spec.md)**
3. **[story-15-03-ecarts-notes-et-revisite-dessinee](story-15-03-ecarts-notes-et-revisite-dessinee/spec.md)**
4. **[story-15-04-decouper-et-expliquer](story-15-04-decouper-et-expliquer/spec.md)**

## Context Strategy

- Mode : `s1`, `s3`, `s4` `STANDARD` ; `s2` `STRICT` (extension du guard).
- Scout pre-step : aucun.
- Modèles à calquer : `source-hash.js` (empreinte), `incident.js`/`review.js` (fenêtre où l'IA est murée, état public dans `.ai-learn/`), `predictions.js` (types), `revisit.js`, `bilan.js` et `predictions.js#syncJournalRender` (fichier généré sauf s'il est personnalisé).
- À ne pas toucher sans décision : la grammaire shell de `guard.js` (on ajoute un chemin protégé conditionnel).

## Après livraison (hors dépôt)

`ai-learn update --root ~/dev/learning/tech-experiments` ; dans `fastify-traducteur-api`, reprendre `Fastify.drawio` du bureau comme point de départ du calque `apprenant` (copie, décompressé), puis taguer `diagram: true` les phases qui changent la structure.

## Clarification Readiness

ready — validé par le mainteneur le 2026-11-24 (draw.io, calques, fenêtre de correction, grille, pas de PNG). Hypothèses étiquetées : 7 boîtes par page ; seuil de revisite 70 % des boîtes ; correspondance des boîtes par libellé normalisé.
