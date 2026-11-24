# Plan — Story 13.01

## Implementation Context

Fichiers probables :

- bin/lib/memory.js (nouveau : résolution du vault, faits d'un projet, source machine, rendu, fiche)
- bin/lib/tracks/store.js (refus du vrai vault sous `node --test`, à côté du refus du vrai home)
- bin/lib/verify.js (appel best-effort après clôture)
- bin/ai-learn.js (sous-commande `memory export|card`, `--vault`)
- README.md, docs/project-context.md (ligne « Mémoire de l'apprenant »), docs/architecture.md
- test/memory.test.js, test/verify.test.js

Ancres : `writeLedgerFile`, `assertWritable`, `realHome`, `syncEvidence`, `latestEvidenceForPhase`, `readPredictions`, `projectKey`

Mode : `STANDARD` · scout pre-step : `no`

À éviter : `guard.js` (13.03), `predictions.js` hors lecture.

## Decisions

- **Hypothèse : vault par défaut `~/dev/.ai-memory-vault`.** C'est le chemin fixe du contrat du vault ; sur une machine sans vault, la mémoire reste dans `~/.ai-learn/memory/`.
- **Rendu complet à chaque export** (pas d'incrément) : déterministe, idempotent, rien à réconcilier. Le volume (dizaines de projets) le permet.
- **Pas de texte brut de prédiction dans le vault** : le vault est poussé sur GitHub (privé) et son contrat interdit code et transcriptions. On exporte des nombres et, à partir de 13.04, des catégories.
- **La fiche se calcule depuis la source machine, pas depuis le vault** : `memory card` marche sans vault et ne peut pas être influencée par une édition à la main du Markdown.

## Test Plan

Home et vault injectés dans un dossier temporaire. Fixtures : deux projets minimaux (`progress.json`, `predictions.json`, une évidence de run). Cas : rendu par projet, agrégat, vault absent, fichier non généré préservé, refus du vrai vault sous test, `verify` vert malgré un vault en lecture seule, absence de chemins absolus et de texte de prédiction, fiche ≤ 10 lignes.

## Acceptance Traceability

| Critère | Preuve |
|---|---|
| rendu par projet | test/memory.test.js::export renders proven phases and mean score per project |
| agrégat | test/memory.test.js::the card aggregates every exported project |
| vault absent | test/memory.test.js::no vault keeps the machine source and exits 0 |
| fichier non généré | test/memory.test.js::a hand-written vault file is never overwritten |
| vrai vault sous test | test/memory.test.js::the real vault is refused under node --test |
| verify best-effort | test/verify.test.js::a failing memory export only warns |
| pas de fuite | test/memory.test.js::the vault never holds absolute paths or prediction text |
| fiche courte | test/memory.test.js::the card is ten lines at most |

## Commands

```
npm test
```
