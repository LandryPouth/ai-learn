---
description: "Crée un nouveau parcours d'apprentissage (doc + questions + plan + progress.json)"
argument-hint: "[technology] [project]"
allowed-tools: ["Bash", "Read", "Glob", "Grep", "WebSearch", "Write", "Edit"]
---

# ai-learn: nouvelle session d'apprentissage

Tu démarres un nouveau parcours d'apprentissage pour l'utilisateur. But : un
parcours **prouvé**, pas un vague plan. Chaque phase aura un checkpoint exécutable,
un artefact de doc, et un nombre de prédictions exigées (protocole « prédire avant
de révéler »).

## 1. Collecter le contexte

Résous dans l'ordre, en posant des questions **une à la fois** si le renseignement
manque :

1. **La technologie** à apprendre (ex. Rust, React, PostgreSQL…). L'argument
   `$ARGUMENTS` peut la donner : premier mot.
2. **Le projet à construire** pour apprendre (ex. « une API de traduction »).
   L'argument `$ARGUMENTS` peut le donner : le reste.
3. Le niveau actuel et l'objectif (expert rapide ? solide de base ?).

## 2. Trouver la doc solide

La doc officielle prime. Cherche dans l'ordre :

- Une **doc officielle locale** déjà téléchargée (interroge l'utilisateur, ex.
  `~/dev/learning/<techno>/<techno>-main/docs`) — c'est la source la plus fiable.
- Sinon, la **doc officielle en ligne** de la techno (site officiel).
- En dernier recours, une source réputée (pas un blog au hasard).

Annote la source choisie — elle sera passée à `ai-learn init` (`--doc-source`).

## 3. Poser les questions de cadrage

Avant de générer le plan, pose les questions qui déterminent la progression
(2-4 questions max, une à la fois) :

- Que doit SAVOIR FAIRE l'apprenant à la fin (compétences attendues) ?
- Quelles briques du projet illustrent le mieux ces compétences ?
- Y a-t-il des techniques "standard du marché" incontournables (validation,
  tests, structure des dossiers, config) à intégrer dès le départ ?

## 4. Générer le plan de phases

Découpe en **6-10 phases** progressives, chacune avec :

