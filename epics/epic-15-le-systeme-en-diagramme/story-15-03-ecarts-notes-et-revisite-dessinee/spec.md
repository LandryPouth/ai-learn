# Spec — Story 15.03 — Les écarts du dessin comptent, et on redessine de mémoire

## User Value

Ce que l'IA a dû ajouter à son dessin devient un score, comme pour une prédiction : l'apprenant voit sa carte mentale du système progresser de phase en phase. En revisite, il redessine le système de mémoire sur une page blanche, et l'outil compte les boîtes retrouvées.

## Requirements

- `diagram reveal` (15.02) enregistre aussi une prédiction de type `schema` (`PREDICTION_TYPES`) : `gaps` = « boîtes ajoutées + flèches ajoutées / total du calque `apprenant` + ajouts », `at` = date du snapshot, `revealedAt` = date du reveal ; l'IA complète le feedback habituel (`--score`, `--strengths`, `--weaknesses`, `--flash`) par `predict --reveal`. `predictionsRequired: { schema: 1 }` est compté par `verify` comme les autres types.
- `docs/plans/predictions.md` rend les entrées `schema` (« Diagramme — phase N : x ajouts sur y »).
- **Revisite dessinée** : pour une phase `diagram: true` en revisite (`revisit <id>`), l'outil crée une page `revisite-<date>` vide dans `docs/systeme.drawio` (calque `apprenant`) ; l'apprenant redessine sans regarder ; `verify --revisit` compare les libellés normalisés (minuscules, sans accents ni ponctuation) de la page aux boîtes de la page `contexte` au moment de la preuve : taux de boîtes retrouvées. Passe si ≥ 70 %. La page est conservée.
- `status` : ligne « diagramme : écarts moyens » ; `bilan` (s'il est généré) : section « Diagramme » avec l'évolution des écarts par phase.
- **Mode d'emploi** complété : « Comment tes écarts sont comptés », « La revisite dessinée » (ne pas regarder la page `contexte`, astuce : masquer les autres pages n'existe pas dans draw.io → la page de revisite s'ouvre seule en tête).
- Docs : README, `project-context.md`, AGENTS (§5bis revisite, §Diagramme), `docs/pedagogie.md` si présent.

## Acceptance Criteria

- [ ] Given un reveal avec 2 boîtes et 1 flèche ajoutées sur un calque de 9 éléments, when on lit `predictions.json`, then une entrée `schema` a `gaps` « 3/12 ».
- [ ] Given une phase `predictionsRequired: { schema: 1 }` sans reveal, when `verify`, then bloquée pour une prédiction `schema` manquante.
- [ ] Given `revisit` d'une phase `diagram: true`, when on lit le `.drawio`, then une page `revisite-<date>` vide existe.
- [ ] Given 8 boîtes retrouvées sur 10 (libellés à accents et casse différents), when `verify --revisit`, then succès et « 8/10 » affiché.
- [ ] Given 6 boîtes sur 10, when `verify --revisit`, then échec avec les libellés manquants.
- [ ] Given des entrées `schema`, when `status`, then la ligne des écarts apparaît.

## Edge Cases

- Libellés dupliqués : comptés par multiplicité.
- Page `contexte` absente au moment de la preuve : revisite dessinée impossible, message clair, revisite classique inchangée.

## Out of Scope

- Correspondance sémantique des libellés (synonymes) : seule la normalisation simple est appliquée ; limite écrite.
- Choisir le format de revisite (`code`, `dessin`, `alterne`) : 14.04 réutilise la revisite dessinée comme format `dessin`.
