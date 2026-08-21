# Journal de friction (dogfooding)

> Toute fois que `ai-learn` coûte plus qu'il ne rapporte, ça s'écrit ici. Pas des bug reports — **la friction** : les moments où l'outil gênait, alors qu'il fonctionnait comme conçu.

## Pourquoi ce fichier

Un outil dont l'argument entier est *« la preuve prime sur la déclaration »* ne peut pas décider quoi construire ensuite depuis l'imagination. C'est cet instrument qui fait que la période d'utilisation dans `tech-experiments` veut dire quelque chose : ce n'est pas une pause, c'est la période où l'usage réel produit la liste.

Le signal à guetter n'est pas un crash. C'est la pensée :

> *« ai-learn me fait perdre mon temps. »*

Cette phrase est un défaut plus important que n'importe quelle fonctionnalité manquante — parce qu'au bout de ce chemin il y a un apprenant qui éteint l'outil, et un outil éteint ne protège rien. **Un check qui se déclenche sur un cas qu'on ne peut pas résoudre légitimement, c'est un check qu'on apprend à désactiver.**

Il faut aussi noter, c'est facile à rater : les fois où un check s'est déclenché et **avait raison**. Un journal de friction qui ne collecte que des plaintes finira par te faire supprimer des checks qui font leur travail.

## Deux niveaux

Ce fichier-ci est le journal **agrégé côté mainteneur** (ce dépôt, dogfoodé
par toi). Il existe un second niveau : chaque projet scaffoldé par
`ai-learn init` embarque son propre `.ai-learn/dogfood.md`
(`templates/dogfood.md`), rempli **automatiquement par l'agent IA** de
l'apprenant dès que l'outil se comporte de façon inattendue (protocole dans
`templates/AGENTS-apprentissage.md`).

Ce fichier par projet n'est **jamais envoyé automatiquement** — cohérent avec
le fonctionnement offline-first de l'outil, aucun appel réseau caché. Un
apprenant l'envoie seulement quand on le lui demande explicitement. À
réception, trier les entrées et les faire remonter ici, dans les Entrées
ci-dessous, avec la **Résolution** appliquée une fois corrigée dans l'outil —
le champ que le fichier par projet n'a pas, faute de visibilité sur le code
source côté apprenant.

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

### `medium` — `docs add` un fichier (livre PDF) plante en `ENOTDIR`
- **Repo** : ai-learn (dogfooding du tool lui-même)
- **Surface** : docs
- **Problème** : `ai-learn docs add <nom> <chemin>/livre.pdf` traite toute source
  locale comme un dossier : `copyTree` fait un `readdirSync` sur le fichier →
  `ENOTDIR: not a directory` → crash (« ai-learn bug »). Apprendre depuis un
  livre PDF, cas central pour un outil d'apprentissage, était impossible.
- **Workaround** : aucun (le fichier ne pouvait pas être embarqué ; fallback
  `--online` URL seule, sans lecture locale du PDF).
- **Résolution** : `docs add` détecte une source **fichier** et l'embarque entière
  comme origine vérifiée (`{ mode: "local", file, src, generated: true }`) ; l'IA
  en distille **l'essentiel** dans `docs/sources/<nom>/essentiel.md` citant les
  pages — `check` exige un `.md` non vide qui cite le fichier (même contrat
  anti-hallucination que `--regen`, origine locale au lieu d'URL). `docs update`
  re-copie le fichier. La banque de pièges ignore le fichier non-markdown et
  extrait de `essentiel.md`.

### `medium` — `docs add` avale le `--dir` global comme source
- **Repo** : ai-learn (dogfooding du tool lui-même)
- **Surface** : docs
- **Problème** : `ai-learn docs add <name> --dir <dir>` fait fuir `<dir>` dans le parsing positionnel du sous-commande : `<dir>` devient la « source ». Avec un preset (`docs add developer-roadmap --dir …`), ça a copié `docs/sources/…` dans lui-même en boucle jusqu'à `ENAMETOOLONG`.
- **Workaround** : lancer `docs add` depuis le dossier projet, sans `--dir`.
- **Résolution** : `docsCommand` strip les `--dir` / `--dir=<val>` de ses args avant tout parsing (`stripDir`). Le preset nu (`docs add developer-roadmap`) est aussi géré : le nom seul vaut pour le preset.

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
