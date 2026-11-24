# Plan — Story 13.02

## Implementation Context

Fichiers probables :

- bin/lib/predictions.js (`importLegacyJournal`, réutilise `validatePredictionsData`, `syncJournalRender`)
- bin/lib/check.js (extraire le parseur du journal près de la ligne 1059 pour le partager ; warning « entrées non importées »)
- bin/ai-learn.js (`--import-md`, `--dry-run`)
- test/predictions.test.js, test/check.test.js, test/fixtures/legacy-predictions.md

Ancres : `### Phase <N> — prédiction`, `readPredictions`, `recordPrediction`, `syncJournalRender`, `isCountedPrediction`

Mode : `STANDARD` · scout pre-step : `no`

À éviter : `memory.js` (indépendant), le format de rendu du `.md`.

## Decisions

- **Le parseur quitte `check.js` pour `predictions.js`** : deux lecteurs du même format ne doivent pas diverger (règle « source unique » de `predictionsReport`). `check.js` l'importe.
- **`at == revealedAt`** : l'ordre prédiction < révélation n'est pas prouvable pour des entrées tapées après coup ; `check` le signale déjà comme « enregistrée après coup », c'est honnête.
- **Fixture anonymisée** du vrai journal : prouve le parseur sur un texte réel, sans copier le contenu de l'apprenant dans le dépôt (on garde la forme, on remplace le fond).

## Test Plan

Fixtures `.md` : 3 entrées valides, 1 sans date, 1 « Corrigé par : IA », et la copie anonymisée de 33 entrées. Cas : import, idempotence, dry-run, sauvegarde, warning `check`, décompte `verify`.

## Acceptance Traceability

| Critère | Preuve |
|---|---|
| import | test/predictions.test.js::legacy journal entries are imported and counted |
| idempotence | test/predictions.test.js::re-importing adds nothing |
| illisible | test/predictions.test.js::dry-run lists unreadable entries and writes nothing |
| sauvegarde | test/predictions.test.js::import backs up predictions.json first |
| warning | test/check.test.js::check warns about unimported journal entries |
| journal réel | test/predictions.test.js::the anonymised real journal yields 33 entries |

## Commands

```
npm test
```
