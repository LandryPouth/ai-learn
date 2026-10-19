# Tasks — Story 03.03

## Status: done

## Pre-Implementation

- [x] Lire `plan.md`, `RULES.md`, et les fichiers « probables » ci-dessus
- [x] Rejouer le comportement actuel sur un projet temporaire (état de départ)

## Implementation Tasks

- [x] Implémenter le plus petit changement qui satisfait les critères, dans l'ordre du plan
- [x] Trancher chaque « Décision à prendre » dans `plan.md` avant d'écrire le code concerné

## Testing Tasks

- [x] Écrire les tests du Test Plan (rouge d'abord pour toute logique de décision)
- [x] Remplir la table `Acceptance Traceability` avec les vrais `file::test`

## Validation Tasks

- [x] `npm test`
- [x] `ai-flow verify --story <dir>`

## Result

Le tier « revue » du mode dirigeant : une phase `done` n'est prouvée que si
`docs/reviews/<brique>.md` cite un `fichier:ligne` réel (le fichier existe et
compte au moins cette ligne, chemin dans la racine du projet) et énonce une
décision (`accepter`, `rejeter`, `demander un changement`).

- `bin/lib/citation.js` (nouveau) — noyau commun extrait de
  `citesRealPRUrl` : `hasSubstantialBody` (le contenu hors ligne citante doit
  dépasser 200 caractères) et `citesWithSubstance` (citation résolue +
  substance). `citesRealPRUrl` le consomme ; `docCitesOrigin` (check.js)
  réutilise `hasSubstantialBody` — plus de plancher ni de filtre dupliqués.
  `findRealFileLine` résout un `file:line` relatif à la racine et refuse toute
  citation hors projet.
- `bin/lib/reviews.js` (nouveau) — slug du nom de phase (`Phase zero` →
  `phase-zero`, repli `phase-<id>`), `reviewState` (`missing` / `invalid` :
  `no-citation`, `no-decision`, `insufficient-substance`, `unreadable` /
  `valid`) et `reviewStates` (phases `done`).
- `bin/lib/check.js` — en mode `dirigeant`, chaque phase `done` passe par
  `checkReview` : revue absente → erreur, citation non résolue → erreur,
  décision absente → erreur, citation nue sans substance → erreur. En
  `apprenti`, le contrôle n'existe pas. Le `mode` est lu une fois via
  `loadGuardConfig` (déjà chargé pour le scope d'implémentation).
- `bin/lib/status.js` — `printReviewSummary` : en `dirigeant` seulement,
  affiche `Revues (mode dirigeant) : <valides>/<total> …` avec le détail des
  revues à revoir (`manquante`, `sans file:line réel`, `sans décision`,
  `sans substance`, `illisible`). Silencieux en `apprenti`.
- Docs — `templates/AGENTS-apprentissage.md` (encart dirigeant : contrat de
  la revue, nom dérivé du nom de phase, `check`/`status`), `README.md`.
- Tests — `test/check.test.js` : 7 tests (revue valide, revue manquante, sans
  citation, ligne inexistante, sans décision, citation nue sans substance,
  non-régression apprenti) ; `test/status.test.js` : 2 tests (compte les
  revues manquantes en dirigeant, silence en apprenti).

**Tests existants modifiés.** Aucun — seuls des ajouts.

**Revue pré-merge (2026-10-19, verdict initial `fail`).** Corrigés :

- P1 — `bin/lib/citation.js` comptait la ligne vide ouverte par le saut de
  ligne final (`split(/\r?\n/).length`), donc `fichier:<dernière+1>` résolvait.
  `countLines` retire désormais un `\r?\n` final avant découpage. Test dédié
  dans `test/citation.test.js` + cas d'intégration dans `test/check.test.js`.
- P2 — une citation vers n'importe quel fichier du dépôt (`README.md:1`)
  validait la revue. `reviewState`/`reviewStates` reçoivent maintenant le scope
  `implementationFiles` du guard, et `findRealFileLine` accepte un prédicat
  optionnel ; `check` et `status` passent ce scope. Tests : citation hors scope
  refusée, scope `lib/**` honoré.
- P3 — `inside.startsWith("..")` refusait aussi un dossier légitime nommé
  `..foo/` : containment corrigé (`inside === ".."` ou `..` + séparateur).
- P3 — le template promettait « se termine par une décision » alors que le
  contrôle est volontairement plus large (presence + substance) : formulation
  alignée sur « énonce une décision ».
- P3 — `docs/architecture.md` complété (`citation.js`, `reviews.js`, couplage
  `reviews.js → guard.js`).

**Tests exécutés.**
- `npm test` → 574/574, 0 échec (555 avant cette story, 562 à la première
  passe, 574 après les tests de revue pré-merge).
- `ai-flow verify --story <dir>` → vert, `npm test`, Coverage: `evidence`
  (fichiers de test + 4 fichiers de comportement ; aucun rapport de couverture
  émis, donc non mesuré). Les 5 critères de `spec.md` sont cochés dans la même
  passe que ce résultat.
- Vérification manuelle : un projet temporaire en `dirigeant`, phase `done`
  sans revue → `check` erreur `docs/reviews/phase-zero.md is missing` ;
  revue avec `src/index.js:3` + « Décision : accepter » → plus d'erreur de
  revue ; `status` → `Revues (mode dirigeant) : 0/1 valide(s) — 1 à revoir :
  docs/reviews/phase-zero.md (manquante)`.

### Rollback Notes

`git revert` du commit : supprimer `bin/lib/citation.js` et
`bin/lib/reviews.js`, rendre à `check.js` sa fonction `citesRealPRUrl` locale
(avec `PR_URL_RE` et `MIN_CONTENT_BEYOND_CITATION`), retirer `checkReview` et
son appel, retirer `printReviewSummary` de `status.js`, ses imports et son
appel, et les tests ajoutés. Aucune migration de données : le tier ne lit que
`docs/reviews/` et `guard.json`, rien n'est écrit. Un projet en `dirigeant`
sans revue repasse simplement silencieux.