- `id` (0..N), `name` (court, français)
- `status`: "pending" (tout sauf la première, qu'on peut laisser pending aussi)
- `checkpoint`: une commande qui **prouve** réellement l'apprentissage
  (ex. `node --test checkpoint/phase-N.test.mjs` — un test qui vérifie le
  comportement appris)
- `artifacts`: le doc de phase qui sera rédigé (ex. `docs/phase-N-<sujet>.md`)
- `predictionsRequired`: nombre de prédictions écrites exigées (2-3 par phase
  pour un protocole solide)

Séquence type API web (modèle à adapter à la techno choisie) : mise en route →
routes → validation d'entrée → architecture/modularité → persistance/IO →
logique métier → gestion des erreurs → config/tests → prod.

### Ne jamais noter une prédiction sur une techno support

`AGENTS-apprentissage.md` (posé par `init` dans le projet) dit explicitement
que les **technos support** (`tsconfig.json`, scripts npm, `docker-compose.yml`,
migrations SQL, scaffolding de config…) restent **libres** — hors protocole
« prédire avant de révéler ». `predictionsRequired` ne doit donc **jamais**
porter sur ce genre de détail, à aucune phase — et surtout pas à la Phase 0
(« mise en route »), avant que l'apprenant ait vu une ligne de la techno
visée : lui faire prédire du tooling hors-sujet dès sa toute première
évaluation notée contredit la règle du protocole et risque de démoraliser un
vrai débutant (« je suis venu pour X, on me demande Y »). Si la Phase 0 n'est
que du scaffold, mets `predictionsRequired: 0` pour elle — les prédictions
notées commencent dès que la techno principale ou un choix d'architecture
apparaît réellement.

### Ne jamais réapprendre un concept déjà maîtrisé ailleurs

Avant de générer les phases, regarde si un ledger de domaine existe déjà pour
la techno réelle du projet (`~/.ai-learn/domains/<stack>.json`, où `<stack>`
est déduit du code — javascript, c, python… — pas du libellé libre que tu
donnes à `--technology`). Simple lecture de fichier, jamais bloquée.

- S'il existe : **ne génère aucune phase sur un concept déjà `achieved`**
  dans ce ledger — c'est l'invariant de non-régression déjà appliqué par
  `/scan` à l'intérieur d'un projet, étendu ici à travers plusieurs projets.
  Démarre directement au-dessus du tier le plus haut déjà prouvé.
- C'est ce qui rend « quelques projets suffisent pour devenir expert »
  mesurable plutôt que déclaratif : `ai-learn status` affichera la couverture
  réelle (concepts atteints / banque du stack) une fois les phases vérifiées.
- Le ledger se met à jour tout seul à chaque `ai-learn verify` réussi — rien
  à écrire ici, seulement à le **lire** avant de planifier.

### Intégrer une casse réelle (1 à 2 phases max)

Avant de finaliser le plan, appelle `ai-learn scan --dir <projet>` (ou relis
`.ai-learn/scan.json` s'il est déjà à jour) : la section `stresses` du rapport
liste les stress éligibles de la banque du stack (10x taille d'entrée, entrée
malformée, invocation concurrente, 10x connexions…), déjà filtrés par le même
principe de non-régression que les directions (jamais un stress déjà maîtrisé,
jamais un pas en arrière).

- Choisis **1 à 2 stress maximum** et tague la phase correspondante avec
  `"stressCheckpoint": "<commande>"` dans `progress.json`, en plus du
  `checkpoint` habituel — jamais transformer tout le parcours en stress-test.
- Le `stressCheckpoint` doit **appliquer la charge/l'entrée/la concurrence
  pour de vrai** (ex. un script qui envoie N requêtes concurrentes, qui rejoue
  un fichier 10x plus gros, ou une entrée délibérément malformée) — voir le
  champ `stressCheckpoint` de l'entrée choisie dans le rapport pour la forme
  attendue. Il doit échouer avant le fix, passer après.
- Sur ces phases, le protocole de prédiction gagne une étape avant la
  révélation (« prédire la casse ») — voir `AGENTS.md` §3ter pour le
  déroulé complet.
- `ai-learn verify <id>` exige que **`checkpoint` et `stressCheckpoint`
  passent tous les deux** avant de marquer la phase `done` — rien à faire de
  spécial, c'est automatique dès que le champ est renseigné.

### Intégrer le module git/gh (1 à 2 phases max)

Avant de finaliser le plan, lis `~/.ai-learn/tracks/git.json` (simple lecture
de fichier avec l'outil `Read` — jamais bloquée : seules les **commandes**
git/gh le sont, pas la lecture d'un JSON) pour voir quels tiers de la banque
git/gh (1-6, voir `AGENTS.md` §3) manquent encore, **tous projets confondus**.

- Choisis **1 à 2 tiers manquants maximum** et tague la phase correspondante
  avec `"gitTier": <1-6>` dans `progress.json` — jamais transformer tout le
  parcours en exercice git.
- Pour un tier 3 (conflit réel) ou 4 (amend/rebase -i/cherry-pick) : le
  checkpoint de la phase doit **scripter concrètement l'action** (ex. modifier
  les mêmes lignes sur deux branches puis merger pour un vrai conflit) —
  jamais espérer qu'elle survienne toute seule.
- Pour un tier 6 (lire un diff d'autrui) : le checkpoint vérifie la présence
  d'un artefact (ex. `docs/plans/tier6-<sujet>.md`) qui cite une vraie URL
  `https://github.com/<org>/<repo>/pull/<n>` — choisis une PR réelle et
  pertinente (idéalement d'une dépendance du projet), jamais inventée.
  `ai-learn check` refuse toute citation non substantielle.
- Toute observation d'état git/gh par l'IA (branche courante, PR ouvertes…)
  suit le pattern « Reality checks » (`AGENTS.md` §4) : l'IA ne lance jamais
  la commande elle-même (bloqué mécaniquement par `ai-learn guard`), elle
  demande à l'apprenant de la lancer et de rapporter ce qu'il voit.

## 5. Scaffolder avec ai-learn

Exécute, depuis la racine du projet d'apprentissage :

```bash
ai-learn init \
  --technology "<techno>" \
  --project "<nom-du-projet>" \
  --doc-source "<chemin-ou-url-de-la-doc>" \
  --phases '<JSON des phases>' \
  --platform <claude|codex|gemini|opencode|antigravity>
```

`--platform` : indique **la plateforme sur laquelle tu tournes toi-même** (tu la
connais, inutile de la deviner) — `init` installe alors immédiatement les
commandes `/…` pour cette plateforme, sans étape manuelle séparée pour
l'apprenant. Si tu ne sais vraiment pas laquelle tu es, omets le flag :
`init` détecte Claude Code (seul signal vérifié), sinon les commandes `/…`
ne sont pas posées automatiquement — l'apprenant peut toujours lancer
`ai-learn install <plateforme>` lui-même plus tard.

⚠ Le JSON des phases est long — construis-le proprement (un objet par phase, avec
les 5 champs) et vérifie-le avant d'appeler la commande.

`init` câble aussi le **blocage apprenant** (`ai-learn guard`) : l'IA ne pourra
pas écrire dans `src/` (fichiers solution). L'apprenant tape le code ; le code de
révélation ira dans `docs/solutions/`.

## 6. Vérifier l'installation

```bash
ai-learn check
ai-learn next
```

`check` doit passer sans erreur. `next` montre la première phase à attaquer.
Présente ensuite à l'utilisateur :

- le résumé du parcours (phases, doc source)
- la commande `/next` pour voir quoi faire
- la consigne : chaque phase commence par une **prédiction écrite** avant tout code.

## Règles

- Ne jamais marquer une phase `done` toi-même : seule `ai-learn verify` le fait,
  et seulement si le checkpoint passe pour de vrai. En clôture de phase, lance
  `ai-learn verify <id>` **toi-même** (c'est automatique, pas une action de
  l'utilisateur), puis `ai-learn check`.
- Ne pas inventer de doc source : annoter ce qu'on a trouvé.
- Les questions se posent une à la fois — pas de questionnaire d'un coup.
