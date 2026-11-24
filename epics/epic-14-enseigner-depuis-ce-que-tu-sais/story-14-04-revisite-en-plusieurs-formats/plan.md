# Plan — Story 14.04

## Implementation Context

Fichiers probables :

- bin/lib/revisit.js (`--format`, branche `alterne` sans retrait de code, état de la revisite ouverte)
- bin/lib/revisit-formats.js (nouveau : choix de la seconde cible, du mode, du gabarit, rotation des formats)
- bin/lib/predictions.js (type `alterne`, champs `targets`/`mode`/`template`), bin/lib/verify.js (`--revisit` d'une revisite `alterne`)
- bin/lib/next.js (format proposé), bin/lib/status.js, bin/ai-learn.js
- templates/AGENTS-apprentissage.md, commands/learn-next.md, README.md, docs/pedagogie.md, docs/project-context.md
- test/revisit.test.js, test/revisit-formats.test.js, test/next.test.js, test/predictions.test.js, test/status.test.js

Ancres : `revisitCommand`, `startRevisit`, `completeRevisit`, `revisitNotice`, `analyzeDonePhases`, `isCountedPrediction`

Mode : `STANDARD` · scout pre-step : `no`

À éviter : la logique de retrait/restauration de `src/**` (format `code`) ; elle doit rester identique.

## Decisions

- **Une revisite, plusieurs formats** plutôt qu'une commande `practice` : l'espacement, l'offre dans `next` et la preuve par `verify --revisit` existent déjà ; la pratique alternée n'ajoute qu'un format. Pas de nouvelle offre, donc pas de nouveau geste dans le budget de friction.
- **Hypothèse : réussite à 7/10**, même seuil que la calibration de 14.01.
- **Rotation des formats** plutôt que choix par faiblesse : simple et déterministe ; la pondération par les faiblesses viendra de 13.04.
- Idées de LearnHarness (alternance, gabarits) reformulées, jamais copiées (AGPL).

## Test Plan

Projet fixture à 4 phases prouvées (une périmée) ; historique de revisites alternées notées ; générateur injectable ; tests existants de `revisit` relancés tels quels.

## Acceptance Traceability

| Critère | Preuve |
|---|---|
| une phase | test/revisit-formats.test.js::an alternating revisit needs two proven phases |
| cibles | test/revisit-formats.test.js::the second target skips stale phases and the revisited one |
| mode | test/revisit-formats.test.js::a recall scored eight moves to discrimination |
| pas de retrait | test/revisit.test.js::an alternating revisit never touches src |
| verify | test/revisit.test.js::an alternating revisit passes at seven out of ten |
| rotation | test/next.test.js::next rotates the revisit format |
| défaut inchangé | test/revisit.test.js (tests existants) |
| déterminisme | test/revisit-formats.test.js::a fixed seed gives the same alternating revisit |

## Commands

```
npm test
```
