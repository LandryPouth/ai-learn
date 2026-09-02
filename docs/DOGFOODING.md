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

### `high` — `.githooks/pre-push` corrompt le dépôt réel via `npm test`
- **Repo** : ai-learn (dogfooding du tool lui-même, story 01.06)
- **Surface** : `.githooks/pre-push` (hook versionné du dépôt) + suite de tests
  (`test/git-hooks.test.js`, `test/tracks-git.test.js` et consorts, qui
  fabriquent de vrais mini-dépôts git pour tester le module git/gh)
- **Problème** : git peuple l'environnement d'un hook avec `GIT_DIR` (et
  `GIT_WORK_TREE`/`GIT_INDEX_FILE`) pointant vers le vrai dépôt en cours
  d'opération. `pre-push` lance `npm test`, qui hérite cet environnement ; les
  fixtures de test font `spawnSync("git", ["-C", tmpDir, ...])`, mais `-C` ne
  prime pas sur un `GIT_DIR` déjà présent dans l'environnement — ces commandes
  finissent donc par écrire dans le **vrai** dépôt partagé au lieu de leur
  `tmpDir` isolé. Constaté trois fois de suite, reproductible à chaque `git
  push` : `.git/config` réécrit (`core.bare = true`, `core.hooksPath =
  custom-hooks`, `user.name/email = t/t@t`, `extensions.worktreeConfig`),
  `refs/heads/main` et la branche de la story déplacées vers des commits
  fabriqués par les fixtures (« feat: a », « feat: b », merges/cherry-picks de
  test), et le `HEAD` par-worktree d'un worktree lié repointé sur `main`. Rien
  n'a jamais atteint `origin` (vérifié à chaque fois via `ls-remote`), mais le
  dépôt local a dû être restauré à la main trois fois (`git update-ref`,
  `git symbolic-ref HEAD`, `git reset --hard`) avant de pouvoir pousser. Un
  quatrième worktree (`story-01-02-preuve-perimee-a-reprouver`) a été laissé
  corrompu par le même bug, sans lien avec cette story, non réparé ici.
- **Workaround** : `git push --no-verify` — légitime ici parce que `npm test`
  était déjà prouvé vert (318/318) hors contexte de hook (exécution directe,
  sans `GIT_DIR` dans l'environnement) ; le hook local n'ajoutait aucune
  garantie qu'il ne pouvait lui-même pas tenir, et la vraie preuve
  (CI GitHub Actions, sans ce hook) restait intacte.
- **Résolution** : ouverte. Piste retenue : dans les tests qui fabriquent des
  dépôts git isolés, passer un `env` explicite à `spawnSync` qui supprime
  `GIT_DIR`/`GIT_WORK_TREE`/`GIT_INDEX_FILE`/`GIT_COMMON_DIR` hérités, plutôt
  que de compter sur `-C`/`cwd` seuls pour l'isolation.

### `medium` — Worktree créé pour une chaîne qui n'a rien à paralléliser
- **Repo** : ai-learn (dogfooding de Coding Flow — `@landry_pouth/coding-flow` 0.10.0)
- **Surface** : `ai-flow worktree place` (placement automatique des stories)
- **Problème** : sur l'epic-01 (`s1` se ramifie en `s2`→`s3`→`s4`→`s5` et `s6`),
  `s1` a tourné directement sur le dossier principal (rien d'autre en cours à ce
  moment). Son entrée dans le carnet de réservation
  (`.git/coding-flow/worktree-plan/<epic>.json`) n'est jamais nettoyée : la
  libération (`clearChainPlacement`) n'est déclenchée que par un `land` depuis un
  worktree isolé, jamais par une chaîne qui a fini **sur place**. Conséquence :
  lancer `story-01-02` (nouvelle chaîne au point de ramification) plus tard, alors
  que rien ne tourne en parallèle, la fait quand même partir dans un nouveau
  worktree (`ai-learn-worktrees/story-01-02-preuve-perimee-a-reprouver`) — parce
  que le carnet voit encore `s1` comme « occupant » le dossier principal, bien que
  `s1` soit terminée depuis longtemps. Isolation inutile : dossier, branche et
  `land` en plus pour un travail qui n'avait rien à paralléliser.
- **Workaround** : aucun — accepté tel quel, correctif prévu directement dans
  Coding Flow plutôt qu'en contournement côté ai-learn.
- **Résolution** : ouverte. Piste retenue : libérer la réservation d'une chaîne
  dès qu'elle atteint `done`, pas seulement au `land` d'un worktree isolé — pour
  qu'une chaîne terminée sur place cesse d'occuper le dossier principal aux yeux
  du placement.

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
