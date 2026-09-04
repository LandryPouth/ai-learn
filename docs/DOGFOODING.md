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

### `medium` — rien ne resurgit un travail prouvé-mais-pas-atterri après un `/clear`
- **Repo** : ai-learn (dogfooding de Coding Flow — `@landry_pouth/coding-flow` 0.10.0)
- **Surface** : `/flow-run` (fin de story) + cycle `/clear` + reprise en session fraîche
- **Problème** : story 01.06 a été implémentée, laissée `in-progress` à raison
  (un AC ne pouvait pas être prouvé en sandbox), puis la session a fait
  `run` → `clear` → `review` avant de revenir dessus bien plus tard. Diagnostic
  initial faux : « le `/clear` a cassé le `land` ». En creusant : `land`
  n'a jamais rien de cassé à réparer — tout l'état de Coding Flow (le
  `## Status`, les preuves `verify` capturées, le registre de placement des
  worktrees) vit dans des fichiers versionnés/`.git`, jamais dans le contexte
  de conversation ; un `/clear` ne touche à rien de tout ça. Le vrai trou :
  `/flow-run` n'enchaîne `unlock` + `autoland` **qu'au moment précis** où il
  vient d'écrire `## Status: done` avec un verify vert — un `land` correctement
  différé (parce que le travail n'était pas fini) ne se redéclenche jamais tout
  seul quand la dernière pièce de preuve arrive enfin (ici : un vrai run CI,
  minutes plus tard, hors du process `flow-run`). Rien entre `/clear` et
  `/flow-review` ne gère le cycle de vie des worktrees ; le worktree est resté
  orphelin jusqu'à ce qu'un humain le remarque et demande explicitement de le
  « ramener ». `/flow-next` est *conçu* pour détecter exactement ce cas (tier
  `ready-to-ship` : *« a story is proven and has unshipped work »*), mais rien
  n'oblige à le lancer après un `/clear` — ça dépend entièrement de la mémoire
  de l'humain (ou de la mienne).
- **Workaround** : lancer `/flow-next` (ou `ai-flow next`) manuellement juste
  après chaque `/clear`, avant toute autre commande, tant que rien
  d'automatique n'existe pour ça.
- **Résolution** : ouverte. Piste retenue : un hook `SessionStart` (Claude
  Code) qui lance `ai-flow next` et injecte sa sortie via
  `hookSpecificOutput.additionalContext` — coût mesuré sur ce dépôt avant
  d'installer quoi que ce soit : sortie texte ≈ 226 caractères (~60 tokens,
  recommandation seule) ou 909 caractères (~230 tokens, `--all`) ; latence
  1.4–3.2 s par run via `npx --no-install` (pas de binaire `ai-flow` direct
  dans ce projet) sur 3 essais, mais un 4e essai isolé a bloqué 2 minutes
  avant d'être coupé — accroc `npx` rare, pas reproduit ensuite, à couvrir
  par un `timeout` généreux mais borné (~10 s) sur le hook plutôt que supposé
  absent. Reste à vérifier empiriquement (pas de confirmation dans la doc
  Claude Code) : est-ce que `SessionStart` se redéclenche bien après un
  `/clear` précisément, ou seulement au lancement d'un nouveau process
  `claude` ? Sans confirmation, l'alternative de repli serait une instruction
  explicite dans `CLAUDE.md` (relu par l'agent à chaque session, indépendant
  de la mémoire humaine) plutôt qu'un hook.

### `high` — `.githooks/pre-push` corrompt le dépôt réel via `npm test` (rejoué deux fois en shippant la 01.02, `ai-flow ship` n'a pas de contournement)
- **Repo** : ai-learn (dogfooding du tool lui-même, story 01.02)
- **Surface** : `.githooks/pre-push` (hook versionné du dépôt) + suite de tests
  git (`test/git-hooks.test.js`, `test/tracks-git.test.js` et consorts) + `ai-flow
  ship` (push interne)
- **Problème** : git peuple l'environnement d'un hook avec `GIT_DIR` pointant
  vers le vrai dépôt en cours d'opération ; `pre-push` lance `npm test`, dont
  les fixtures git (`spawnSync("git", ["-C", tmpDir, ...])`) héritent cet
  environnement — `-C` ne prime pas sur un `GIT_DIR` déjà présent, donc ces
  commandes écrivent dans le **vrai** dépôt partagé au lieu de leur `tmpDir`.
  En shippant cette story, le bug s'est reproduit **deux fois de suite** dans
  la même session : une première fois via `ai-flow ship` direct (branche
  `main` et branche de story écrasées par des commits fabriqués par les
  fixtures — « feat: a », « feat: b », merges/cherry-picks de test —, et
  `.git/config` réécrit : `core.bare = true`, `core.hooksPath = custom-hooks`,
  `user.name/email = t/t@t`) ; une seconde fois via `ai-flow ship --no-commit`
  alors que le seul but de l'appel était de créer la PR — `--no-commit` ne
  dispense pas `ship` de retenter son propre `git push`, qui redéclenche le
  hook (cette fois seul `.git/config` a été réécrit, les refs sont restées
  intactes). Rien n'a jamais atteint `origin` (vérifié via `ls-remote` /
  comparaison du commit distant après coup). Complication additionnelle :
  réparer `.git/config` demande des écritures `git config`, or l'agent IA a
  l'interdiction stricte d'en faire (garde-fou indépendant de ce dépôt) —
  l'humain a dû taper les commandes de réparation lui-même, deux fois. `git
  push --no-verify` fait à la main contourne bien le hook, mais `ship`
  n'expose aucun flag équivalent : une fois la branche déjà poussée à la
  main, la seule façon d'obtenir la PR sans retoucher au dépôt a été de
  sortir complètement de `ship` et d'appeler `gh pr create` directement.
- **Workaround** : réparation manuelle du dépôt (deux fois — `git update-ref`,
  `git symbolic-ref HEAD`, `git checkout`, config restaurée à la main) ; `git
  push --no-verify` fait par l'utilisateur ; `gh pr create` direct au lieu de
  `ai-flow ship`, en réutilisant l'evidence déjà capturée par `ai-flow verify
  --story ...` dans le corps de la PR.
- **Résolution** : ouverte. Piste retenue côté tests : dans les fixtures git,
  passer un `env` explicite à `spawnSync` qui supprime
  `GIT_DIR`/`GIT_WORK_TREE`/`GIT_INDEX_FILE`/`GIT_COMMON_DIR` hérités plutôt
  que de compter sur `-C`/`cwd` seuls. Piste additionnelle propre à `ship` :
  exposer un `--no-verify`/`--skip-hook` qui passe `--no-verify` à son `git
  push` interne, pour que le contournement reste utilisable **via l'outil**
  plutôt que de forcer à en sortir complètement.

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
- **Workaround** : nettoyage manuel de la réservation périmée — vérifié sur ce
  dépôt (`.git/coding-flow/worktree-plan/epic-01-verdict-fiable.json` contient
  bien `"s1": { "location": ".../ai-learn" }` alors que `s1`
  (story-01-01) est fusionnée depuis longtemps). Une fois une chaîne confirmée
  `done`/fusionnée sur le dossier principal, retirer sa clé (`s1`, `s2`, …) du
  fichier JSON de l'epic sous `.git/coding-flow/worktree-plan/<epic>.json`
  (`{ "chains": {} }` si c'est la seule entrée) avant le prochain
  `ai-flow worktree place` — édition de métadonnées pure, aucun risque sur le
  code ou l'historique git : au pire, si fait à tort, le comportement actuel
  (un worktree de trop) ne fait que continuer.
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
