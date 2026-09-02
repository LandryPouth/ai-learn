# Tasks — Story 01.02

## Status: done

## Pre-Implementation

- [x] Lire `plan.md` (Implementation Context)
- [x] Relire le `## Result` de la story 01.01 (forme exacte de l'empreinte écrite)
- [x] Vérifier que `setPhaseStatus` n'a toujours qu'un seul appelant

## Implementation Tasks

- [x] Étendre l'empreinte pour porter le digest par fichier (le digest global reste
      la comparaison rapide)
- [x] Ajouter la rétrogradation `done → in_progress` sur échec dans `verify`,
      neutralisée par `--no-mark`
- [x] Ajouter `marking: "applied" | "skipped"` à l'évidence
- [x] Faire ignorer par `check` la dérive « evidence sans done » quand
      `marking === "skipped"`
- [x] Enrichir le message de péremption avec les fichiers changés et leur nombre
- [x] Faire proposer par `next` une phase périmée avant la première `pending`

## Testing Tasks

- [x] Étendre `test/verify.test.js` (6 cas)
- [x] Étendre `test/check.test.js` (6 cas)
- [x] Étendre `test/next.test.js` (3 cas)
- [x] Vérifier explicitement qu'une rétrogradation ne touche aucun ledger home-scoped

## Validation Tasks

- [x] `npm test`
- [x] `node bin/ai-learn.js check --root .`
- [x] Essai manuel : prouver → modifier → re-verify → constater la rétrogradation

## Result

**Résumé.** `verify` est maintenant le seul écrivain du statut d'une phase dans
les deux sens : un échec sur une phase `done` la rétrograde en `in_progress` avec
un message explicite (`Phase N demoted: done → in_progress — ...`), jamais vers
`pending` (le travail a eu lieu). `--no-mark` neutralise l'écriture dans les deux
sens et est maintenant identifiable dans l'évidence (`marking: "applied" |
"skipped"`), ce que `check` lit pour arrêter de signaler un `--no-mark` normal
comme dérive. L'empreinte (`source-hash.js`, story 01.01) porte désormais un
digest par fichier (`entries`) en plus du digest global — `changedSourceFiles`
en tire la liste des chemins qui diffèrent (ajout, suppression ou modification),
et le message de péremption de `check` nomme les premiers fichiers changés et
leur nombre total. `next` propose une phase périmée avant toute phase `pending`
plus loin dans le parcours (et avant même le message « parcours terminé » si
c'est la seule phase).

**Défaut trouvé et corrigé pendant la validation manuelle (hors plan initial).**
La reproduction manuelle (prouver → casser le checkpoint → re-verify) a fait
apparaître un faux positif : juste après une rétrogradation légitime, l'évidence
passante antérieure reste sur disque pendant que le statut n'est plus `done` —
exactement la forme que le warning « has passing evidence but is not marked done
(stale or reverted?) » surveille. Sans correctif, **toute** rétrogradation
déclenchait ce warning. Corrigé en ajoutant `latestAnyEvidenceForPhase` (variante
de `latestEvidenceForPhase` sans le filtre `ok === true`) à `progress.js` :
`check` ne signale la dérive que si l'évidence la plus récente pour la phase
n'est pas un échec — un échec plus récent que la preuve passante est précisément
ce qui explique légitimement l'absence de `done`, ce n'est plus une dérive
inexpliquée. Non prévu par `plan.md`, mais une conséquence directe et immédiate
du mécanisme ajouté par cette story, découverte par l'étape de validation
manuelle que `plan.md` demandait déjà — corrigé dans la même passe plutôt que
consigné dans `docs/DOGFOODING.md`, puisqu'il n'y avait pas de contournement
légitime à documenter (RULES.md : « stop and report... when the work hits a
condition the story cannot answer » ne s'applique pas ici, la story répond
directement à ce qu'elle a elle-même causé).

**Fichiers modifiés.**
- `bin/lib/source-hash.js` — `computeSourceHash` porte `entries` (digest par
  fichier) en plus de `files`/`digest` (inchangés, rétro-compatibles) ; nouvelle
  fonction `changedSourceFiles`.
- `bin/lib/progress.js` — nouvelle fonction `latestAnyEvidenceForPhase`
  (correctif du faux positif ci-dessus), exportée.
- `bin/lib/verify.js` — rétrogradation symétrique de la promotion ; champ
  `marking` écrit inconditionnellement.
- `bin/lib/check.js` — consomme `changedSourceFiles` pour le message de
  péremption enrichi ; le warning de dérive lit `marking` et
  `latestAnyEvidenceForPhase` avant de se déclencher.
- `bin/lib/next.js` — une phase au verdict `stale` devient la cible de
  `Next:`, avant la première phase non-`done`.
- `test/verify.test.js`, `test/check.test.js`, `test/next.test.js` — cas
  ajoutés ; deux tests existants modifiés (justifiés ci-dessous).

**Tests existants modifiés (justification).**
- `test/check.test.js::stale evidence on a pending phase is a warning` →
  renommé `verify --no-mark leaves passing evidence unflagged (not drift)` et
  son assertion inversée : c'est exactement le comportement que cette story
  change (Context #2 de `spec.md`) — un `--no-mark` normal ne doit plus
  déclencher la dérive.
- `test/next.test.js::next flags a stale done phase as to re-prove, not as
  finished` → renommé et son assertion `/All 1\/1 phases done/` retirée : avec
  l'ordre de `next` désormais correctif (`plan.md`, « Ordre dans next »), une
  phase périmée devient la cible de `Next:` même quand c'est la seule phase du
  ledger — le message « parcours terminé » ne s'applique plus à ce cas.

**Tests exécutés.**
- `npm test` → 332/332 (330 issus de la story 01.01 + 2 tests de non-régression
  ajoutés pour le correctif ci-dessus, en plus des cas prévus par le Test Plan),
  0 échec.
- `node bin/ai-learn.js check --root .` → exit 0 (aucun projet d'apprentissage à
  la racine de ce dépôt).
- Reproduction manuelle : `verify 0` (checkpoint passant) → `done` ; checkpoint
  modifié pour échouer ; `verify 0` → `[exit 1]`, `Phase 0 demoted: done →
  in_progress`, exit 1, `progress.json` montre `status: "in_progress"` ;
  `check --root` sur ce projet → 0 erreur, 0 warning (confirme le correctif du
  faux positif ci-dessus — avant correctif : 1 warning de dérive).
- `ai-flow verify --story epics/epic-01-verdict-fiable/story-01-02-preuve-perimee-a-reprouver`
  → `npm test` vert ; coverage `required`/`test-file` une fois les 3 fichiers de
  test pris en compte à côté des 5 fichiers de comportement modifiés, `ok: true`
  (une première exécution, avant le commit final, avait vu le risque comme trop
  faible pour exiger de la couverture — la réexécution après commit est la
  preuve qui fait foi).

### Rollback Notes

Retirer la branche de rétrogradation et le champ `marking` de `verify.js` ; le
champ `entries` de `computeSourceHash` et `changedSourceFiles` de
`source-hash.js` ; `latestAnyEvidenceForPhase` de `progress.js` ; les
consommations correspondantes dans `check.js`/`next.js`. Une phase rétrogradée
par la version précédente reste en `in_progress` — état légitime, aucune
donnée à réparer. Aucune migration : une évidence déjà écrite avec `entries`/
`marking` reste lisible par le code d'origine, qui ignore simplement ces
champs.
