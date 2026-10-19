# Epic 06 — Lire moins, apprendre plus

## Goal

Supprimer le coût de pré-lecture qui fait perdre des jours à l'apprenant : sources secondaires hors quota, extrait condensé par phase avec citations `fichier:ligne`, budget de lecture déclaré et contrôlé.

## Business Value

Entrée `high` du journal : une pré-lecture budgétée 1h15 a pris 2 à 3 jours, pour environ 1 % de réutilisation dans le code produit — « je passe plus de temps à lire la doc qu'à utiliser l'IA pour accélérer ». Le tri ✅/⏭️ ne fait que **pointer** vers de gros fichiers (805, 1006 lignes) au lieu d'en extraire le contenu. Une entrée connexe (`low`) : le plafond de 3 sources de `docs add` oblige à bricoler un `.md` distillé dès que l'apprenant élargit le scope (ici Docker). Les deux se traitent dans la même couche (`docs.js`).

## Scope

Inclus :

- [ ] `docs add --secondary` : sources hors quota des 3 principales, non tracées dans la banque de pièges.
- [ ] `docs digest --phase <id>` : extrait condensé sourcé `fichier:ligne`.
- [ ] `readingBudgetMin` par phase, contrôlé par `check`.

Exclus :

- [ ] Réécrire `traps.js` (banque de pièges) — seule l'exclusion des sources secondaires y est ajoutée.
- [ ] Résumer par LLM : l'extrait est mécanique (sections ciblées citées), pas généré.
- [ ] Modifier la taille du plafond des sources principales.

## Backbone

Backbone: source ajoutée (hors quota si secondaire) → extrait condensé par phase → budget de lecture déclaré → contrôle dans `check`

Chaîne simple : `s1`, `s2` modifient `docs.js` ; `s3` ajoute le budget au schéma de phase et à `commands/learn.md`.

## Stories

1. **story-06-01-sources-secondaires-hors-quota**
2. **story-06-02-extrait-condense-par-phase**
3. **story-06-03-budget-de-lecture-controle**

## Context Strategy

- Mode d'exécution par défaut : `STANDARD` (voir chaque story ; le mode dirigeant porte des stories `STRICT`).
- Scout pre-step : aucun — chaque story nomme ses fichiers et ses ancres.
- Zones à ne pas toucher sans décision : `scan.js` (moteur de détection), `guard.js` hors epic 03.

## Clarification Readiness

ready — les stories reposent sur des entrées observées (`docs/DOGFOODING.md` et le journal du projet `fastify-traducteur-api`) et sur des décisions déjà verrouillées dans `docs/roadmap.md`. Les « Décisions à prendre » restantes sont des choix de conception à trancher dans le `plan.md` de chaque story, pas des questions bloquantes.
