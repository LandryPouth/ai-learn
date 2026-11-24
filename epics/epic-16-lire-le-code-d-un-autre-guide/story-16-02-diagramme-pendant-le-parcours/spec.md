# Spec — Story 16.02 — Le diagramme du système grandit à chaque arrêt

## User Value

Pendant qu'il lit le dépôt, l'apprenant dessine le système : à chaque arrêt visité, il ajoute la boîte ou la flèche qu'il vient de comprendre, dans son calque. L'IA corrige ensuite dans son calque à elle. À la fin du parcours, il a une carte visuelle du projet faite de sa main, et il a été forcé de découper ce qu'il lisait au lieu de le survoler.

## Requirements

- `tour start` pose aussi `systeme.drawio` (calques comme l'epic 15, page `contexte`) et `diagramme.md` (même gabarit que 15.01) dans le dossier de lecture.
- **Cycle par arrêt** : après le reveal de la prédiction `lecture` de l'arrêt, `tour next` attend `diagram` : le calque `apprenant` doit avoir changé depuis l'arrêt précédent (empreinte de 15.01). Un arrêt est **fermé** quand prédiction révélée **et** diagramme mis à jour.
- Toutes les 3 arrêts fermés (et au dernier) : `diagram snapshot` puis correction de l'IA dans `ia-arret-<n>` puis `diagram reveal` (15.02, avec le dossier de lecture comme `dir`) ; écarts enregistrés en prédiction `schema` (15.03).
- `tour start --guard` (opt-in) : écrit le hook du guard dans `<dépôt>/.claude/settings.local.json` (le diagramme du dossier de lecture muré hors fenêtre, rien d'autre de protégé) et ajoute `.claude/settings.local.json` à `<dépôt>/.git/info/exclude` ; `tour stop` (fin) retire exactement ce qui a été ajouté. Sans `--guard` : consigne seule, dite dans `LISEZ-MOI.md`.
- Le lint de découpage (15.04) s'applique et s'affiche dans `tour status`.
- `LISEZ-MOI.md` complété : « Ton diagramme pendant la lecture » (une boîte ou une flèche par arrêt au minimum, les calques, la correction toutes les 3 arrêts, l'option `--guard` et sa limite).
- Docs : README, `project-context.md`, `references/lecture.md` (poser le dessin à chaque arrêt, ne jamais dessiner à la place de l'apprenant).

## Acceptance Criteria

- [ ] Given `tour start`, when on liste le dossier de lecture, then `systeme.drawio` et `diagramme.md` existent.
- [ ] Given un arrêt dont la prédiction est révélée et le calque inchangé, when `tour next --json`, then `expected` vaut `diagram` et l'arrêt n'est pas fermé.
- [ ] Given une boîte ajoutée, when `tour next`, then l'arrêt est fermé et le suivant devient courant.
- [ ] Given 3 arrêts fermés, when `tour next --json`, then `expected` vaut `correction` (snapshot attendu).
- [ ] Given `tour start --guard`, when on lit le dépôt, then seuls `.claude/settings.local.json` et une ligne de `.git/info/exclude` ont changé ; after `tour stop`, l'arbre et `exclude` sont revenus à l'identique.
- [ ] Given `--guard` et aucune fenêtre ouverte, when l'IA écrit le `systeme.drawio` du dossier de lecture, then le guard refuse.
- [ ] Given un dépôt qui a déjà un `settings.local.json`, when `tour start --guard`, then le hook est ajouté sans toucher le reste, et retiré seul au `stop`.

## Edge Cases

- Dépôt sans `.git` : `--guard` écrit `settings.local.json` et prévient qu'il n'est pas exclu du versionnement.
- Plateformes sans hook : `--guard` refusé avec la limite expliquée.

## Out of Scope

- Un diagramme par flux (16.03 ajoute une page `flux`, sans nouveau mécanisme).
