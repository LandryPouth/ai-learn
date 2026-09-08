# Story 02.02 — Banque d'opérateurs par stack

## Goal

Remplacer l'opérateur unique en dur du squelette (02-01) par une **banque
d'opérateurs de mutation par stack pack**, muter **tous** les sites trouvés
(pas seulement le premier), et donner à `ai-learn mutate` sa propre config
projet (`.ai-learn/mutate.json`) auto-créée par `init`/`update` — même contrat
que `.ai-learn/norm.json`.

## User Value

Un opérateur unique (inversion booléenne) ne couvre qu'une fraction du code
réel. La plupart des bugs qu'un test doit attraper sont des erreurs
arithmétiques (`+`/`-`), de comparaison (`<`/`<=`), ou de condition limite (`&&`/`||`).
Sans une banque plus large, `ai-learn mutate` resterait un gadget de démo plutôt
qu'un outil qui trouve de vrais trous de couverture — et sans détection de
backup orphelin, un crash pendant un `mutate` précédent laisserait un apprenant
face à un fichier muté sans comprendre pourquoi ses tests échouent tous.

## Context

`bin/lib/stacks/{c,generic,javascript}.js` exportent déjà chacun un champ `norm`
(seuils clean-code par stack — voir `bin/lib/norm.js#resolveThresholds`). Le même
schéma de fallback (stack pack → `FALLBACK_NORM` si absent) s'applique ici avec
un nouveau champ `mutators`. `bin/lib/init.js`/`update.js` câblent déjà
`ensureNormConfig` de façon identique pour les deux commandes — `ensureMutateConfig`
doit suivre le même contrat (créer une fois, jamais réécrire, valeurs concrètes
résolues au moment de la création).

## Requirements

- [x] Chaque stack pack (`c.js`, `generic.js`, `javascript.js`) exporte un champ
      `mutators` : une liste d'opérateurs `{ id, describe(source) → sites[] }` ou
      équivalent, au moins l'inversion booléenne (portée depuis 02-01) et un
      opérateur de comparaison (`<` ↔ `<=`, ou `>` ↔ `>=`) pour `javascript.js`
      et `c.js`. `generic.js` garde au minimum l'inversion booléenne comme
      fallback universel.
- [x] `ai-learn mutate --phase <id>` mute et teste **tous** les sites trouvés
      dans le périmètre, un par un et séquentiellement (jamais deux mutants
      simultanés sur le même fichier — décision de `index.md`), en produisant
      une ligne de rapport par site.
- [x] `.ai-learn/mutate.json` est auto-créé une fois par `init` et par `update`
      (même contrat que `ensureNormConfig` : jamais réécrit une fois présent),
      avec les opérateurs actifs pour la stack détectée et un plafond
      `maxMutantsPerRun` (protection contre un run trop long — voir Risks de
      `index.md`).
- [x] Au démarrage de `ai-learn mutate`, un fichier de backup orphelin
      (résidu d'un crash `kill -9` pendant un run précédent — risque assumé en
      02-01) est détecté et restauré avant que le run ne continue, avec un
      message explicite.
- [x] Le score de mutation (`tués / total`) est affiché en résumé de fin de
      rapport.
- [x] Aucun opérateur configuré ou aucun site mutable trouvé reste un succès
      explicite (0 mutant, exit 0) — jamais un blocage.

## Acceptance Criteria

- [x] Given un fichier JavaScript contenant une comparaison (`a < b`), when
      `ai-learn mutate --phase <id>` tourne, then l'opérateur de comparaison de
      `javascript.js` produit un mutant pour ce site.
- [x] Given un fichier avec 3 sites mutables distincts, when `ai-learn mutate`
      tourne, then le rapport contient exactement 3 lignes, chacune restaurée
      avant de passer à la suivante.
- [x] Given une stack sans opérateur dédié (pack `generic.js`), when
      `ai-learn mutate` tourne sur un fichier sans littéral booléen, then la
      commande annonce l'absence de site mutable et sort en 0.
