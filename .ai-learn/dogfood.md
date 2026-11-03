# Journal de friction — `ai-learn`

> Dès que `ai-learn` (pas le projet appris, l'outil lui-même) coûte plus qu'il
> ne rapporte, ça s'écrit ici. Pas un rapport de bug exhaustif — **la
> friction** : erreur, message confus, checkpoint qui semble se tromper,
> commande qui échoue sans raison claire.

## Pourquoi ce fichier

Ce journal appartient à ce projet, pas au dépôt `ai-learn`. Le mainteneur ne
voit jamais ce qui se passe chez un apprenant sans qu'il l'envoie — pas
d'upload automatique. Sur demande explicite, envoyer ce fichier permet de
corréler un incident réel à une version précise de l'outil et d'orienter les
correctifs.

Le signal à guetter n'est pas seulement un crash. C'est aussi la pensée
*« ai-learn me fait perdre mon temps »* — plus grave qu'une fonctionnalité
manquante, parce qu'au bout de ce chemin il y a un apprenant qui contourne ou
éteint l'outil.

## Comment enregistrer une entrée

Une entrée par incident, la plus récente en premier. Court ; l'IA l'écrit
**immédiatement** quand ça arrive, avant de contourner ou d'improviser
(cf. `AGENTS.md`).

```md
### <low|medium|high> — <titre court>
- Plateforme : <claude-code|codex|gemini-cli|opencode|antigravity|cli-nu|autre>
- Surface : <commande|hook-guard|skill|config|init|status|next|verify|check|scan|propose|docs|traps|progress.json>
- Attendu vs réel : <ce qui aurait dû se charger/se déclencher automatiquement, et ce que l'IA a dû faire à la place>
- Problème : <ce qui s'est réellement passé, en une phrase>
- Workaround : <ce qui a permis d'avancer ; "aucun, bloqué" est une réponse valide>
- Version de l'outil : <sortie de `ai-learn --version`>
```

Sévérité : `low` (agace) · `medium` (coûte du temps) · `high` (aucun
contournement légitime, ou verdict faux).

**Cas à toujours logger, même s'il se résout tout seul** : une commande `/…`,
un hook (guard), un skill ou une config (`.codex/config.toml`,
`.claude/settings.json`, `.gemini/commands/`, `.opencode/command/…`) qui
aurait dû se charger ou s'activer automatiquement mais ne l'a pas fait, au
point que l'IA a dû lire un fichier `.md` ou la doc source pour comprendre
quoi faire à la main. Ce cas pointe précisément vers un bug d'intégration
plateforme — le champ **Attendu vs réel** doit nommer le mécanisme qui a
manqué, pas juste dire « ça n'a pas marché ».

## Entrées

<!-- Nouvelle entrée en haut, sous cette ligne. -->

### medium — `break` ne casse qu'avec des mutants syntaxiques, jamais comme une vraie panne
- Statut : planifié le 2026-11-03 (stories 11.02 et 11.03), pas encore implémenté
- Projet : tech-experiments (fil diagnostic, ajouté le 2026-11-03)
- Plateforme : claude-code (gap côté outil, indépendant de la plateforme)
- Surface : commande (`ai-learn break`) / packs `bin/lib/stacks/*.js`
- Attendu vs réel : un incident devrait ressembler à une panne de production. Réel : le pack `javascript.js` n'a que deux opérateurs (`boolean-literal`, `comparison-operator`), appliqués à du code que l'apprenant vient de taper ; le symptôme est toujours la sortie d'un checkpoint (niveaux 1-2) ou une panne d'environnement (niveau 3).
- Problème : on n'entraîne ni les pannes sémantiques (`await` oublié, `catch` qui avale l'erreur, client de pool jamais rendu, retry sans backoff, borne de pagination décalée, clé de cache incomplète, fuseau horaire), ni la lecture d'un symptôme de production (extrait de log, événement façon Sentry, alerte, p95 qui monte).
- Proposition : une banque de pannes sémantiques par pack (gabarits AST ou recherche/remplacement ciblé, même secret hors projet que les mutants) + un niveau où le symptôme est un artefact de prod généré (log JSON, pile, alerte) au lieu de la sortie du test. Premier consommateur : `prodready-api` phase 13 (aujourd'hui simulé par un script d'incident fourni au projet).
- Workaround : les plans de `prodready-api` (13) et `tradelog` (9) font poser ces pannes par un script de support, dont l'IA connaît la réponse : moins étanche que `break`.
- Version de l'outil : 0.6.4

