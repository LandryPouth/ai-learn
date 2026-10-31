# Spec — Story 10.07 — Bilan de fin de projet

## User Value

Un projet terminé laisse une trace utile : ce qui a été construit, ce qui est solide, ce qui reste fragile, et une décision claire sur la suite (l'intégrer à un vrai produit, le garder comme labo, le simplifier ou l'abandonner). L'outil prépare tout ce qu'il sait ; l'apprenant n'écrit que ce que lui seul peut dire.

## Requirements

- Quand `verify` prouve la **dernière** phase, il génère `docs/bilan.md` s'il n'existe pas, pré-rempli à partir des données : phases et preuves, paliers atteints pendant le projet (git, tests, plateforme, debug), score de mutation, prédictions (comptes par type), incidents (issues), zones de faiblesse du journal de prédictions.
- Sections laissées à l'apprenant, marquées `<!-- à compléter -->` : « Encore fragile », « Erreurs marquantes », « Compromis d'architecture », « Réutilisable dans mes projets », « Recommandation ».
- `check` (projet dont toutes les phases sont `done`) : erreur si `docs/bilan.md` est absent, si une section à compléter contient encore le marqueur ou est vide, ou si « Recommandation » ne contient pas exactement une décision parmi `intégrer`, `labo`, `simplifier`, `abandonner`.
- `/learn-next` (parcours terminé) : conduit l'apprenant à compléter le bilan, une section à la fois ; l'IA propose des questions, n'écrit pas les réponses à sa place. Puis il propose la suite (nouveau parcours via `/learn`) **sans en imposer un** : consolider peut être la bonne réponse.
- `status` : « bilan : à compléter » / « bilan : fait (<décision>) ».

## Acceptance Criteria

- [x] Given la dernière phase prouvée par `verify`, when on liste `docs/`, then `bilan.md` existe avec les sections pré-remplies (phases, paliers, mutation, prédictions, incidents) et les cinq sections marquées à compléter.
- [x] Given un `bilan.md` déjà présent, when `verify` reprouve une phase, then le fichier n'est pas écrasé.
- [x] Given toutes les phases `done` et un bilan contenant encore un marqueur, when `ai-learn check`, then erreur nommant la section.
- [x] Given une « Recommandation » contenant deux décisions ou aucune, when `check`, then erreur listant les décisions valides.
- [x] Given un bilan complet avec `labo`, when `check` puis `status`, then aucune erreur et « bilan : fait (labo) ».
- [x] Given un parcours non terminé, when `check`, then l'absence de bilan n'est jamais signalée.
- [x] Given `commands/learn-next.md`, when le parcours est terminé, then il décrit la complétion section par section et interdit à l'IA de rédiger les réponses de l'apprenant.

## Edge Cases

- `bilan.md` ne fait pas partie de `src/**` : l'IA peut écrire la partie générée, pas les sections à compléter — règle de protocole (non mécanique), écrite dans `learn-next.md`.
- Parcours sans ledgers (projets anciens) : sections pré-remplies avec « aucune donnée ».

## Out of Scope

- Agréger les bilans de plusieurs projets.
