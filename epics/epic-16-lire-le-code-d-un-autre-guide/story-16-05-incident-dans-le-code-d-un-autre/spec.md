# Spec — Story 16.05 — Un incident dans le code d'un autre

## User Value

Lire un dépôt, c'est aussi le déboguer. Dans le bac à sable de 16.04, l'outil casse le code étranger sans dire où ; l'apprenant ne dispose que du symptôme (la commande de test qui échoue), diagnostique dans un code qu'il n'a pas écrit, et répare. C'est exactement ce que le mode compagnon prépare : intervenir vite dans un projet inconnu quand il casse.

## Requirements

- `ai-learn tour incident --alias <a>` : exige un bac à sable (16.04) dont la commande de test déclarée est verte avant l'incident ; sinon refus clair. Choisit un site dans les fichiers sources du bac à sable (jamais un fichier de test, jamais un endroit cité comme arrêt), applique une mutation du catalogue existant d'`incident.js` (réutilisé, pas réécrit), relance la commande et vérifie qu'elle échoue (sinon, un autre site ; 5 essais au plus, puis refus « aucun site ne casse les tests »). Le site est gardé hors de la vue de l'agent tuteur comme pour `/learn-break` (état dans le dossier de lecture, original sauvegardé).
- Le diagnostic est une prédiction `debug` (existante) dans le dossier de lecture : fichier, cause supposée, avant toute correction.
- `tour incident --alias <a> --resolve` : relance la commande ; verte = incident résolu, la prédiction est révélée avec le site réel (`exact|fichier|manqué` sur la prédiction). `--giveup` restaure l'original et révèle le site.
- Un seul incident ouvert à la fois par parcours ; `tour status` : « incidents : n résolus, m abandonnés ».
- Incident proposé par `tour next` après un examen réussi, jamais exigé (budget de friction de 14.02).
- `LISEZ-MOI.md` : « L'incident dans le code d'un autre » ; docs : README, `project-context.md`, `architecture.md`.

## Acceptance Criteria

- [ ] Given aucun bac à sable, when `tour incident`, then exit 1 renvoyant à `tour exam --sandbox`.
- [ ] Given une commande de test rouge avant l'incident, when `tour incident`, then exit 1 « répare d'abord le bac à sable ».
- [ ] Given un bac à sable vert, when `tour incident` (générateur injecté), then un fichier source non test est modifié, la commande échoue, et la source d'origine est inchangée.
- [ ] Given un incident ouvert et la mutation annulée par l'apprenant, when `--resolve`, then résolu et la prédiction `debug` révélée avec le site.
- [ ] Given un incident ouvert, when `--giveup`, then le fichier retrouve son contenu d'origine (octet pour octet) et le site est affiché.
- [ ] Given un incident ouvert, when `tour incident` de nouveau, then exit 1 « un incident est déjà ouvert ».

## Edge Cases

- L'apprenant a aussi modifié le fichier muté pendant sa réparation : `--giveup` restaure l'original et le dit.
- Bac à sable nettoyé (`--clean`) avec un incident ouvert : refus de nettoyer tant que l'incident n'est pas clos.

## Out of Scope

- Pannes d'environnement (port, service) d'`incident.js` : seulement les mutations de code.
- Niveaux de difficulté : un seul niveau, choisi parmi les mutations existantes.
