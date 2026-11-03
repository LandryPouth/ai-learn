# Spec — Story 12.01 — Prédire où vit un mécanisme, puis le trouver

## User Value

Avant d'ouvrir le code de Fastify, de Node ou de `pg-boss`, l'apprenant écrit où il pense trouver un mécanisme (« la 404 est posée dans `lib/route.js` »). Il cherche, révèle ce qu'il a trouvé, et l'outil dit si sa carte mentale tenait. Avec le temps, il sait deviner l'architecture d'une base qu'il n'a jamais lue.

## Requirements

- `PREDICTION_TYPES` gagne `lecture`. `ai-learn predict --phase <id> --type lecture --root <racine> --file <chemin> [--line <n>] --prediction "<mécanisme et raison>"`.
  - `--root` : racine de la source lue (absolue, relative au projet, ou `~/…`) ; doit exister au moment de la prédiction.
  - `--file` : relatif à la racine ; n'a pas à exister (une prédiction peut nommer un fichier qui n'existe pas, c'est un « manqué »).
- `ai-learn predict --reveal <id> --found <fichier:ligne>` plus le feedback habituel : `--found` doit désigner un fichier réel sous la racine, ligne dans le fichier (sinon refus, rien n'est écrit). Score enregistré : `exact` (même fichier, et ligne à ±10 si la prédiction en donnait une), `fichier` (même fichier, ligne hors tolérance), `dossier` (même dossier parent), `manqué`.
- `predictionsRequired: { lecture: n }` est compté par `verify` comme les autres types ; une prédiction `lecture` non révélée ne compte pas (on n'a rien trouvé).
- `docs/plans/predictions.md` régénéré affiche la prédiction, l'emplacement trouvé et le score.
- `status` : ligne « lecture : n exactes / N » dès qu'une prédiction de lecture est révélée.
- §1 d'AGENTS (prédiction) mentionne le type `lecture` : la prédiction se fait avant toute recherche (`grep`, ouverture de fichier) dans la source.

## Acceptance Criteria

- [ ] Given une racine inexistante, when `predict --type lecture --root /nope …`, then exit 1 et rien n'est écrit.
- [ ] Given une prédiction `lib/route.js:100` et `--found lib/route.js:107`, when `--reveal`, then le score est `exact`.
- [ ] Given une prédiction `lib/route.js` sans ligne et `--found lib/reply.js:12`, when `--reveal`, then le score est `dossier`.
- [ ] Given `--found lib/route.js:99999` (au-delà de la fin), when `--reveal`, then exit 1 et la prédiction reste non révélée.
- [ ] Given `--found ../../etc/passwd:1`, when `--reveal`, then exit 1 (hors racine, liens symboliques compris).
- [ ] Given une phase `predictionsRequired: {lecture: 2}` et une seule prédiction révélée, when `verify`, then la phase reste bloquée pour une prédiction `lecture` manquante.
- [ ] Given une prédiction révélée, when `status`, then la ligne « lecture » apparaît.

## Edge Cases

- Racine présente à la prédiction, absente au reveal (machine différente) : refus du reveal avec la racine nommée.
- Chemins Windows (`\`) : normalisés comme pour `debug`.
- Racine dans `node_modules/` du projet : acceptée (c'est le cas de framework-ts).

## Out of Scope

- Vérifier que l'emplacement trouvé est le bon : la cognition reste non prouvée, l'outil vérifie seulement qu'il existe.
- La carte du code (12.02).
