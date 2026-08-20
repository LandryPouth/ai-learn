# Journal de friction (dogfooding)

> Toute fois que `ai-learn` coûte plus qu'il ne rapporte, ça s'écrit ici. Pas des bug reports — **la friction** : les moments où l'outil gênait, alors qu'il fonctionnait comme conçu.

## Pourquoi ce fichier

Un outil dont l'argument entier est *« la preuve prime sur la déclaration »* ne peut pas décider quoi construire ensuite depuis l'imagination. C'est cet instrument qui fait que la période d'utilisation dans `tech-experiments` veut dire quelque chose : ce n'est pas une pause, c'est la période où l'usage réel produit la liste.

Le signal à guetter n'est pas un crash. C'est la pensée :

> *« ai-learn me fait perdre mon temps. »*

Cette phrase est un défaut plus important que n'importe quelle fonctionnalité manquante — parce qu'au bout de ce chemin il y a un apprenant qui éteint l'outil, et un outil éteint ne protège rien. **Un check qui se déclenche sur un cas qu'on ne peut pas résoudre légitimement, c'est un check qu'on apprend à désactiver.**

Il faut aussi noter, c'est facile à rater : les fois où un check s'est déclenché et **avait raison**. Un journal de friction qui ne collecte que des plaintes finira par te faire supprimer des checks qui font leur travail.

## Comment enregistrer une entrée

Une ligne par incident, la plus récente en premier. Court ; la valeur est dans le volume et l'honnêteté, pas dans la prose.

- **Repo** — où c'est arrivé.
- **Surface** — quelle partie : init, status, verify, check, progress.json, CLI.
- **Problème** — ce qui s'est réellement passé, en une phrase.
- **Sévérité** — `low` (agace) · `medium` (coûte du temps) · `high` (aucun correctif légitime, ou verdict faux).
- **Workaround** — ce que tu as fait pour avancer. `désactivé le check` est la valeur la plus importante que cette colonne puisse contenir ; ne l'omets jamais pour faire joli.
- **Résolution** — le correctif appliqué dans l'outil, ou vide si toujours ouvert.

## Entrées

<!-- Nouvelle entrée en haut, sous cette ligne. -->

### `high` — Phase « faite » sans aucune preuve possible
- **Repo** : fastify-traducteur-api (tech-experiments)
- **Surface** : concept (suivi de progression)
- **Problème** : la Phase 0 était considérée « passée » mais le suivi était vide : pas de ledger, pas de fiche de phase, pas de test de checkpoint. Rien ne distinguait « fait » de « déclaré fait ».
- **Workaround** : aucun — c'est le trou que l'outil est né pour boucher. Verdict honnête aujourd'hui : Phase 0 = non prouvée.
- **Résolution** : `ai-learn check` signale une phase `done` sans évidence comme une **erreur** (exit 1).

### `low` — `init` non destructif silencieux
- **Repo** : fastify-traducteur-api (tech-experiments)
- **Surface** : init
- **Problème** : relancer `init` sur un projet déjà scaffoldé imprime `kept <file>` pour chaque fichier existant, ce qui peut ressembler à une erreur pour quelqu'un qui voulait régénérer.
- **Workaround** : comprendre que `kept` = volontaire (non destructif).
- **Résolution** : aucune pour l'instant — vérifier si le message doit dire autre chose.

### `medium` — checkpoints « conversationnels » non exécutables
- **Repo** : fastify-traducteur-api (tech-experiments)
- **Surface** : concept (checkpoint)
- **Problème** : le plan prévoit des checkpoints de compréhension (« expliquer le cycle de vie d'une requête ») qui ne sont pas exécutables par `verify`. Forcer un test là-dessus serait du théâtre.
- **Workaround** : séparer — le **comportement** est prouvé par le checkpoint exécutable ; la **compréhension** est prouvée par le journal de prédictions (comptes d'écarts) et les reality checks. Documenté dans le template de plan.
- **Résolution** : template de plan mis à jour pour clarifier cette séparation.
