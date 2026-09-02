# Architecture — ai-learn

## Forme générale

Point d'entrée mince + un module par commande. Aucune dépendance externe.

```
bin/ai-learn.js          dispatch d'arguments, uncaughtException, self-heal plateforme
bin/lib/
  util.js                I/O, UsageError, findLearningProjects        (feuille, 0 require interne)
  context.js             résolution de --dir                          (feuille)
  progress.js            ledger progress.json + latestEvidenceForPhase + phaseVerdict (feuille)
  source-hash.js         empreinte sha256 du code prouvé (checkpointFilePath, computeSourceHash)
  verify.js              LA commande d'écriture : exécute, prouve, marque done
  check.js               LE scanner : croise le ledger contre la réalité
  status.js / next.js    lecture seule
  scan.js                moteur de détection (walkSources, detectStack, detectConcepts, detectTests)
  norm.js                norme clean-code heuristique (blocage dur)
  guard.js               hook PreToolUse + câblage (.ai-learn/guard.json, .claude/settings.json)
  traps.js / docs.js     banque de pièges, sources de doc embarquées
  init.js / update.js    scaffolding et propagation du protocole
  propose.js / upgrade.js / install.js / dogfood.js / git-hooks.js
  tracks/git.js          ledger cross-projet ~/.ai-learn/tracks/git.json (6 tiers)
  tracks/domain.js       ledger cross-projet ~/.ai-learn/domains/<stack>.json
  stacks/*.js            packs par langage : concepts, directions, recipes, stresses, norm
  platforms/*.js         adaptateurs des 5 plateformes + détection + self-heal
templates/               AGENTS-apprentissage.md, plan, predictions, dogfood, commit-msg
commands/                les 7 commandes /… (markdown, format Claude Code)
```

## Invariants structurels

1. **`verify` a le monopole du `done`.** Aucun autre module n'écrit `status: "done"`.
   `setPhaseStatus` n'est appelé que depuis `verify.js`.
2. **Une évidence est écrite à chaque run**, succès *et* échec (`.ai-learn/runs/`).
   Conséquence exploitable : l'ordre rouge→vert d'une phase est déjà sur disque.
3. **`check` ne fait jamais confiance** : il relit les fichiers et recoupe.
   Seules les `issues.errors` font `exit 1` ; les `warnings` informent.
4. **Les ledgers home-scoped prennent `home` en injection** (`{ home = os.homedir() }`)
   — c'est ce qui les rend testables sans toucher au vrai `$HOME`.
   Pattern d'origine : `install.js#installCommand`, repris par `tracks/git.js`.
5. **Les synchronisations de ledger sont best-effort**, chacune dans son propre
   `try/catch` : elles ne doivent jamais faire échouer `verify`.
6. **Toute heuristique résout vers « ne pas bloquer ».** Un faux négatif est
   toujours préférable à un faux positif — `norm.js`, `scan.js`, `guard.js` le
   documentent explicitement. Un mécanisme qui bloque dur ne peut pas se permettre
   d'avoir tort.
7. **Le guard fail-open.** Stdin vide, JSON illisible, outil inconnu, config
   absente ⇒ allow. Un guard cassé ne doit pas casser une session.
8. **Rien n'est destructif.** `init` ne réécrit jamais un fichier existant ;
   `update` ne réécrit qu'un fichier *généré*, reconnu par son marqueur de titre.

## Couplages à connaître avant de toucher

- `norm.js` importe `scan.js` (`walkSources`, `detectStack`, `detectTests`,
  `loadStack`) **et** `guard.js` (`loadGuardConfig`, `matchesLearnerPath`).
  Le périmètre de la norme est donc défini par `learnerFiles` du guard.
- `latestEvidenceForPhase` vit dans `progress.js` (une feuille) et non dans
  `status.js` : `status.js` → `tracks/domain.js` → `scan.js` créerait un cycle.
  **Ne pas déplacer cette fonction.** Même contrainte pour `phaseVerdict`,
  ajoutée à côté : c'est une fonction pure (faits passés en arguments par
  l'appelant), donc elle n'a pas besoin d'importer `scan.js`/`guard.js` — ce
  qui l'aurait forcée hors de `progress.js`.
- `source-hash.js` calcule l'empreinte du code qu'une preuve couvre
  (`checkpointFilePath`, `computeSourceHash`) ; il importe `scan.js` et
  `guard.js` et vit donc en dehors de `progress.js` pour la même raison que
  ci-dessus. Le hash porte sur les octets bruts des fichiers, jamais sur un
  contenu normalisé (CRLF/LF inclus) — décision verrouillée, voir
  `epics/epic-01-verdict-fiable/story-01-01-trois-etats-du-verdict/plan.md`.
- `check.js` importe `norm.js`, `docs.js`, `git-hooks.js`, `dogfood.js`,
  `platforms/codex-guard.js` — c'est le module le plus couplé (692 lignes).
- `verify.js` importe `norm.js`, `tracks/git.js`, `tracks/domain.js`.

## Ce que le guard ne voit pas

Le hook n'intercepte que les appels Bash de **l'agent**. Les `spawnSync("git", …)`
internes d'`ai-learn` (`scan.js`, `docs.js`, `check.js`, `tracks/git.js`) ne passent
jamais par lui — c'est voulu et documenté dans `guard.js#detectGitOrGh`.

## Portabilité

- Chemins normalisés via `normalizePortable` (backslash → slash) partout où un
  chemin est écrit dans un fichier de données ou comparé à un glob.
- `install claude` bascule automatiquement du symlink vers la copie de fichier
  quand l'OS refuse (`EPERM` Windows sans Developer Mode).
- `verify` lance le checkpoint avec `shell: true` — la commande est celle du
  `progress.json`, telle quelle, depuis la racine du projet.
