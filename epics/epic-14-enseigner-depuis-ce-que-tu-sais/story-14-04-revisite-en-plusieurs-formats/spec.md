# Spec — Story 14.04 — Une seule revisite, en plusieurs formats (dont la pratique alternée)

## User Value

Revenir sur ce qu'on a prouvé se fait toujours par `revisit`, et l'outil fait varier la forme : retaper le code (existant), redessiner le système de mémoire (15.03), ou une **revisite alternée** où deux notions de phases différentes reviennent sans être nommées (rappel, discrimination, composition ; à l'envers, casser une prémisse). La notion devient utilisable hors du contexte où elle a été apprise, sans ajouter un second mécanisme ni une nouvelle obligation.

Remplace l'ancienne story « pratique alternée » (commande `practice` séparée) : décision du mainteneur du 2026-11-24, fusion avec la revisite pour garder un seul mécanisme d'espacement.

## Requirements

- `ai-learn revisit <id> [--format code|dessin|alterne]` : `code` = comportement actuel (inchangé, défaut) ; `dessin` = revisite dessinée de 15.03 (refus clair si 15.03 n'est pas livrée ou la phase n'est pas `diagram: true`) ; `alterne` = ne retire aucun code.
- Format `alterne` (`--json` pour l'agent) choisit :
  - une **seconde cible** parmi les autres phases `done` non périmées, la moins récemment revisitée d'abord ;
  - un **mode** par cible, dans l'ordre rappel → discrimination → composition : on passe au suivant quand la dernière revisite alternée de ce mode a une note ≥ 7/10 ;
  - un **gabarit** parmi `direct`, `a-l-envers` (on donne la conclusion, il retrouve les causes), `casser-une-premisse` (on affaiblit une hypothèse : que casse-t-on ?), tiré sous générateur injectable.
  Sortie : cibles, mode, gabarit, consigne pour l'agent (ne jamais nommer la notion visée).
- La réponse est une prédiction de type `alterne` (`PREDICTION_TYPES`) avec `--targets`, `--mode`, `--template` et la confiance de 14.01 ; `verify --revisit <id>` d'une revisite `alterne` passe quand cette prédiction est révélée avec une note ≥ 7/10, sinon la revisite reste ouverte (une relance, puis révélation : jamais de réenseignement).
- **Choix du format par l'outil** : `next` propose la revisite due (espacement existant) avec un format en rotation `code` → `alterne` → `dessin` (si disponible) ; l'apprenant peut en demander un autre. Aucune nouvelle offre ni obligation : c'est la même revisite due qu'aujourd'hui (budget de friction de 14.02).
- `status` : ligne « revisites : n, formats, mode atteint par phase ».
- `templates/AGENTS-apprentissage.md` (§5bis revisite) : les trois formats et la consigne de la revisite alternée ; `docs/pedagogie.md` (section espacement et alternance).

## Acceptance Criteria

- [ ] Given une seule phase prouvée, when `revisit <id> --format alterne`, then exit 1 « 2 phases prouvées nécessaires ».
- [ ] Given 4 phases prouvées dont une périmée, when `revisit <id> --format alterne --json`, then la seconde cible n'est ni la périmée ni `<id>`.
- [ ] Given une cible dont la dernière revisite alternée en rappel est notée 8/10, when `--format alterne --json`, then son mode est `discrimination`.
- [ ] Given une revisite `alterne` ouverte, when on lit les fichiers de `src/**`, then aucun n'a été retiré ni modifié.
- [ ] Given la prédiction `alterne` révélée à 8/10, when `verify --revisit <id>`, then succès ; à 5/10, then échec et revisite toujours ouverte.
- [ ] Given une revisite due dont la précédente était au format `code`, when `next --json`, then le format proposé est `alterne`.
- [ ] Given `revisit <id>` sans `--format`, when il tourne, then le comportement actuel (retrait du code) est inchangé (tests de `revisit` existants verts).
- [ ] Given une graine fixée, when `--format alterne --json` deux fois, then même sortie.

## Edge Cases

- Mode `dirigeant` : `alterne` reste proposé (compréhension, pas écriture de `src/**`) ; `code` ne l'est pas, comme aujourd'hui.
- Format `dessin` demandé sans 15.03 : message « format dessin indisponible », la revisite n'est pas ouverte.

## Out of Scope

- Pondérer la seconde cible par les faiblesses prouvées de 13.04 : à brancher quand les deux sont livrées (ligne de suivi dans le `## Result`).
- Une commande `practice` séparée (abandonnée par cette fusion).
