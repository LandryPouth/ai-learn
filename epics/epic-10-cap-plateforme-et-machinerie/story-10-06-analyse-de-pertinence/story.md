# Story 10.06 — Analyse de pertinence avant de monter un parcours

## Goal

Avant tout `ai-learn init`, `/learn` montre en une fois pourquoi ce projet vaut le temps de l'apprenant — ce qu'il apprend de nouveau, ce qu'il a déjà, ce que ça coûte face à son temps disponible, à quoi ça sert dans ses projets réels — et attend **une seule** validation. Un projet redondant ou trop gros est réduit avant d'être monté, pas après.

## Acceptance Criteria

- [ ] Given `commands/learn.md`, when on le lit, then une section « Analyse de pertinence » précède le scaffolding et liste : compétences nouvelles, déjà acquises (lues dans les ledgers domaine/plateforme/tests/git/debug), prérequis manquants, lien avec `profile.projects`, estimation en jours rapportée à `profile.dailyMinutes`, et un classement essentiel / utile / différable / hors périmètre.
- [ ] Given la section, when on la lit, then elle impose une seule question de validation et interdit d'appeler `ai-learn init` avant la réponse.
- [ ] Given un projet dont tous les concepts sont déjà `achieved` dans le ledger de domaine, when on lit la règle, then `/learn` doit proposer une version réduite ou un autre projet plutôt que le monter.
- [ ] Given `ai-learn init --pertinence <fichier>`, when il tourne, then le fichier est copié dans `docs/plans/pertinence.md` et référencé dans `progress.json` (`pertinence`).
- [ ] Given un `progress.json` qui référence `pertinence` vers un fichier absent, when `ai-learn check`, then erreur nommant le fichier ; un projet sans champ `pertinence` n'est jamais signalé (rétro-compatible).
- [ ] Given `commands/references/propose.md`, when `/learn` monte un projet proposé, then la même analyse passe avant `init` (le flux automatique garde une validation unique).

## Implementation Context

Mode : `FAST` · scout pre-step : `no`

Fichiers probables :

- commands/learn.md, commands/references/propose.md
- bin/lib/init.js (`--pertinence`), bin/lib/progress.js (champ optionnel), bin/lib/check.js
- test/init.test.js, test/check.test.js, test/commands.test.js

Ancres : `--doc-source`, `validateProgress`, `Ne jamais réapprendre un concept déjà maîtrisé`

À éviter : tout calcul automatique de « pertinence » dans le moteur — l'analyse est faite par l'agent ; le moteur garantit seulement qu'elle existe.

## Decisions

- Contrat présence seulement (comme les artefacts) : le moteur ne juge pas la qualité de l'analyse.
- Les couches pédagogiques (mécanisme → expérience minimale → tests → échecs → framework → comparaison) entrent dans cette section comme **guide** de séquençage des phases, jamais comme règle obligatoire.

## Tests

- `test/commands.test.js::learn runs a single-validation relevance analysis before init`
- `test/init.test.js::init --pertinence copies and references the analysis`
- `test/check.test.js::a missing referenced pertinence file is an error`
- `test/check.test.js::a progress without pertinence is never flagged`

## Commands

```
npm test
```

## Result
