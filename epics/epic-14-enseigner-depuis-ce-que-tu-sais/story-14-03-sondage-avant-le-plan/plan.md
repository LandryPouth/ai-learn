# Plan — Story 14.03

## Implementation Context

Fichiers probables :

- bin/lib/probe.js (nouveau : `probe.json`, validation, résumé par brin, résolution des citations)
- bin/lib/check.js (citations « Acquis au sondage »), bin/lib/init.js (ne pas écraser `.ai-learn/probe.json`)
- bin/ai-learn.js (`probe`, `probe record`)
- commands/learn.md (étape 3 bis, règle « ne jamais réapprendre »), commands/references/sonde.md (nouveau), templates/plan-apprentissage.md (section)
- test/probe.test.js, test/check.test.js, test/init.test.js

Ancres : `## 3. Poser les questions de cadrage`, `### Ne jamais réapprendre un concept déjà maîtrisé ailleurs`, `findRealFileLine` (modèle de résolution)

Mode : `STANDARD` · scout pre-step : `no`

À éviter : `predictions.js` (le sondage n'est pas une prédiction de phase : il existe avant `progress.json`).

## Decisions

- **Fichier à part, pas un type de prédiction** : `predictions.json` et ses comptes sont liés aux phases ; le sondage précède les phases.
- **Le plus faible l'emporte par brin** : sauter un brin à tort coûte plus cher que le revoir.
- **8 questions au plus** : le sondage ne doit pas devenir un examen (LearnHarness : « mesurer, pas explorer »).

## Test Plan

Dossier temporaire sans `progress.json` ; fixtures de plan avec et sans section ; `init` après sondage.

## Acceptance Traceability

| Critère | Preuve |
|---|---|
| création avant init | test/probe.test.js::a probe entry is recorded before init |
| verdict inconnu | test/probe.test.js::an unknown verdict is refused |
| init conserve | test/init.test.js::init keeps an existing probe file |
| citation fragile | test/check.test.js::a plan citing a fragile probe entry is an error |
| id absent | test/check.test.js::a plan citing a missing probe id is an error |
| section manquante | test/check.test.js::a probed project without the section warns |
| résumé | test/probe.test.js::the weakest verdict wins per strand |

## Commands

```
npm test
```
