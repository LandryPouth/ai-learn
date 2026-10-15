# Tasks — Story 02.05

## Status: done

## Pre-Implementation

- [x] Lire `plan.md` et le `## Result` de story-02-03 (forme de
      `evidence.mutation` à lire)
- [x] Relire `bin/lib/tracks/git.js` en entier (gabarit à dupliquer) et
      `test/tracks-git.test.js` (structure de test à reproduire, y compris
      `tmpHome()`)
- [x] Relire `bin/lib/progress.js#findEvidence`/`latestEvidenceForPhase` (base
      de `allEvidenceForPhase`)

## Implementation Tasks

- [x] Ajouter `allEvidenceForPhase(dir, phaseId)` dans `progress.js`
- [x] Créer `bin/lib/tracks/tests.js` : schéma versionné/validé, 6 tiers
      définis (voir Decisions du plan), lecture/écriture home-scopées
      injectables
- [x] Implémenter la détection de chacun des 6 tiers depuis
      `allEvidenceForPhase`/`config.projects`
- [x] Écrire `syncTestsTrack({ dir, phase, verifyEvidence, home })`
- [x] Appeler `syncTestsTrack` depuis `verify.js`, dans son propre bloc
      `try/catch` isolé, à côté de `syncGitTrack`/`syncDomainLedger`

## Testing Tasks

- [x] Créer `test/tracks-tests.test.js` (tous les cas du Test Plan de `plan.md`)
- [x] Étendre `test/verify.test.js` (intégration + isolation d'échec)
- [x] Justifier dans le `## Result` toute modification d'un test existant

## Validation Tasks

- [x] `npm test`
- [x] Deux runs successifs de `verify` avec `$HOME` isolé couverts par les tests
      d'intégration de `test/verify.test.js`

## Result

Ledger `~/.ai-learn/tracks/tests.json` livré, calqué sur `tracks/git.js`, nourri
uniquement par des évidences déjà sur disque.

- `bin/lib/tracks/tests.js` (nouveau) : schéma versionné/validé, 6 tiers (voir
  Decisions du plan), `observePhase` (pur) + `syncTestsTrack`, appelé depuis
  `verify.js` dans son propre `try/catch`, seulement si `ok === true`.
- `bin/lib/progress.js` : `allEvidenceForPhase` (évidences d'une phase, plus
  ancienne d'abord).
- Écart au plan, nécessaire au tier 4 (voir Decisions du plan) :
  `killedOperators` (ids triés) ajouté à `mutationReport`/`emptyMutationReport`
  et à l'évidence de `verify.js`. Champ additif.
- Tier 5 observé par deux évidences à 100 % de `sourceHash` différents (tous
  deux renseignés) ; tier 6 par `projects[dir].tiersAchieved` (tier 2) sur >= 2
  projets.
- Tests : `test/tracks-tests.test.js` (nouveau) + 3 tests d'intégration dans
  `test/verify.test.js`. Trois assertions de `test/mutate.test.js` modifiées
  (forme exacte de `emptyMutationReport`/`mutationReport` : nouveau champ
  `killedOperators: []`) — seul changement de test existant.
- Limite connue : si `.ai-learn/runs/` est nettoyé, un tier « rouge d'abord »
  non encore synchronisé ne peut plus être observé ; un tier déjà acquis ne
  régresse jamais.
- Limite connue : les projets sont identifiés par leur chemin `dir` ; un même
  projet copié/déplacé compte deux fois pour le tier 6 (idem `git.json`).
- Aucun affichage dans `status`/`check`, par symétrie avec `git.json`.
- Review : pass (0 P0/P1), corrections P2/P3 appliquées.

### Rollback Notes

Retirer `bin/lib/tracks/tests.js`, l'import + le bloc `syncTestsTrack` de
`verify.js`, `allEvidenceForPhase` et `killedOperators` (mutate.js/verify.js). Un
`tests.json` déjà écrit reste un fichier inoffensif.