### medium — Aucun entraînement à relire du code produit par l'IA
- Statut : planifié le 2026-11-03 (stories 12.03 et 12.04), pas encore implémenté
- Projet : tech-experiments (fil diagnostic, 2026-11-03)
- Plateforme : claude-code
- Surface : commande (proposition : `ai-learn review`)
- Attendu vs réel : la compétence n°1 avec l'IA est de relire un diff plausible et d'y trouver ce qui est faux. Réel : seul le mode `dirigeant` fait juger du code IA (revue sourcée `docs/reviews/`), et il est verrouillé derrière les tiers tests 1-3 ; rien ne mesure ce que la revue a **manqué**.
- Proposition : `ai-learn review` — l'IA écrit hors de `src/**` (ex. `katas/<nom>/`) une modification plausible contenant N défauts (sécurité, concurrence, gestion d'erreur, cas limite) ; la liste des défauts part dans `~/.ai-learn/` comme le secret de `break`, fermée à l'IA tutrice ; l'apprenant enregistre sa revue (`fichier:ligne` + raison) avant révélation ; score = défauts trouvés / N, faux positifs comptés ; nouveau ledger ou tiers dans `tracks/debug.json`.
- Difficulté : l'IA qui écrit le kata connaît les défauts. Il faut une génération par un agent séparé (ou une banque de katas versionnée dans l'outil) pour que l'IA tutrice ne fuite pas la réponse.
- Workaround : aucun.
- Version de l'outil : 0.6.4

### low — `git bisect` absent des paliers git
- Statut : planifié le 2026-11-03 (story 11.04), pas encore implémenté
- Projet : tech-experiments (fil diagnostic, 2026-11-03)
- Plateforme : claude-code
- Surface : ledger `tracks/git.json` / `break`
- Attendu vs réel : retrouver le commit qui a introduit une régression (`git bisect run` avec le checkpoint comme juge) est un geste de diagnostic courant. Aucun palier ne l'exige, et l'IA ne peut pas préparer l'historique piégé (guard git dans le projet).
- Proposition : un incident « régression dans l'historique » : l'outil crée lui-même, sur une branche jetable, N commits dont un introduit la panne (secret hors projet) ; palier git 7 atteint quand `bisect` désigne le bon commit. Premier consommateur : `prodready-api` (plan, section Fil diagnostic).
- Workaround : noté « en attente » dans le plan de `prodready-api`.
- Version de l'outil : 0.6.4