- [x] Given un fichier de backup laissé par un `mutate` précédent interrompu,
      when `ai-learn mutate` démarre, then le fichier original est restauré
      avant que le nouveau run ne commence, avec un message explicite.
- [x] Given un projet sans `.ai-learn/mutate.json`, when `ai-learn init` (ou
      `update`) tourne, then le fichier est créé une fois avec les opérateurs de
      la stack détectée.
- [x] Given un `.ai-learn/mutate.json` déjà présent avec des valeurs
      personnalisées, when `ai-learn update` tourne à nouveau, then le fichier
      n'est jamais réécrit.
- [x] Given un run avec 4 mutants dont 3 tués et 1 survécu, when le rapport
      s'affiche, then le résumé indique un score de mutation de 75 %.

## Edge Cases

- [x] `maxMutantsPerRun` dépassé (fichier avec beaucoup de sites) — le run
      s'arrête proprement au plafond, le signale, et ne le traite pas comme un
      échec en soi (juste un run partiel, clairement étiqueté).
- [x] Deux backups orphelins simultanés (deux fichiers différents mutés puis
      abandonnés) — impossible par construction : un seul mutant est jamais
      actif à la fois (voir Technical Notes de `plan.md`), donc le lock
      unique (`.ai-learn/mutate.lock.json`) ne peut jamais désigner deux
      fichiers en même temps — voir Decisions de `plan.md`.
- [x] Un backup orphelin dont le fichier original a depuis été supprimé par
      l'apprenant — restauration recrée le fichier ; ne jamais planter dessus.
- [x] Une stack détectée sans entrée `mutators` du tout (pack tiers ou futur) —
      repli sur les opérateurs de `generic.js`, jamais une erreur.
- [x] Un opérateur de comparaison rencontrant un opérateur composé (`<=`, `>=`)
      doit choisir une mutation de frontière cohérente (`<=` → `<`, `>=` →
      `>`) sans jamais confondre le `>` d'une fonction fléchée (`=>`) ou du
      pointeur/struct C (`->`) avec un site de comparaison — ces deux-là
      restent toujours hors périmètre. Un `<`/`>` de balise JSX (`<div>`) ou
      de générique TypeScript (`Array<string>`) n'est pas exclu par ce même
      mécanisme (aucun marqueur adjacent univoque comme `=`/`-`) : les
      fichiers `.jsx`/`.tsx` sont exclus de cet opérateur en bloc (revue
      post-implémentation ; voir Decisions de `plan.md`), le cas plus étroit
      d'un générique sur un `.ts` non-JSX reste un risque résiduel accepté et
      documenté (même Decisions).
- [x] Un fichier de prose ou de config (extension hors `ALL_SOURCE_EXTS`) et un
      fichier de test (`testRels`) restent tous deux hors périmètre en mode
      « tous les sites », pas seulement pour le premier site trouvé — régression
      du fix post-review de 02-01 (`findFirstSite`), à préserver dans
      `detectAllSites`.

## UX Notes

Le résumé de fin de run doit répondre en une ligne à « est-ce que je peux faire
confiance à mes tests sur ce code ? » (score de mutation), avant le détail
site par site. La restauration d'un backup orphelin doit rassurer explicitement
(« un run précédent a été interrompu, votre fichier original a été
restauré — rien n'est perdu »), jamais sonner comme une erreur qui serait de la
faute de l'apprenant.

## Dependencies

Dépend de **story-02-01** : réutilise directement son moteur de détection/
application/restauration et son intégration à `phase.checkpoint`. Ne peut pas
démarrer avant que 02-01 soit fusionnée.

## Out of Scope

- [ ] Blocage dans `verify` — story 02-03.
- [ ] Audit `check`/résumé `status` — story 02-04.
- [ ] Ledger cross-projet `tests.json` — story 02-05.
- [ ] Opérateurs pour des langages hors `c`/`generic`/`javascript` — hors scope
      de l'epic, ces trois packs sont les seuls existants dans le dépôt.
