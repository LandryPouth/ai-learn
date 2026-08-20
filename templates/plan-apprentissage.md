# Plan d'apprentissage — {{project}}

> **Objectif** : apprendre **{{technology}}** en profondeur, en construisant un vrai projet.
> **Méthode** : protocole « prédire avant de révéler » — pour chaque brique, prédire la solution *par écrit* avant qu'elle soit révélée, compléter (max 3 questions), améliorer (max 2 passes), reality check en fin de phase.

## Le projet

(À remplir : ce qu'on construit, le flux, le modèle de données.)

## Phases

Chaque phase a, côté `progress.json` :
- un **checkpoint** : une commande exécutable (ex. `node --test checkpoint/phase-0.test.mjs`) qui prouve le comportement de la phase — c'est lui que `ai-learn verify` exécute ;
- des **artefacts** : fichiers qui doivent exister (ex. `docs/phase-0-mise-en-route.md`) ;
- un **predictionsRequired** : nombre de prédictions écrites attendues dans `docs/plans/predictions.md`.

La compréhension (pas seulement le comportement) est prouvée par le journal de prédictions (comptes d'écarts) et les reality checks — pas par le checkpoint seul.

- [ ] Phase 0 — ...
- [ ] Phase 1 — ...

## Règle d'or
> Lis un peu, code beaucoup. Chaque concept finit en code que *tu* prédits et qu'un checkpoint prouve.