### low — Le protocole « second avis IA » vit dans les plans, pas dans le modèle d'AGENTS.md
- Statut : planifié le 2026-11-03 (story 11.01), pas encore implémenté
- Projet : tech-experiments (fil diagnostic, 2026-11-03)
- Plateforme : toutes
- Surface : template `AGENTS.md` (§3sexies) / `ai-learn update`
- Attendu vs réel : pour un diagnostic, l'apprenant pose son hypothèse, puis l'IA reçoit les mêmes preuves seulement, puis on compare (dont « cause plausible mais fausse donnée par l'IA »). Réel : écrit dans le README racine de tech-experiments et dans chaque plan, car un `AGENTS.md` généré est écrasé par `ai-learn update --root`.
- Proposition : l'ajouter à §3sexies du template (étape 5 après `--resolve`), et un champ dans `predict --reveal` pour tracer le verdict de l'IA (juste / plausible mais faux / à côté), agrégé dans `tracks/debug.json`.
- Workaround : protocole recopié dans les plans (section « Fil diagnostic ») et dans `fastify-traducteur-api` phase 9.
- Version de l'outil : 0.6.4

### low — Pas de type de prédiction ni de palier pour la lecture de code d'un autre
- Statut : planifié le 2026-11-03 (stories 12.01 et 12.02), pas encore implémenté
- Projet : tech-experiments (fil diagnostic, 2026-11-03)
- Plateforme : toutes
- Surface : `predict --type` / ledgers
- Attendu vs réel : les plans exigent maintenant des « cartes du code » (Node, Fastify, Nest, `pg-boss`, Prometheus) : prédire où vit un mécanisme dans une base inconnue, puis le trouver. Seul l'artefact est vérifié (présence du fichier).
- Proposition : `predict --type lecture --file <chemin> --line <n>` comparé à l'emplacement réel (même tolérance que `break`), et `check` qui vérifie que chaque `fichier:ligne` cité dans `docs/carte-du-code*.md` existe dans la source déclarée.
- Workaround : artefacts `docs/carte-du-code*.md` exigés par `progress.json` (wire-ts 5, framework-ts 9, prodready-api 14, telemetry-go 4).
- Version de l'outil : 0.6.4

### high — Un refus du guard rend toutes les preuves stale
- Projet : **coding-flow** (détecté depuis le guard d'`ai-learn`)
- Plateforme : opencode
- Surface : status / next / verify / audit
- Attendu vs réel : un refus du guard doit rester local au geste refusé ; `ai-flow status` doit continuer d'afficher les preuves vertes.
- Problème : `.ai-learn/guard.log` (untracked, non gitignoré) entre dans `untrackedDigest` de coding-flow ; chaque refus fait passer les 6 histoires en `proof is stale` et `audit --check` en exit 1, alors que rien n'a changé dans le code.
- Workaround : déplacer `.ai-learn/guard.log` hors du dépôt (les preuves repassent vertes) ; à défaut, l'ajouter à `.gitignore`.
- Version de l'outil : ai-learn 0.4.0 · coding-flow 0.14.0

### high — Verdict faux sur collision d'horodatage ou horloge inversée
- Projet : **coding-flow**
- Plateforme : opencode
- Surface : verify / status / next / track tests
- Attendu vs réel : la preuve la plus récente doit être sélectionnée par `generatedAt`, pas par le nom du fichier.
- Problème : `findEvidence` trie les noms lexicographiquement ; à la même milliseconde le suffixe `-1-` trie avant le nom de base, donc un run vert tardif est lu comme antérieur. Quand l'horloge recule (observé : `durationMs: -2242 ms`), le rouge le plus récent est ignoré. Conséquence : tier 3 « rouge d'abord » raté et `test/verify.test.js:819` flaky.
- Workaround : aucun côté CLI — relancer jusqu'à obtenir un ordre favorable.
- Version de l'outil : ai-learn 0.4.0 · coding-flow 0.14.0

### high — `ai-flow plugin check` échoue sur toute install npm
- Projet : **coding-flow**
- Plateforme : cli-nu
- Surface : plugin check
- Attendu vs réel : `plugin check` doit passer sur le paquet installé via npm/npx.
- Problème : `package.json#files` exclut `skills/`, mais `bin/lib/plugin.js:21-23` le cherche dans `packageRoot/skills` → 7 skills « missing », exit 1. Passe uniquement dans le cache plugin (qui contient `skills/`).
- Workaround : exécuter depuis le dépôt ou le cache plugin.
- Version de l'outil : ai-learn 0.4.0 · coding-flow 0.14.0

### medium — `audit --check` bloqué par une preuve repo-scope irrafraîchissable
- Projet : **coding-flow**
- Plateforme : opencode
- Surface : audit / verify
- Attendu vs réel : une preuve repo-scope ne doit pas gater `--check` si aucun verify d'histoire ne peut la rafraîchir.
- Problème : `ai-flow verify` sans `--story` écrit une preuve globale ; les `verify --story` ne la rafraîchissent jamais. Dès que le tree bouge, `audit --check` reste rouge avec « (repo): verified at …, no longer matches the working tree ».
- Workaround : relancer `ai-flow verify` sans `--story` juste avant le gate.
- Version de l'outil : ai-learn 0.4.0 · coding-flow 0.14.0

### medium — `ai-flow worktree list --json` ignore `--json`
- Projet : **coding-flow**
- Plateforme : cli-nu
- Surface : worktree
- Attendu vs réel : sortie JSON parsable ; réel : tableau texte.
- Problème : le flag est accepté mais jamais lu par la commande.
- Workaround : parser le tableau texte.
- Version de l'outil : ai-learn 0.4.0 · coding-flow 0.14.0

### medium — Hook guard épinglé à 0.10.0 alors que 0.14.0 est installé
- Projet : **coding-flow**
- Plateforme : claude-code
- Surface : config / hook-guard
- Attendu vs réel : le hook doit exécuter la version installée (0.14.0).
- Problème : `doctor`/`doctor --strict` signalent `guard_hook_stale` (exit 0) ; `.claude/settings.json:9` exécute encore le guard 0.10.0, donc les protections récentes ne s'appliquent pas.
- Workaround : `ai-flow upgrade`.
- Version de l'outil : ai-learn 0.4.0 · coding-flow 0.14.0

### medium — La suite de tests écrit dans le ledger global réel
- Projet : **ai-learn**
- Plateforme : cli-nu
- Surface : tracks / verify
- Attendu vs réel : `npm test` ne doit jamais toucher `$HOME`.
- Problème : ~83 appels `verifyCommand` sans `home` (dont `test/check.test.js:120`) → `~/.ai-learn/tracks/{tests,git}.json` se remplit de `/tmp/ai-learn-test-*` ; les tiers 1/2/6 sont faussement acquis (306 et 145 projets fantômes observés).
- Workaround : injecter un `home` temporaire dans tous les appels ; nettoyage manuel effectué.
- Version de l'outil : ai-learn 0.4.0 · coding-flow 0.14.0

### low — `worktree place --dry-run` refusé
- Projet : **coding-flow**
- Plateforme : cli-nu
- Surface : worktree
- Attendu vs réel : `--dry-run` est annoncé comme flag global ; `worktree place` répond « does not support --dry-run » (exit 1).
- Problème : incohérence de surface entre `add`/`remove`/`land` et `place`.
- Workaround : aucun, commande non exécutée.
- Version de l'outil : ai-learn 0.4.0 · coding-flow 0.14.0

### low — Fichiers de bruit du guard non gitignorés
- Projet : **coding-flow**
- Plateforme : opencode
- Surface : config / hook-guard
- Attendu vs réel : les journaux du guard ne doivent pas apparaître dans `git status`.
- Problème : `.coding-flow/denials.jsonl` et `.coding-flow/guard-unchecked.jsonl` sont untracked et non ignorés (contrairement à `.coding-flow/runs/`).
- Workaround : les ajouter à `.gitignore`.
- Version de l'outil : ai-learn 0.4.0 · coding-flow 0.14.0
