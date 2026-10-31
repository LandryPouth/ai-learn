# Epic 09 — Preuve fiable, dogfood clos

## Goal

Rendre vrai, sans exception connue, ce que l'outil affirme : une phase `done` a été prouvée sur le code de l'apprenant par un test qui teste vraiment quelque chose ; le garde-fou annoncé « actif » l'est ; les ledgers cross-projet ne contiennent que de vrais projets ; une revisite prouve la mémoire, pas la présence du code. Puis fermer chaque entrée encore ouverte des journaux de friction de `tech-experiments`, pour repartir sur l'epic 10 avec un outil sain, en attendant de nouveaux retours.

## Business Value

L'argument entier d'`ai-learn` est « la preuve prime sur la déclaration ». L'audit du 2026-10-30 a reproduit des cas où ce n'est pas vrai, et le seul projet réellement mené (`fastify-traducteur-api`, 6/11 phases) n'a jamais bénéficié des epics 02-08 : ses ledgers sont vides, et ceux de l'utilisateur sont remplis par la suite de tests.

Constats reproduits (projet jetable, `HOME` isolé, sauf mention) :

- **Preuve falsifiable** : checkpoint remplacé par `node -e 0` dans `progress.json` → `verify` marque `done`, `check` répond « ✓ check passed ».
- **Zéro test = vert** : `node --test` sans aucun fichier de test → phase `done`.
- **Garde-fou éteint en silence** : hook pointant vers un clone déplacé → Claude Code laisse tout passer (seul l'exit 2 bloque), `check` affiche « actif ». `update` garde volontairement le chemin mort (`guard.js`, `ensureGuardHook`).
- **Réglages des contrôles écrits par l'IA** : `tutor.json`, `norm.json`, `mutate.json`, `predictions.json` sont modifiables par Write/Edit.
- **Antériorité des prédictions inopérante** : `predict` estampille `at` et `revealedAt` au même instant (`predictions.js`), l'anomalie ne peut jamais se produire.
- **Ledgers réels pollués par `npm test`** (machine de l'utilisateur) : `~/.ai-learn/tracks/git.json` 1 290 projets, tous `/tmp/ai-learn-test-*` ; `tests.json` tiers 1, 2, 6 « atteints » par des projets de test ; déjà nettoyé à la main le 2026-10-19, repollué le 24/10 et le 30/10. Aucun projet réel dans aucun ledger : les synchronisations de `verify` échouent dans le bac à sable et sont avalées (`catch {}`).
- **Revisite toujours verte** : `verify --revisit` relance le checkpoint sur le code inchangé ; `/learn` ne pose jamais `reviewAfterDays`.
- **Norme au fil de l'eau inopérante en mode apprenti** : le hook PostToolUse ne voit que les écritures de l'IA, qui n'a pas le droit d'écrire `src/**` ; l'entrée Fastify « norm jamais déclenché » reste donc ouverte malgré la story 07-03.
- **Scaffold** : pas de `.gitignore` alors que l'outil conseille `git add -A` ; `init --project X` écrit dans le dossier courant (incident reproduit 2 fois, `mini-redis-cpp` et `cloudops-lab`) ; depuis un sous-dossier, toutes les commandes répondent « Run `ai-learn init` first » ; un `progress.json` corrompu donne le même message ; `commands/` absent du champ `files` de `package.json`.
- **Bruit et messages** : `check` sur Fastify = 7 avertissements dont 5 sur des phases pas commencées ; `next` renvoie encore vers une édition manuelle de `docs/plans/predictions.md` ; sorties mi-anglais mi-français ; échec de `docs add` en clone git sans étape ni cause (`tradelog-postgres-lab`).
- **Projet en retard sur l'outil** : Fastify n'a ni `predictions.json`, ni `tutor.json`, ni `mutate.json`, ni l'import `@AGENTS.md` ; rien ne le dit à l'apprenant hors `check`.

## Scope

Inclus :

- [ ] Ledgers cross-projet propres : tests isolés, filet de sécurité, réparation, rattrapage depuis les preuves d'un projet, échec de synchronisation visible.
- [ ] Verdict de checkpoint honnête : changement de checkpoint détecté, zéro test refusé, checkpoint qui ne touche pas le code signalé, processus d'arrière-plan maîtrisé.
- [ ] Garde-fou sans angle mort : réglages des contrôles hors de portée de l'IA, prédiction en deux temps, hook mort détecté et réparé.
- [ ] Scaffold au bon endroit : `.gitignore`, dossier de `init`, racine trouvée depuis un sous-dossier, JSON corrompu nommé, paquet npm complet.
- [ ] Norme mesurée au moment où l'IA relit le code de l'apprenant.
- [ ] Revisite qui retire le code de la phase avant de le faire retaper.
- [ ] Sorties claires (français, une prochaine action, bruit retiré), « à revoir » tiré des prédictions, mise à niveau automatique d'un projet en retard, journaux de friction clos.

Exclus :

- [ ] Rendre la triche impossible : `progress.json` reste éditable par l'IA (elle construit le plan) ; on détecte et on montre, on ne verrouille pas.
- [ ] Alléger `AGENTS.md` (33 Ko) : fait avec le mécanisme `references/` de la story 10-01.
- [ ] Parcours démo, plan de séance, portfolio : couverts ou à rediscuter avec l'epic 10 (profil, bilan).
- [ ] Les 6 parcours dormants de `tech-experiments` (0 phase, pas de dépôt git) : décision de l'apprenant ; l'analyse de pertinence de 10-06 vise ce cas.

## Backbone

Backbone: `npm test` du mainteneur → `init` (scaffold) → l'apprenant tape → l'IA relit et note (norme) → `verify` (preuve) → ledgers cross-projet → revisite → `status` / `next`

L'ordre des stories suit l'urgence plutôt que le parcours : `s1` arrête une corruption de données réelles à chaque `npm test`. Les stories partagent `verify.js`, `check.js`, `guard.js`, `status.js` et `next.js` : **exécuter en séquence** (ordre numérique). Pas d'arbre : c'est une chaîne.

## Stories

1. **story-09-01-ledgers-propres**
2. **story-09-02-checkpoint-honnete**
3. **story-09-03-garde-fou-sans-angle-mort**
4. **story-09-04-scaffold-au-bon-endroit**
5. **story-09-05-norme-a-la-relecture**
6. **story-09-06-revisite-de-memoire**
7. **story-09-07-sorties-claires-et-dogfood-clos**

## Context Strategy

- Mode par défaut : `STANDARD` ; `s1`, `s2`, `s3`, `s6` sont `STRICT` (écriture dans `~/.ai-learn` réel ; verdict de preuve ; frontière du garde-fou ; retrait de code dans `src/**` de l'apprenant).
- Scout pre-step : aucun — fichiers et ancres nommés dans chaque story.
- Modèles à calquer : `mutate.js` (backup, verrou, `recoverOrphanLock`) pour `s6` ; `PROTECTED_FILES` de `guard.js` pour `s3` ; `tracks/*.js` (`home` injectable) pour `s1`.
- Preuves de terrain : chaque story qui touche un constat Fastify le rejoue sur une **copie** du projet (`tar --exclude=node_modules`), jamais sur l'original.

## Décisions de l'epic

- **Avant l'epic 10.** `10-04`/`10-05` (incidents) s'appuient sur `verify`, le garde-fou, les ledgers et un moteur de retrait/restauration : `s6` fournit ce moteur, que `10-04` réutilise au lieu d'en écrire un second. Une ligne de dépendance est ajoutée à l'index de l'epic 10.
- **Détecter plutôt que verrouiller `progress.json`.** L'IA doit pouvoir faire évoluer le plan ; le verrou bloquerait `/learn`. La preuve enregistre ce qu'elle a testé, et tout écart devient visible.
- **Filet de sécurité dans le code de production** (`s1`) : sous le lanceur de tests (`NODE_TEST_CONTEXT`), aucun ledger n'est écrit dans le vrai home (`os.userInfo().homedir`, indépendant de `HOME`). Un test qui pollue échoue au lieu de corrompre.
- **Revenir sur une décision de la story 01-x** (`s7`) : les prédictions manquantes des phases `pending` ne sont plus des avertissements. Sur le seul projet réel, 5 avertissements sur 7 étaient de ce type ; un avertissement permanent apprend à ignorer `check`.
- **Clore = statut écrit, pas seulement code livré.** Une entrée est close quand le journal du projet porte sa résolution (story citée) et que `DOGFOODING.md` la reprend, après rejeu sur une copie.

## Clarification Readiness

ready — le périmètre vient de l'audit reproduit et des journaux de friction ; l'utilisateur a demandé de tout couvrir. Inconnues : (a) l'orphelin de serveur en arrière-plan n'a pas pu être reproduit (commande refusée) — `s2` commence par le reproduire et le retire s'il ne se produit pas ; (b) `PostToolUse` sur `Read` dans Claude Code — `s5` le vérifie dans la doc avant de coder, repli décrit.
