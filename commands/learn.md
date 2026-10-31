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

## 0. Router (l'apprenant ne tape que `/learn`)

L'apprenant ne connaît que `/learn`, `/learn-next` et `/learn-status` : tout le
reste est de la machinerie que **tu** appelles, sans lui demander de taper quoi
que ce soit. Regarde d'abord où il en est, puis suis le flux — les fichiers
`references/<flux>.md` sont à côté de ce `SKILL.md`, dans le dossier `references/`
de ce skill ; lis-les à la demande, pas tous d'avance.

| Situation | Flux |
|---|---|
| Un `progress.json` existe déjà dans le projet | reprise : lance `ai-learn next`, montre la phase, pas de nouveau parcours |
| Un projet existe (du code, des tests) mais pas de `progress.json` | `references/scan.md` — où il en est, puis suite d'approfondissement |
| Pas de projet et pas d'idée (« je ne sais pas quoi faire ») | `references/propose.md` — projets à construire, puis reviens à l'étape 1 avec celui qu'il choisit |
| Pas de projet, une technologie ou un projet en tête | étapes 1 à 6 ci-dessous |

Si l'apprenant a nommé une technologie (`/learn <techno>`) dans un dossier qui contient déjà du code, sa demande explicite l'emporte sur le scan : suis les étapes 1 à 6, et propose le scan seulement s'il dit vouloir faire le point sur son projet.

