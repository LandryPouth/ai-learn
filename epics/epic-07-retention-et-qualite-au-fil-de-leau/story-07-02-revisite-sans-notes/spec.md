# Story 07.02 — `verify --revisit` : rejouer sans notes, oubli signalé

## Goal

`ai-learn verify <id> --revisit` rejoue le checkpoint d'une phase prouvée et trace dans l'évidence qu'il s'agit d'une revisite ; `check` signale une phase verte depuis trop longtemps.

## Risk

Invariant : `verify` garde le monopole de `done`.

## Acceptance Criteria

- [ ] Given une phase `done`, when `verify <id> --revisit` réussit, then l'évidence porte `revisit: true` et `lastProvenAt` est rafraîchi.
- [ ] Given `--revisit` sur une phase non `done`, when il tourne, then erreur d'usage claire, rien d'écrit.
- [ ] Given `AGENTS-apprentissage.md`, when on lit le nouveau paragraphe de revisite, then il impose de refaire la phase sans relire notes ni journal de prédictions.
- [ ] Given `check`, when une phase `done` dépasse `reviewAfterDays` sans revisite, then un warning la nomme (jamais une erreur).
- [ ] Given un échec de revisite, when `verify --revisit` échoue, then la phase `done` reste `done` (la revisite ne rétrograde pas) mais l'échec est tracé dans l'évidence.

## Edge Cases

- [ ] Aucun cas limite propre à cette story au-delà des critères.

## Out of Scope

- [ ] bin/lib/mutate.js
