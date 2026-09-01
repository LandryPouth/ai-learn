# Story 01.05 — Les commandes se laissent piloter

## Goal

Réparer le parsing d'arguments (un `--dir` avale l'argument positionnel qui suit) et
exposer le modèle d'états construit par cette epic en sortie machine (`--json`).

## User Value

Deux publics bloqués aujourd'hui :

- **L'agent** doit lire l'état en parsant du texte français destiné à un humain. La
  sortie change de forme à chaque story de cet epic ; un contrat stable évite que
  chaque agent invente son propre regex.
- **N'importe qui** qui écrit `ai-learn verify --dir X 0` obtient une erreur
  incompréhensible.

## Context

**Le bug de parsing, reproduit :**

```
$ ai-learn verify --dir /tmp/p 0
Error: verify requires a phase id, ex: ai-learn verify 0
```

`bin/ai-learn.js` extrait le positionnel avec
`commandArgs.find((arg) => !arg.startsWith("--"))`, qui trouve `/tmp/p` — la valeur
du flag — avant le vrai argument. Même famille dans `install` et `propose`.

C'est **le bug déjà consigné dans `docs/DOGFOODING.md`** (« `docs add` avale le
`--dir` global comme source »), corrigé à l'époque uniquement dans `docs.js` avec un
`stripDir` local. Le reste du CLI a gardé le défaut.

## Requirements

- [ ] Un parseur d'arguments partagé retire les paires flag/valeur avant toute
      extraction positionnelle, pour **toutes** les commandes.
- [ ] `ai-learn verify --dir <chemin> <id>` et `ai-learn verify <id> --dir <chemin>`
      se comportent identiquement.
- [ ] Le `stripDir` local de `docs.js` est remplacé par le parseur partagé, sans
      régression sur les cas déjà couverts par `test/docs.test.js`.
- [ ] `check`, `status` et `next` acceptent `--json` et écrivent sur stdout un objet
      unique, versionné, sans aucune ligne de texte libre.
- [ ] La sortie JSON expose le verdict par phase du modèle d'états de cette epic.
- [ ] Sans `--json`, la sortie texte est strictement inchangée.
- [ ] Le code de sortie est identique avec et sans `--json`.

## Acceptance Criteria

- [ ] Given la commande `verify --dir <chemin> <id>`, when elle est lancée, then la phase `<id>` du projet `<chemin>` est vérifiée.
- [ ] Given la commande `verify <id> --dir <chemin>`, when elle est lancée, then le résultat est identique à l'ordre inverse.
- [ ] Given la commande `install --home <chemin> claude`, when elle est lancée, then la plateforme retenue est `claude` et non `<chemin>`.
- [ ] Given `ai-learn check --json`, when elle est lancée, then la sortie complète est un JSON valide et unique.
- [ ] Given `ai-learn check --json` sur un projet en erreur, when elle est lancée, then le code de sortie est 1, identique à la sortie texte.
- [ ] Given `ai-learn status --json`, when elle est lancée, then chaque phase porte son verdict (`pending`, `in-progress`, `proven`, `proven-unhashed`, `stale`, `unproven`).
- [ ] Given `ai-learn next --json`, when aucune phase ne reste, then la sortie l'indique par un champ dédié et non par une phrase.
- [ ] Given une commande sans `--json`, when elle est lancée, then sa sortie texte est identique à celle de la version précédente.

## Edge Cases

- [ ] `--dir=<valeur>` (forme collée) autant que `--dir <valeur>`.
- [ ] Flag booléen suivi d'un positionnel (`verify --no-mark 0`) — `--no-mark` ne
      prend pas de valeur et ne doit pas manger le `0`.
- [ ] Flag inconnu — ne pas planter, comportement actuel préservé.
- [ ] Valeur de flag commençant par `-` (chemin exotique).
- [ ] `--phases '<json>'` de `init` : la valeur contient espaces et accolades.
- [ ] Sortie JSON quand `progress.json` est absent ou corrompu.
- [ ] `--json` combiné à `--root` sur plusieurs projets.
- [ ] Sortie JSON contenant des chemins Windows (séparateurs normalisés).

## UX Notes

`--json` est destiné aux agents ; il ne remplace jamais la sortie humaine et n'est
mentionné qu'une ligne dans l'aide. Aucun mélange : en mode JSON, pas une seule ligne
de texte libre sur stdout, sinon le contrat est inutilisable.

## Dependencies

- Dépendance : story 01.04 (le modèle d'états est complet, incluant les prédictions).

## Out of Scope

- [ ] `--json` sur `verify`, `scan`, `propose`, `norm`, `docs`, `traps`.
- [ ] Toute refonte de l'ergonomie des commandes ou renommage de flag.
- [ ] Un schéma publié/documenté hors du champ `version` de la sortie.
