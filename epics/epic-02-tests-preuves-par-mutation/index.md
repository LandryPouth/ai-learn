# Epic 02 — Les tests de l'apprenant sont prouvés par mutation

## Goal

Faire en sorte qu'un test écrit par l'apprenant ne puisse plus mentir : `assert(true)`
doit être détecté comme une preuve vide, parce que rien d'autre qu'un mutant
réellement tué ne fait la différence entre un test qui protège et un test qui ne
protège rien.

## Business Value

L'argument de l'outil (epic 01) est que la preuve prime sur la déclaration — mais
cette preuve n'est aujourd'hui que « le test que l'apprenant a écrit est passé ».
Si l'apprenant écrit le test, il écrit aussi la preuve, et rien ne l'empêche
d'écrire une preuve qui ne prouve rien. La mutation est la seule sortie mécanique
connue de ce problème : casser le code d'une façon précise et vérifier que le test
s'en aperçoit. Sans elle, la feature ne devrait pas exister — c'est écrit noir sur
blanc dans `docs/roadmap.md`.

Cet epic **dépend de l'epic 01** : la section `mutation` de l'évidence et le
blocage dur dans `verify` s'appuient sur le modèle d'états et l'empreinte de code
posés par les stories 01-01/01-02 — sans eux, on ne pourrait pas distinguer une
mutation prouvée d'une mutation basée sur du code qui a déjà changé.

## Scope

Inclus :

- [ ] `ai-learn mutate` de bout en bout : un opérateur, un mutant, isolation
      in-place + backup + restauration prouvée, rapport `fichier:ligne — opérateur
      — SURVÉCU/TUÉ`, exit 1 si un mutant survit.
- [ ] Une banque d'opérateurs de mutation par stack pack (`bin/lib/stacks/*.js`),
      câblée par `init`/`update` via `.ai-learn/mutate.json`.
- [ ] Blocage dur dans `verify` (champ de phase `mutation`) + section `mutation`
      dans l'évidence, symétrique de `norm` et `predictions`.
- [ ] Audit projet dans `check` + résumé dans `status`.
- [ ] Ledger cross-projet `~/.ai-learn/tracks/tests.json`, 6 tiers, calqué sur
      `tracks/git.js` — le tier « rouge d'abord » lu depuis des évidences déjà
      sur disque, jamais déclaré.
- [ ] Protocole : `AGENTS-apprentissage.md` §3quinquies (prédire *quel test doit
      tomber*), `commands/learn.md`, `checkpoint/README.md`, README.

Exclus :

- [ ] Le mode dirigeant et l'inversion du guard (`learnerFiles` sur `test/**`) —
      epic 03, qui dépend entièrement de celui-ci.
- [ ] Toute réécriture de `scan.js`, `docs.js`, `propose.js`, `traps.js`, `guard.js`
      (moteur de décision).
- [ ] Mutation testing sur les fichiers hors du périmètre `learnerFiles`
      (`guard.json`, `test/**`, `checkpoint/**`) — la mutation ne teste jamais le
      code que l'apprenant n'a pas écrit.
- [ ] Mutation parallèle / multi-mutants simultanés — hors scope v1, voir Risks.
- [ ] Toute migration destructive d'un projet existant sans `.ai-learn/mutate.json`
      (même discipline rétro-compatible que l'epic 01).

## Backbone

Journey : l'apprenant écrit un test → `ai-learn mutate` casse son code d'une façon
précise → le test doit tomber, sinon le mutant a survécu et le trou est visible →
la banque d'opérateurs s'étend par stack pour couvrir plus de code → `verify`
exige que la mutation passe avant de marquer une phase prouvée → `check`/`status`
en rendent compte au quotidien → un ledger cross-projet mémorise que le « rouge
d'abord » a été observé, pas déclaré → le protocole apprend à l'apprenant à
prédire quel test doit tomber avant de le voir tomber.

```text
s1
└── s2
    ├── s3
    │   ├── s4
    │   └── s5
    └── s6
```

`s1` est le squelette de bout en bout (un seul opérateur, en dur). `s2` généralise
cet opérateur en banque par stack et introduit la config — tout ce qui suit en
dépend. `s3` (blocage `verify`) et `s6` (protocole/docs) partent tous deux de `s2`
et sont disjoints entre eux (`s3` touche `bin/lib/verify.js` et l'évidence ; `s6`
touche `templates/**`, `commands/learn.md`, `README.md`) — exécutables en
parallèle, chacun dans son propre worktree. `s4` (audit `check`/`status`) et `s5`
(ledger `tests.json`) dépendent tous deux de la forme de `evidence.mutation` posée
par `s3`, et sont disjoints entre eux (`s4` touche `check.js`/`status.js`, `s5`
touche `bin/lib/tracks/tests.js`) — également parallélisables une fois `s3` fusionné.

## Stories

1. **story-02-01-mutation-de-bout-en-bout**
2. **story-02-02-banque-operateurs-par-stack**
3. **story-02-03-verify-exige-mutation**
4. **story-02-04-audit-mutation-check-status**
5. **story-02-05-ledger-tests-cross-projet**
6. **story-02-06-protocole-mutation**

## Context Strategy

- Mode d'exécution par défaut : `STANDARD`
- Scout pre-step nécessaire : aucun. Le moteur miroir (`norm.js`) et les points
  d'intégration (`verify.js`, `check.js`, `status.js`, `init.js`/`update.js`,
  `tracks/git.js`) sont déjà identifiés et nommés story par story ci-dessous.
