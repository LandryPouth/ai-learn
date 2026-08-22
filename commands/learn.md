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
