# Epic 04 — Le protocole atteint toute session

## Goal

Faire en sorte que le protocole « prédire avant de révéler » s'applique dès qu'une IA ouvre le projet, que `next` mène en une commande à l'action utile, et que l'apprenant retrouve ses commandes et ses réflexes git sans les connaître à l'avance.

## Business Value

Le journal de friction du premier vrai projet appris (`fastify-traducteur-api`, outil 0.4.0) montre trois fuites au même endroit : le protocole n'est pas chargé hors des commandes `/…` (entrée `high`, toutes plateformes) ; `next` répond par une phase déjà acquise avant de dire où l'apprenant s'est arrêté ; rien ne rappelle de committer entre deux réponses. Chacune pousse l'apprenant à contourner l'outil — le signal que `docs/DOGFOODING.md` met en tête. Cet epic traite uniquement ce qui est observé, rien d'imaginé.

## Scope

Inclus :

- [ ] Un fichier mémoire natif par plateforme qui pointe vers `AGENTS.md` (`CLAUDE.md`, `GEMINI.md`), écrit par `init`/`update`, jamais écrasé.
- [ ] `next`/`status` : l'action utile d'abord, les phases périmées en avertissement non bloquant.
- [ ] `verify --stale` : re-prouver en bloc, en distinguant « toujours vert » de « régression réelle ».
- [ ] Rappel de commit en lecture seule + commande git expliquée partie par partie.
- [ ] Préfixe commun des commandes `/…`, anciens noms conservés comme alias.

Exclus :

- [ ] Réécrire `guard.js` (décision d'accès) ou `scan.js`.
- [ ] Exécuter `git commit` à la place de l'apprenant — le rappel reste une suggestion (AGENTS.md §3bis).
- [ ] Tout hook PostToolUse (epic 07).
- [ ] Corriger les comportements du paquet `@landry_pouth/coding-flow` (worktree place, fraîcheur de review) — hors dépôt.

## Backbone

Backbone: session ouverte → protocole chargé → `next` dit quoi faire → preuve périmée re-vérifiée en bloc → commit suggéré et expliqué → commandes retrouvées par préfixe

```text
s1
├── s2
│   ├── s3
│   └── s4
└── s5
```

`s1` (skeleton : `init`/`update` écrivent le fichier mémoire natif) précède `s5` (renommage des commandes) car tous deux modifient `update.js`/`ensure.js`. `s2` (`next`) précède `s3` (`verify --stale`) et `s4` (rappel de commit) : les trois touchent `next.js`/`status.js`. `s3` et `s4` sont disjoints (`verify.js` contre `status.js`+`util.js`) — parallélisables une fois `s2` fusionné.

## Stories

1. **story-04-01-memoire-native-par-plateforme**
2. **story-04-02-next-atterrit-sur-laction-utile**
3. **story-04-03-verify-stale-reprouve-en-bloc**
4. **story-04-04-rappel-de-commit-explique**
5. **story-04-05-prefixe-commun-des-commandes**

## Context Strategy

- Mode d'exécution par défaut : `STANDARD` (voir chaque story ; le mode dirigeant porte des stories `STRICT`).
- Scout pre-step : aucun — chaque story nomme ses fichiers et ses ancres.
- Zones à ne pas toucher sans décision : `scan.js` (moteur de détection), `guard.js` hors epic 03.

## Clarification Readiness

ready — les stories reposent sur des entrées observées (`docs/DOGFOODING.md` et le journal du projet `fastify-traducteur-api`) et sur des décisions déjà verrouillées dans `docs/roadmap.md`. Les « Décisions à prendre » restantes sont des choix de conception à trancher dans le `plan.md` de chaque story, pas des questions bloquantes.
