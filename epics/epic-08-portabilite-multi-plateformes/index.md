# Epic 08 — Portabilité multi-plateformes (OpenCode d'abord)

## Goal

Faire tenir le protocole d'`ai-learn` sur plus qu'une plateforme : une garde mécanique réelle sur OpenCode, un seul format de commandes (skills) réutilisable partout, et un comportement honnête sous Windows natif.

## Business Value

Aujourd'hui seuls Claude Code (hook) et Codex (bac à sable OS) protègent `src/**` ; OpenCode n'a que `AGENTS.md`, donc rien n'empêche l'IA de taper à la place de l'apprenant. Coding Flow a déjà un plugin de garde OpenCode vérifié en session (`docs/plans/portabilite-opencode.md`). Les commandes sont dupliquées en 4 formats ; des skills (`SKILL.md`) se réutilisent d'une plateforme à l'autre (décision de l'utilisateur, 2026-10-24).

## Scope

Inclus :

- [ ] Plugin de garde OpenCode (`tool.execute.before`) sur `decide`, avec `apply_patch`, câblé par `init`/`update`, contrôlé par `check`.
- [ ] Spike : le hook `norm` est-il faisable côté OpenCode (`tool.execute.after`) ? Réponse écrite, avec preuve.
- [ ] Commandes `/learn-*` livrées en skills `SKILL.md` pour les plateformes qui les lisent ; migration non destructive des anciennes commandes.
- [ ] Windows natif : chemin de binaire avec espace, repli de `trash`, limites PowerShell/`cmd` écrites dans le README.

Exclus :

- [ ] Garde pour Gemini CLI et Antigravity : aucune garde tant qu'on ne l'a pas vue refuser une écriture (règle de Coding Flow, déjà la nôtre).
- [ ] Garde git/gh pour OpenCode au-delà de ce que `decide` fait déjà par construction (pas de travail propre).
- [ ] Apprendre à la garde la grammaire PowerShell/`cmd` : documentée comme limite, pas construite.
- [ ] `opencode.json` `instructions` (`AGENTS.md` est lu nativement).

## Backbone

Backbone: apprenant sous OpenCode → l'IA tente d'écrire dans `src/**` → le plugin refuse → les commandes `/learn-*` sont disponibles comme skills → mêmes garanties documentées sous Windows

```text
s1
├── s2
├── s3
└── s4
```

`s1` est le squelette : il traverse la détection OpenCode, `init`/`update`, le plugin généré, `decide`, le refus et `check`. `s2` étend le plugin de `s1` (arête réelle). `s3` (`install.js`, `platforms/*`, `commands/`) et `s4` (`guard.js#ensureGuardHook`, `docs.js`) ne se recoupent pas entre eux ni avec `s1` côté code ; ils ne partagent que le `README.md` (tableau des plateformes), à fusionner à la main. Ils ne dépendent de `s1` que pour l'ordre de livraison du README.

## Stories

1. **story-08-01-garde-opencode**
2. **story-08-02-norm-opencode-spike**
3. **story-08-03-commandes-en-skills**
4. **story-08-04-windows-natif**

## Context Strategy

- Mode d'exécution par défaut : `STANDARD` ; `s1` est `STRICT` (garde d'accès, fail-open/fail-closed).
- Scout pre-step : aucun — fichiers et ancres nommés dans chaque story.
- Zones à ne pas toucher sans décision : `decide` et la grammaire shell de `guard.js` (s1 l'appelle, ne la modifie pas), `scan.js`.
- Référence de conception : `~/dev/tools/coding-flow/bin/lib/opencode.js` (lecture seule, ne rien importer : l'archi interdit de dépendre d'un autre paquet à l'exécution).

## Clarification Readiness

ready — l'étude `docs/plans/portabilite-opencode.md` répond aux questions de fond et l'utilisateur a tranché le format skills. Les inconnues restantes (hook `after` d'OpenCode, support skills de Codex/Gemini, `trash` sous Windows) sont des vérifications explicites des stories concernées, pas des questions bloquantes.
