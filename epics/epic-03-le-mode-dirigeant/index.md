# Epic 03 — Le mode dirigeant

## Goal

« On ne code plus, on dirige » n'est vrai que si la compétence de juger est prouvée : un mode `dirigeant` qui se mérite par les tiers du ledger `tests.json`, inverse la propriété (l'apprenant garde la spécification : `test/**`, `checkpoint/**`) et exige une revue sourcée.

## Business Value

Sans preuve de jugement, le mode dirigeant n'est que le tutoriel avec un diff à la place de la vidéo — la ligne rouge produit de `docs/roadmap.md`. Cet epic dépend entièrement de l'epic 02 (mutation + ledger `tests.json`, livrés) : c'est lui qui rend la spécification de l'apprenant mesurable.

## Scope

Inclus :

- [ ] `guard.json` gagne `mode` ; en dirigeant, `learnerFiles` s'inverse.
- [ ] `ai-learn mode dirigeant` refuse tant que les tiers 1-3 de `tests.json` ne sont pas atteints.
- [ ] Tier « revue » : `docs/reviews/<brique>.md` citant un `fichier:ligne` du diff et une décision (réutiliser `check.js#citesRealPRUrl`).
- [ ] `check` en dirigeant : erreur si une phase `done` n'a aucun test de l'apprenant qui tue au moins un mutant.

Exclus :

- [ ] Le module debug par injection de faute et « juger le code d'autrui » (`docs/plans/pistes-non-mesurees.md` Parties A et B) : leurs conditions de promotion ne sont pas remplies.
- [ ] Toute réécriture du moteur de mutation.
- [ ] Changer la propriété du checkpoint en mode apprenti (écarté, voir `pistes-non-mesurees.md` § Écarté).

## Backbone

Backbone: mode apprenti → tiers 1-3 du ledger atteints → `ai-learn mode dirigeant` accepté → l'IA implémente, l'apprenant spécifie → revue sourcée → `check` exige un test tueur de mutant

```text
s1
├── s2 ──┐
└── s3 ──┴── s4
```

`s1` (mode dans `guard.json`) est le squelette qui traverse guard → config → CLI. `s2` (porte d'entrée par les tiers) et `s3` (tier revue) sont disjoints (`bin/lib/mode.js` contre `check.js`/`docs/reviews/`). `s4` consolide : `check` en dirigeant lit les deux.

## Stories

1. **story-03-01-mode-dans-guard-json**
2. **story-03-02-mode-se-merite**
3. **story-03-03-tier-revue-sourcee**
4. **story-03-04-check-en-dirigeant**

## Context Strategy

- Mode d'exécution par défaut : `STANDARD` (voir chaque story ; le mode dirigeant porte des stories `STRICT`).
- Scout pre-step : aucun — chaque story nomme ses fichiers et ses ancres.
- Zones à ne pas toucher sans décision : `scan.js` (moteur de détection), `guard.js` hors epic 03.

## Clarification Readiness

ready — les stories reposent sur des entrées observées (`docs/DOGFOODING.md` et le journal du projet `fastify-traducteur-api`) et sur des décisions déjà verrouillées dans `docs/roadmap.md`. Les « Décisions à prendre » restantes sont des choix de conception à trancher dans le `plan.md` de chaque story, pas des questions bloquantes.
