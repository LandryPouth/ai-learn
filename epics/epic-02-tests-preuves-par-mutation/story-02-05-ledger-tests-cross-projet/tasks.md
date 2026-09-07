# Tasks — Story 02.05

## Pre-Implementation

- [ ] Lire `plan.md` et le `## Result` de story-02-03 (forme de
      `evidence.mutation` à lire)
- [ ] Relire `bin/lib/tracks/git.js` en entier (gabarit à dupliquer) et
      `test/tracks-git.test.js` (structure de test à reproduire, y compris
      `tmpHome()`)
- [ ] Relire `bin/lib/progress.js#findEvidence`/`latestEvidenceForPhase` (base
      de `allEvidenceForPhase`)

## Implementation Tasks

- [ ] Ajouter `allEvidenceForPhase(dir, phaseId)` dans `progress.js`
- [ ] Créer `bin/lib/tracks/tests.js` : schéma versionné/validé, 6 tiers
      définis (voir Decisions du plan), lecture/écriture home-scopées
      injectables
- [ ] Implémenter la détection de chacun des 6 tiers depuis
      `allEvidenceForPhase`/`config.projects`
- [ ] Écrire `syncTestsTrack({ dir, phase, verifyEvidence, home })`
- [ ] Appeler `syncTestsTrack` depuis `verify.js`, dans son propre bloc
      `try/catch` isolé, à côté de `syncGitTrack`/`syncDomainLedger`

## Testing Tasks

- [ ] Créer `test/tracks-tests.test.js` (tous les cas du Test Plan de `plan.md`)
- [ ] Étendre `test/verify.test.js` (intégration + isolation d'échec)
- [ ] Justifier dans le `## Result` toute modification d'un test existant

## Validation Tasks

- [ ] `npm test`
- [ ] `node bin/ai-learn.js verify <id> --dir <projet-temporaire>` avec `$HOME`
      isolé, deux runs successifs, inspecter
      `$HOME/.ai-learn/tracks/tests.json`

## Result

### Rollback Notes
