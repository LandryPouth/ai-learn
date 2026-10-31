# Documentation — ai-learn

> Point d'entrée de `docs/` : quoi lire selon ce que tu veux faire, pour un humain comme pour un agent.

## Je veux…

| Besoin | Lire |
|---|---|
| Comprendre à quoi sert l'outil et l'installer | [`README.md`](../README.md) (racine) |
| Faire un premier parcours de bout en bout | [`QUICKSTART.md`](QUICKSTART.md) |
| Savoir où en est le projet (état, versions, ce qui reste ouvert) | [`project-context.md`](project-context.md) |
| Comprendre le code (modules, dépendances, invariants) | [`architecture.md`](architecture.md) |
| Écrire du code dans ce dépôt (style, tests, données) | [`conventions.md`](conventions.md) |
| Voir pourquoi on a décidé ça et dans quel ordre | [`roadmap.md`](roadmap.md) et `epics/` |
| Voir les frictions rencontrées en utilisant l'outil | [`DOGFOODING.md`](DOGFOODING.md) |
| Lire une analyse longue (norme, git/gh, portabilité) | [`plans/`](plans/) |
| Savoir ce qui a changé par version | [`CHANGELOG.md`](../CHANGELOG.md) |

## Pour un agent

1. Lis [`CLAUDE.md`](../CLAUDE.md) puis [`RULES.md`](../RULES.md) : contraintes du dépôt (zéro dépendance, tests, sécurité).
2. Lis [`project-context.md`](project-context.md) : c'est la carte de l'état actuel, pas un journal.
3. Pour une story, lis seulement son dossier `epics/epic-NN-*/story-NN-MM-*/` (`spec.md`, `plan.md`, `tasks.md`), pas toute la doc.
4. Avant de coder, `npm test` doit être vert ; avant de livrer, `ai-flow verify --story <dossier>`.
5. Une friction de l'outil de workflow va dans [`DOGFOODING.md`](DOGFOODING.md), dans la même passe.

## Pour l'apprenant

L'apprenant ne tape pas de commande `ai-learn` : il passe par `/learn`, `/learn-next`,
`/learn-status` et `/learn-break` dans son agent. Le protocole que l'agent suit est
écrit dans l'`AGENTS.md` posé par `ai-learn init` (gabarit : `templates/AGENTS-apprentissage.md`).

## Règles de tenue de la doc

- `project-context.md` décrit l'état actuel ; il ne contient ni journal ni plan.
- Un module ajouté dans `bin/lib/` est ajouté à [`architecture.md`](architecture.md) dans la même PR.
- Un changement de comportement visible est ajouté au [`CHANGELOG.md`](../CHANGELOG.md) et déclenche un bump de `package.json`.