- Ancres de recherche partagées : `walkSources`, `detectStack`, `loadStack`,
  `stackKey`, `matchesLearnerPath`, `loadGuardConfig`, `stripStringsAndComments`,
  `runCommand`, `computeSourceHash`, `checkpointFilePath`, `ensureNormConfig`,
  `syncGitTrack`, `phaseVerdict`
- Zones à ne pas toucher : `scan.js` (moteur de détection, consommé sans être
  modifié), `docs.js`, `traps.js`, `propose.js`, `platforms/**`, `guard.js`
  (décision d'accès — la mutation lit `learnerFiles`, ne redéfinit jamais ce
  qu'est un fichier d'apprenant).

## Architecture Impact

Introduit un **sous-système de mutation testing**, construit sur le même gabarit
que `norm.js` (moteur heuristique zéro-dépendance, config projet auto-créée,
scan scopé par `learnerFiles`, commande CLI autonome) :

- `bin/lib/mutate.js` — le moteur : détection des sites mutables, application
  d'un mutant, isolation (backup + restauration garantie), exécution du test,
  rapport.
- `bin/lib/stacks/*.js` gagne un champ `mutators`, symétrique du champ `norm`
  déjà présent dans chaque pack.
- `.ai-learn/mutate.json` — config projet, auto-créée une fois par `init`/`update`
  exactement comme `.ai-learn/norm.json` (`ensureMutateConfig`, jamais réécrite
  une fois présente).
- `bin/lib/verify.js` gagne une section `mutation` dans l'évidence, calculée
  inconditionnellement à côté de `norm` et `predictions`.
- `bin/lib/tracks/tests.js` — nouveau ledger cross-projet home-scopé, même
  schéma versionné/validé que `tracks/git.js` (6 tiers, `TIER_IDS`, injection de
  `home` pour la testabilité).

Deux invariants de l'epic 01 sont préservés sans exception :

- `verify` garde le monopole de l'écriture de `done` — la mutation est un
  blocage de plus dans le calcul de `ok`, jamais un nouvel appelant de
  `setPhaseStatus`.
