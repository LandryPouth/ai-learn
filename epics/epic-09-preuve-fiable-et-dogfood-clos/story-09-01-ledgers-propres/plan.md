# Plan — Story 09.01

## Implementation Context

Fichiers probables :

- bin/lib/tracks/store.js (nouveau : point d'écriture unique `writeLedgerFile`, filet `NODE_TEST_CONTEXT`)
- bin/lib/tracks/git.js, bin/lib/tracks/tests.js, bin/lib/tracks/domain.js (écritures via `store.js`)
- bin/lib/ledgers.js (nouveau : `repairLedgers`, `syncProjectLedgers`)
- bin/lib/verify.js (les trois `catch {}` → avertissement)
- bin/lib/update.js (appel `syncProjectLedgers`)
- bin/lib/check.js (avertissement « progression absente »)
- bin/ai-learn.js (sous-commande `ledgers`)
- test/helpers.js, test/next.test.js, test/check.test.js, test/verify.test.js, test/status.test.js, test/cli.test.js (passer un `home` isolé partout)
- test/ledgers.test.js (nouveau)

Ancres : `writeDomainLedger`, `tracksHome`, `syncGitTrack`, `syncTestsTrack`, `syncDomainLedger`, `ledger sync failing is never a reason to fail verify`, `homeEnvOverrides`, `withHome`

Mode : `STRICT` · scout pre-step : `no`

À éviter : changer le format des ledgers (v1 conservée) ; toucher le vrai `~/.ai-learn` depuis un test.

## Decisions

- **Filet en production plutôt que discipline de test seule** : la pollution est revenue deux fois après un nettoyage manuel ; une règle qui dépend de chaque futur test oubliera un appel. `NODE_TEST_CONTEXT` est posé par `node --test` dans chaque processus de test ; `os.userInfo().homedir` lit le compte système, pas `HOME`, donc un test qui oublie d'isoler échoue.
- **Recalcul des tiers depuis les preuves restantes** : les tiers stockent déjà leurs preuves (`evidence[]` avec `project`) ; retirer les preuves des projets disparus puis `achieved = evidence.length > 0` suffit, sans rejouer les évaluations.
- **`ledgers` est de la machinerie** : appelé par `update` et par l'agent ; il n'entre pas dans les commandes de l'apprenant (cohérent avec l'epic 10).
- **Avertir sans bloquer** une synchronisation ratée : la preuve de phase reste le contrat de `verify` ; le ledger est secondaire mais ne doit plus être muet.

## Test Plan

Unitaires `store.js` (filet actif / inactif, home réel / isolé) ; `repairLedgers` sur fixtures (projets existants / disparus, tiers recalculés, `.bak`, `--dry-run`, ledger corrompu) ; `syncProjectLedgers` (ajout, idempotence) ; `verify` avec un ledger en lecture seule (chmod) ; `check` avant/après `--sync`. Revue des tests existants qui appellent `verifyCommand` sans `home` : les corriger tous (le filet les fera échouer).

## Acceptance Traceability

| Critère | Preuve |
|---|---|
| filet | test/ledgers.test.js::ledger writes refuse the real home under the test runner |
| home réel intact | test/ledgers.test.js::the suite never touches the real ~/.ai-learn (sentinelle) + Result |
| échec visible | test/verify.test.js::a failing ledger sync is reported, the phase stays done |
| repair | test/ledgers.test.js::repair drops vanished projects and recomputes tiers |
| dry-run | test/ledgers.test.js::repair --dry-run writes nothing |
| sync | test/ledgers.test.js::sync replays a project's passing evidence idempotently |
| check | test/check.test.js::a proven project missing from the ledgers is warned |
| dirigeant | test/mode.test.js::dirigeant refuses after a repair leaves no real evidence |

## Commands

```
npm test
```
