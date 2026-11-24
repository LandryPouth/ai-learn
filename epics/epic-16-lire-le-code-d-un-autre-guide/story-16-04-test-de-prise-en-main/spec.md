# Spec — Story 16.04 — Prouver qu'on peut intervenir dans le dépôt

## User Value

À la fin du parcours, l'outil pose trois questions de terrain « où changerais-tu X ? » (ajouter une donnée, changer une règle, corriger un comportement), puis demande d'en **faire réellement une** : dans une copie jetable du dépôt, l'apprenant écrit le changement et un test qui le prouve. Localiser ne suffit pas pour dire « je peux intervenir » ; un test vert dans le code d'un autre, si.

## Requirements

- `ai-learn tour exam --alias <a>` : exige tous les arrêts fermés (16.02), au moins un flux terminé (16.03) et un `diagram reveal` après le dernier arrêt ; sinon refus listant ce qui manque. L'agent pose 3 changements réalistes (consigne `references/lecture.md` : un ajout de donnée, une règle à modifier, un bug à corriger ; jamais un endroit déjà cité comme arrêt).
- **Localisation** : chaque réponse = prédiction `lecture` marquée `exam: true` (12.01 : `--found` vérifié, score `exact|fichier|dossier|manqué`). Il faut au moins 2 sur 3 en `exact` ou `fichier` pour passer à la suite.
- **Le changement réel** : `tour exam --alias <a> --sandbox --test-cmd "<commande>"` crée une copie jetable dans `~/.ai-learn/reading/<alias>/bac-a-sable/` : `git clone --local` si la source est un dépôt git (rien n'est écrit dans son `.git`), sinon copie sans `node_modules`/`.git` (refus au-delà de 5 000 fichiers). L'apprenant choisit un des 3 changements, l'implémente avec un test dans le bac à sable (il installe lui-même les dépendances si besoin). `tour exam --alias <a> --check` lance la commande de test déclarée dans le bac à sable (jamais dans la source) : il faut qu'elle sorte en 0 **et** que le diff du bac à sable touche un fichier de test et un fichier source.
- `tour exam --alias <a> --close` : réussi si la localisation est passée et le `--check` vert ; enregistre `passedAt` dans `tour.json` et dans le ledger `~/.ai-learn/tracks/reading.json` (une entrée par parcours : alias, source, `passedAt` ou `null` ; pas de paliers). Écriture via `tracks/store.js`. `tour exam --alias <a> --clean --yes` supprime le bac à sable (sans `--yes` : liste ce qui serait supprimé, rien n'est touché).
- `tour status` et `status` (dans un projet d'apprentissage) : ligne « lecture guidée : n parcours, m réussis » ; `ledgers --repair` connaît le nouveau ledger.
- Si l'epic 13 est livrée : `memory export` inclut les parcours (alias, arrêts, résultat de l'examen, écarts du diagramme).
- `LISEZ-MOI.md` : « Le test de prise en main » (localiser, puis changer pour de vrai dans le bac à sable) ; docs : README (tableau des mécanismes), `project-context.md` (ledger), `architecture.md`.

## Acceptance Criteria

- [ ] Given un arrêt non fermé, when `tour exam`, then exit 1 listant l'arrêt.
- [ ] Given aucun flux terminé, when `tour exam`, then exit 1 nommant le flux manquant.
- [ ] Given 1 réponse `fichier` et 2 `manqué`, when `tour exam --sandbox`, then exit 1 « localisation non réussie », aucun bac à sable créé.
- [ ] Given une source git et la localisation réussie, when `--sandbox`, then le bac à sable est un clone et l'empreinte de la source (dont `.git`) est inchangée.
- [ ] Given un bac à sable modifié sans fichier de test touché, when `--check`, then échec « aucun test ajouté ou modifié ».
- [ ] Given un changement et un test, commande verte, when `--check` puis `--close`, then `passedAt` est écrit dans `reading.json`.
- [ ] Given une commande qui sort en 1, when `--check`, then échec et `--close` refuse.
- [ ] Given `reading.json` contenant un parcours dont la source n'existe plus, when `ledgers --repair --dry-run`, then il est listé.

## Edge Cases

- Examen repassé : les nouvelles questions visent d'autres endroits (l'outil refuse un `--found` identique à une question précédente de l'examen).
- Source non git et trop grosse : refus clair, la localisation reste acquise.

## Out of Scope

- Ouvrir une PR vers le dépôt réel : le bac à sable reste local.
- Installer les dépendances à la place de l'apprenant.