- Le périmètre de la mutation est exactement `learnerFiles` (le même que
  `norm`/l'empreinte de code) — jamais un `src/**` en dur, jamais les fichiers de
  test ou de checkpoint eux-mêmes.

Un invariant **nouveau** à cet epic, plus strict que tout ce qui existe déjà :
**aucune commande de cet epic ne laisse jamais un fichier de l'apprenant mutant
sur disque**, y compris en cas d'échec du process. C'est ce qui rend
« in-place + backup + restauration » sûr à recommander à un débutant qui ne fait
pas de `git status` réflexe avant chaque commande.

## Testing Strategy

- Unitaire : chaque opérateur de mutation (table de cas : code source →
  mutant attendu, position exacte, réversibilité bit-à-bit après restauration).
- Unitaire : la restauration est garantie même quand le test lancé sur le mutant
  lève une exception ou dépasse le timeout (simulateur de commande qui throw).
- Intégration : `mutate` sur un projet temporaire avec un test volontairement
  faible (le mutant survit, exit 1) et un test volontairement fort (le mutant est
  tué, exit 0) — même socle `test/helpers.js#tmpProject` que l'epic 01.
- Non-régression : la suite existante (~350+ tests après l'epic 01) passe sans
  modification, sauf changement justifié dans le `## Result` de la story qui le
  fait.
- Portabilité : même discipline que `computeSourceHash` — chemins normalisés
  (`normalizePortable`), pas de dépendance à l'ordre de lecture du répertoire.

## Risks

- Risque : un `kill -9` (ou un crash du process Node) pendant la fenêtre où le
  mutant est en place laisse le fichier de l'apprenant mutant sur disque.
  Mitigation : décision verrouillée (`docs/roadmap.md`) — risque résiduel assumé,
  réparé mécaniquement par le *prochain* `ai-learn mutate`, qui détecte un
  fichier de backup orphelin au démarrage et le restaure avant de continuer.
  Documenté explicitement dans le README, jamais silencieux.
- Risque : la mutation devient lente si chaque mutant relance la suite de tests
  complète du projet. Mitigation : v1 mute et teste **un fichier de checkpoint à
  la fois** (`--phase <id>`, réutilise `phase.checkpoint` comme test tueur — même
  périmètre que `verify`), jamais l'ensemble du projet en une passe.
- Risque : un opérateur naïf mute l'intérieur d'une chaîne ou d'un commentaire et
  produit un mutant qui n'a aucun sens. Mitigation : réutiliser
  `norm.js#stripStringsAndComments`, déjà éprouvé, plutôt que réécrire une
  détection de chaînes/commentaires.
- Risque : une stack sans opérateur dédié (pack `generic.js`) bloque `verify` sur
  un projet qui n'a simplement rien à muter. Mitigation : « aucun site mutable
  trouvé » est un succès (`ok: true`, mutants: 0), jamais un blocage — même
  discipline rétro-compatible que `predictionsReport` (epic 01, story 01-04) :
  l'absence de matière ne doit jamais se travestir en échec.
- Risque : bloquer `verify` sur la mutation avant que la banque d'opérateurs soit
  assez large punit des phases légitimes qui n'ont simplement pas assez de code
  mutable. Mitigation : le blocage (`s3`) n'arrive qu'après la banque par stack
  (`s2`), jamais avant, et un mutant non trouvé reste un succès (voir ci-dessus).

## Decisions

- Décision : isolation in-place + backup + restauration (jamais de copie du
  projet entier dans un répertoire temporaire).
  - Raison : décision verrouillée le 2026-09-01 (`docs/roadmap.md`) —
    `phase.checkpoint` marche sans adaptation, il tourne déjà dans `dir` via
    `runCommand`/`spawnSync`, sans dépendre d'un chemin absolu vers un clone.
  - Conséquence : le risque résiduel `kill -9` (fichier mutant laissé sur
    disque) est assumé et réparé au run suivant, jamais masqué.
- Décision : le test tueur d'un mutant est `phase.checkpoint` de la phase ciblée
  (`ai-learn mutate --phase <id>`) — pas un nouveau champ de config
  `testCommand`.
  - Raison : `phase.checkpoint` est déjà le contrat de preuve exécutée de tout
    l'outil (`verify.js#runCommand`) ; dupliquer ce concept dans un second champ
    créerait deux sources de vérité pour « comment tester ce code ».
  - Conséquence : `ai-learn mutate` exige une phase déclarée avec un checkpoint,
    exactement comme `verify` — même message d'erreur, même discipline.
- Décision : le périmètre mutable est `learnerFiles`, identique à `norm` et à
  l'empreinte de code de l'epic 01 — jamais un glob dédié à la mutation.
  - Raison : trois définitions différentes de « le code de l'apprenant »
    (guard, norm, mutation) divergeraient inévitablement avec le temps.
  - Conséquence : un projet avec un `learnerFiles` personnalisé (`.ai-learn/guard.json`)
    voit ce périmètre respecté partout sans configuration supplémentaire.
- Décision : un mutant à la fois, jamais deux mutations simultanées sur le même
  fichier.
  - Raison : deux mutants concurrents sur un fichier corrompraient mutuellement
    leur backup/restauration — la sécurité de la restauration dépend d'un ordre
    strict (backup → mute → test → restore) sans chevauchement.
  - Conséquence : le temps d'exécution de `mutate` croît linéairement avec le
    nombre de sites mutables ; acceptable pour la taille d'un projet
    d'apprentissage, documenté comme limite v1 si un projet grossit beaucoup.

## Clarification Readiness

`ready` — les quatre décisions ci-dessus (isolation, test tueur, périmètre,
séquentialité) referment les seules ambiguïtés qui auraient changé
l'implémentation des stories. Aucune n'était mentionnée par
`docs/roadmap.md` au-delà de l'isolation (déjà verrouillée) ; les trois autres
sont tranchées ici parce qu'elles découlent directement de contraintes déjà
posées par l'epic 01 (`phase.checkpoint`, `learnerFiles`) plutôt que de choix
arbitraires — aucune question ouverte restante ne changerait l'implémentation.