Tu lances aussi toi-même, au bon moment et en silence : `ai-learn check` (après
chaque étape qui écrit, et avant de dire qu'un parcours est cohérent), et
`ai-learn docs …` quand il faut embarquer ou rafraîchir une source
(`references/docs.md`). Tu n'en parles à l'apprenant que si le résultat change ce
qu'il doit faire.

## 0 bis. Profil de l'apprenant (une seule fois, global)

Avant tout flux, lance `ai-learn profile --json`.

- `{ "exists": false }` : premier lancement. Pose 3 à 5 questions, **une à la
  fois** : objectifs (texte libre), minutes disponibles par jour, technos à
  privilégier maintenant / à différer / à éviter, projets réels sur lesquels il
  pourra transférer ce qu'il apprend. Puis enregistre avec
  `ai-learn profile set --json '{"goals":[…],"dailyMinutes":N,"focus":{"now":[…],"later":[…],"avoid":[]},"projects":[{"name":"…","summary":"…"}]}'`.
  Une liste peut rester vide ; une chaîne vide est refusée.
- Profil présent et valide : lis-le (il oriente le cadrage, les projets proposés
  et les exemples de transfert) et ne le redemande jamais. Si l'apprenant dit
  « mets à jour mon profil », reprends les questions utiles et relance
  `profile set`.
- Profil invalide : montre l'erreur de `ai-learn check` et continue sans lui.

Le profil vit dans `~/.ai-learn/`, jamais dans le dépôt, et tu ne l'écris pas à la
main : seul `ai-learn profile set` le fait.

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
- `reviewAfterDays`: `7` sur chaque phase **sauf la phase 0** — délai avant la
  première revisite espacée (`ai-learn revisit <id>` retire le code de la phase,
  l'apprenant le retape de mémoire). Jamais modifié à la main : `verify` double
  l'intervalle à chaque revisite réussie.
- `sections`: les plages de doc que la phase doit lire,
  `[{ source, file, from, to }]` (lignes 1-indexées, inclusives).
  `ai-learn docs digest --phase <id>` en fait un extrait
  `docs/digests/phase-<id>.md`, copié mécaniquement et cité
  `source/fichier:ligne`.
- `readingBudgetMin` (optionnel) : budget de lecture de la phase, en minutes
  entières. `ai-learn check` avertit quand le digest dépasse ce budget
  (200 mots/min).
- `mutation` (optionnel, `true`) : exige que les tests de la phase protègent le
  code — `ai-learn verify` lance la mutation après le checkpoint et bloque si un
  mutant a **survécu** (un mutant **tué** = le test s'en est aperçu). À activer
  sur les phases où le comportement est testable ; le protocole de prédiction
  (« quel test doit tomber ? ») est décrit dans `AGENTS-apprentissage.md`
  §3quinquies.

Séquence type API web (modèle à adapter à la techno choisie) : mise en route →
routes → validation d'entrée → architecture/modularité → persistance/IO →
logique métier → gestion des erreurs → config/tests → prod.

### Lire un extrait, pas des pointeurs

La préparation d'une phase se fait sur son **digest**, pas sur une liste de
pointeurs vers de gros fichiers. Une phase sans `sections` (donc sans digest),
ou dont la préparation tient en « lis `Reference/Routes.md` (1 006 lignes) »,
est incomplète : découpe la doc en plages ciblées, déclare-les dans `sections`,
génère `ai-learn docs digest --phase <id>`, puis lis cet extrait. Le but est de
lire les lignes utiles, pas de parcourir des fichiers entiers.

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
  le scan (`references/scan.md`) à l'intérieur d'un projet, étendu ici à travers plusieurs projets.
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

### Intégrer les paliers plateforme (1 à 2 phases max)

Quel que soit le langage, chaque parcours fait avancer l'apprenant d'un ou deux
paliers plateforme. Lis `~/.ai-learn/tracks/platform.json` (simple lecture ; absent
= aucun palier prouvé) et, s'il existe, le champ `focus` du profil.

| Palier | Thème | Ce que le checkpoint exécute pour de vrai |
|---|---|---|
| 1 | Linux & processus | signaux, codes de sortie, variables d'environnement, descripteurs |
| 2 | Réseau | HTTP brut, TCP, DNS, TLS observés (`curl -v`, `ss`, `dig`, `openssl s_client`) |
| 3 | Données | transaction, contrainte, index prouvé par `EXPLAIN` |
| 4 | Conteneurs | image, réseau, volume, compose reproductible |
| 5 | CI/CD | pipeline qui lance les tests et bloque un échec |
| 6 | Observabilité | logs structurés, health check, arrêt propre sur `SIGTERM` |
| 7 | Fiabilité | timeout, retry, idempotence, file de tâches |

- Tague **1 à 2 phases au maximum** avec un palier manquant : `"platformTier": <1-7>`
  dans `progress.json`. Jamais tout le parcours, jamais plus de deux phases.
- Le checkpoint de ces phases **exécute réellement le thème** : une commande réelle
  (`curl -v`, `ss`, `EXPLAIN`, `kill -TERM`…) dont la sortie prouve le palier, pas un
  test qui l'affirme.
- Un palier n'est `achieved` que par un `verify` réussi d'une phase taguée ; il n'y a
  aucune détection sans tag. Une phase peut porter `gitTier` et `platformTier` : les
  deux ledgers avancent.
- Si l'apprenant veut un projet et n'a pas d'idée, `propose` classe en tête les
  projets qui couvrent ses paliers manquants.

## 5. Scaffolder avec ai-learn

Exécute, depuis le dossier du projet (ou depuis son dossier parent : avec `--project`, `init` crée alors `./<nom-du-projet>/` quand le dossier courant n'est ni vide-pour-ce-projet ni nommé ainsi — la première ligne affiche le chemin choisi) :

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
ne sont pas posées automatiquement — lance alors toi-même
`ai-learn install <plateforme>` quand tu connais la plateforme : l'apprenant n'a
aucune commande `ai-learn` à taper.

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
- la commande `/learn-next` pour voir quoi faire
- la consigne : chaque phase commence par une **prédiction écrite** avant tout code, qui couvre aussi un **cas d'échec** (voir `AGENTS.md` §1) ; la note
  et la révélation relisent `src/**` et citent `fichier:ligne` (§2, §3).

## Règles

- Ne jamais marquer une phase `done` toi-même : seule `ai-learn verify` le fait,
  et seulement si le checkpoint passe pour de vrai. En clôture de phase, lance
  `ai-learn verify <id>` **toi-même** (c'est automatique, pas une action de
  l'utilisateur), puis `ai-learn check`.
- Ne pas inventer de doc source : annoter ce qu'on a trouvé.
- Les questions se posent une à la fois — pas de questionnaire d'un coup.
