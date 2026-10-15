# Epic 07 — Rétention et qualité au fil de l'eau

## Goal

Rendre l'oubli visible (reprise espacée des phases prouvées) et ramener le retour clean-code au moment de la frappe plutôt qu'à la clôture.

## Business Value

Deux manques observés. Le journal du mainteneur appelle la reprise espacée « le seul trou pédagogique réel » : une phase `done` n'est plus jamais rejouée, l'oubli est invisible. Le journal du projet appris montre l'inverse côté qualité : `norm` n'est déclenché par rien, si bien que la duplication a attendu la fin de la phase et une question de l'apprenant.

## Scope

Inclus :

- [ ] `lastProvenAt` et `reviewAfterDays` par phase ; `next` propose une revisite échue.
- [ ] `verify --revisit` : preuve de revisite sans notes, tracée dans l'évidence.
- [ ] Hook PostToolUse (claude-code) qui lance `ai-learn norm` en lecture seule après une écriture dans `src/**`.

Exclus :

- [ ] Bloquer quoi que ce soit au titre de la revisite — c'est un signal, pas un mur.
- [ ] Rétrograder le blocage `norm` par phase (Partie D) : sa condition de promotion — un blocage hors-sujet réellement vécu — n'est pas remplie ; le journal montre le **contraire** (`norm` trop rare).
- [ ] Hook pour les autres plateformes : repli documenté seulement.

## Backbone

Backbone: phase prouvée → date de revisite → `next` propose la revisite → preuve sans notes → `check` signale l'oubli ; en parallèle, frappe de l'apprenant → retour `norm` immédiat

```text
s1
├── s2
└── s3
```

`s1` (état de revisite dans `progress.json` + `next`) est le squelette. `s2` (`verify --revisit`, `check`) en dépend. `s3` (hook norm) est disjoint de `s2` (`platforms/**`+`norm.js` contre `verify.js`+`check.js`) : parallélisables une fois `s1` fusionné.

## Stories

1. **story-07-01-revisite-echue-dans-next**
2. **story-07-02-revisite-sans-notes**
3. **story-07-03-norm-au-fil-de-la-frappe**

## Context Strategy

- Mode d'exécution par défaut : `STANDARD` (voir chaque story ; le mode dirigeant porte des stories `STRICT`).
- Scout pre-step : aucun — chaque story nomme ses fichiers et ses ancres.
- Zones à ne pas toucher sans décision : `scan.js` (moteur de détection), `guard.js` hors epic 03.

## Clarification Readiness

ready — les stories reposent sur des entrées observées (`docs/DOGFOODING.md` et le journal du projet `fastify-traducteur-api`) et sur des décisions déjà verrouillées dans `docs/roadmap.md`. Les « Décisions à prendre » restantes sont des choix de conception à trancher dans le `plan.md` de chaque story, pas des questions bloquantes.
