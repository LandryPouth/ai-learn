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

- **Isolation des tests par `test/helpers.js`** (ajout pendant l'exécution) : ~90 appels de test (verify, check, next, status) n'injectaient pas `home`. Plutôt que de corriger chaque appel, `helpers.js` redirige `HOME`/`USERPROFILE` vers un dossier jetable par processus de test ; le filet de `store.js` reste pour tout fichier qui ne charge pas `helpers.js`.
- **Clé de projet normalisée** (revue) : `projectKey` (realpath, casse repliée sous Windows) est la seule orthographe d'un projet dans les trois ledgers, sinon un lien symbolique compte comme un second projet et donne le tier 6 seul.
- **Rejeu restreint** (revue) : `--sync` ne rejoue que la dernière preuve passante d'une phase encore `done`, sous le checkpoint actuel. `update` ne synchronise que les projets absents d'un ledger (le rejeu relit git/`gh` et parcourt les sources). Risque résiduel assumé : une évidence écrite à la main dans `.ai-learn/runs/` reste lue — c'était déjà vrai de `syncTestsTrack` à chaque `verify` ; le guard protège `.ai-learn/runs/` là où il est actif.
- **Repair ne fait que baisser** (revue) : `achieved = achieved && encore prouvé` ; un tier déclaré sans preuve est remis à faux même si aucun projet n'a disparu. Un dossier n'est « disparu » que sur `ENOENT` (un chemin illisible ou démonté est gardé). Un concept de domaine dont le premier projet a disparu est retiré ; un autre projet qui l'utilise le regagne à son prochain `verify`/`--sync`.

- **Un ledger illisible n'est jamais réécrit, par personne** (revue) : la garde est au point d'écriture unique, pas seulement dans `repair` ; `readOrDefault*` garde son repli en lecture (contrat testé), c'est l'écriture qui refuse.
- **Clés canonisées à la lecture** (revue) : plutôt qu'une migration, chaque sync et `repair` réécrivent les projets à leur `projectKey` et fusionnent les doublons (tableaux unis, `lastSyncedAt` le plus récent, évidences dédoublonnées par projet/phase/type).

## Test Plan

Unitaires `store.js` (filet actif / inactif, home réel / isolé) ; `repairLedgers` sur fixtures (projets existants / disparus, tiers recalculés, `.bak`, `--dry-run`, ledger corrompu) ; `syncProjectLedgers` (ajout, idempotence) ; `verify` avec un ledger en lecture seule (chmod) ; `check` avant/après `--sync`. Revue des tests existants qui appellent `verifyCommand` sans `home` : les corriger tous (le filet les fera échouer).

## Acceptance Traceability

| Critère | Preuve |
|---|---|
| filet | test/ledgers.test.js::ledger writes refuse the real home under the test runner |
| home réel intact | empreinte sha256 de `~/.ai-learn` avant/après `npm test` (Result) + test/helpers.js (HOME isolé par processus de test) |
| échec visible | test/verify.test.js::a failing ledger sync is reported, the phase stays done |
| repair | test/ledgers.test.js::repair drops vanished projects and recomputes tiers |
| dry-run | test/ledgers.test.js::repair --dry-run writes nothing |
| sync | test/ledgers.test.js::sync replays a project's passing evidence idempotently |
| check | test/ledgers.test.js::a proven project missing from the ledgers is warned until it is synced |
| dirigeant | test/mode.test.js::dirigeant refuses after a repair leaves no real evidence |

## Commands

```
npm test
```
