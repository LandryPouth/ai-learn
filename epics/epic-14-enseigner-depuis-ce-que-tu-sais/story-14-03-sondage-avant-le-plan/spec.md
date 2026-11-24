# Spec — Story 14.03 — Sonder ce que l'apprenant sait avant de planifier

## User Value

Avant de proposer un plan, `/learn` pose quelques questions courtes sur les notions dont le projet dépend et cherche où s'arrête le raisonnement de l'apprenant. Le plan saute ce qu'il sait déjà (avec la preuve du sondage) et commence là où il bute, au lieu de partir de zéro ou d'une déclaration.

## Requirements

- Flux `commands/references/sonde.md`, appelé par `/learn` entre l'étape 3 (cadrage) et l'étape 4 (plan) : pour chaque **brin** (notion dont le but dépend), une recherche du plancher (ce dont il sait partir) et du plafond (où il lâche), en commençant près du haut ; questions courtes qui font diverger les modèles mentaux ; confiance demandée (14.01). Budget : 8 questions au plus, sautable si l'apprenant le demande (le plan le dit alors).
- `ai-learn probe record --strand "<brin>" --question "<…>" --answer "<…>" --confidence <0-100> --verdict acquis|fragile|absent [--dir]` : écrit `.ai-learn/probe.json` (`version: 1`), créé à la demande **avant** `init` ; `init` le conserve. `ai-learn probe [--json]` le résume par brin.
- Le plan (`docs/plans/plan-apprentissage.md`) gagne une section « Acquis au sondage » : chaque brin sauté cite les ids d'entrées `acquis`.
- `check` : une citation de sondage qui ne se résout pas dans `probe.json`, ou qui pointe une entrée non `acquis`, est une erreur ; un plan sans section « Acquis au sondage » alors que `probe.json` existe est un warning.
- La règle existante « Ne jamais réapprendre un concept déjà maîtrisé ailleurs » (`commands/learn.md`) cite désormais le sondage comme source, en plus du ledger de domaine.

## Acceptance Criteria

- [ ] Given aucun `progress.json`, when `probe record`, then `.ai-learn/probe.json` est créé avec l'entrée.
- [ ] Given `--verdict peut-etre`, when `probe record`, then exit 1.
- [ ] Given un `probe.json` puis `init`, when on relit `.ai-learn/probe.json`, then il est intact.
- [ ] Given un plan qui cite une entrée `fragile` comme acquise, when `check`, then erreur nommant l'id.
- [ ] Given un plan qui cite un id absent, when `check`, then erreur.
- [ ] Given `probe.json` et un plan sans section « Acquis au sondage », when `check`, then warning.
- [ ] Given `probe --json`, when 3 entrées sur 2 brins, then le résumé donne un verdict par brin (le plus faible l'emporte).

## Edge Cases

- Sondage sauté : aucun `probe.json`, aucun warning.
- Même brin, verdicts contradictoires : le plus faible (`absent` < `fragile` < `acquis`) l'emporte ; un brin n'est sautable que si toutes ses entrées sont `acquis`.

## Out of Scope

- Un agent séparé pour sonder (LearnHarness sépare prober et teacher) : un flux de référence suffit dans une session d'agent généraliste.
- Prouver que le verdict est juste : comme la note /10, c'est le jugement de l'agent, rendu visible et citable.
