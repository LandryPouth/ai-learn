# Tasks — Story 02.04

## Status: done

## Pre-Implementation

- [x] Lire `plan.md` et le `## Result` de story-02-03 (forme de
      `evidence.mutation` à consommer)
- [x] Relire `bin/lib/check.js` (patron `normReport` + comparaison `sourceHash`
      par phase) et `bin/lib/status.js` (affichage `norm` + sortie `--json`)
      en entier

## Implementation Tasks

- [x] Enrichir le message de péremption de `check.js` pour mentionner la
      mutation quand `phase.mutation === true`
- [x] Ajouter la ligne de résumé mutation par phase dans `status.js`
      (score / aucun site / non mesuré)
- [x] Ajouter le champ `mutation` par phase dans la sortie `status --json`

## Testing Tasks

- [x] Étendre `test/check.test.js` (tous les cas du Test Plan de `plan.md`,
      y compris le comptage d'appels à `runCommand`/`spawnSync`)
- [x] Étendre `test/status.test.js` (affichage texte + `--json`)
- [x] Justifier dans le `## Result` toute modification d'un test existant

## Validation Tasks

- [x] `npm test`
- [x] `node bin/ai-learn.js check --root .` (temps d'exécution comparable à
      avant la story — pas de nouveau checkpoint lancé)
- [x] `node bin/ai-learn.js status --dir <projet-temporaire> --json` et
      inspecter le champ `mutation`

## Result

**Résumé.** `ai-learn check` et `ai-learn status` rendent désormais l'état de
mutation visible sans lancer `verify` : `check` enrichit son message de
péremption existant (`sourceHash`, epic 01) d'une clause explicite quand
`phase.mutation === true`, sans jamais recalculer la mutation elle-même ni
lancer de commande de checkpoint supplémentaire (contrat de vitesse
préservé) ; `status` affiche une ligne dédiée par phase concernée
(`mutation : N % (K tués / M)` ou `mutation : aucun site mutable`) et le même
résumé sous `status --json` (`mutation: { required, score, killed, mutants }`
ou `null` si `phase.mutation` n'est pas déclaré).

**Implémentation.** `bin/lib/status.js` gagne deux fonctions pures partagées
par le texte et le JSON : `measuredMutation(phase, ev)` (lit
`ev.mutation` sur la dernière évidence *passante*, ne retourne quelque chose
que si `ev.mutation.required` est vrai — distingue « mesuré, zéro site » de
« jamais mesuré »), et à partir d'elle `formatMutationLine`/`mutationSummary`
(mêmes calques rendu-texte / forme-JSON déjà utilisés ailleurs dans ce
fichier, ex. `verdictDisplay`). `bin/lib/check.js` ajoute une clause
conditionnelle au message de péremption déjà existant (aucune nouvelle
branche de calcul).

**Décisions non prévues au plan.** Voir `plan.md` → Decisions : (1) le
scénario « score de 80 % dans la dernière évidence passante » de l'AC #3 de
`spec.md` n'est pas atteignable via un vrai `verify` (une évidence passante a
`mutation.ok: true`, donc `score` ∈ `{100, null}` par construction) — le test
qui le prouve fabrique l'évidence directement, même technique déjà en usage
dans `test/check.test.js` pour simuler une évidence éditée à la main ; (2) la
forme JSON pour « jamais mesuré » (`phase.mutation: true` sans évidence
qualifiante) est `{ required: true, score: null, killed: 0, mutants: 0 }`
plutôt qu'un objet partiel, pour respecter « jamais un objet à moitié
rempli » du plan.

**Fichiers modifiés.**
- `bin/lib/status.js` — `measuredMutation`, `formatMutationLine`,
  `mutationSummary` ajoutés et exportés ; `printStatus` affiche la ligne
  mutation par phase ; `buildStatusReport` ajoute le champ `mutation` par
  entrée de phase.
- `bin/lib/check.js` — le message de péremption existant gagne une clause
  mutation conditionnelle (`phase.mutation === true`).
- `test/status.test.js` — 21 tests ajoutés (9 unitaires sur
  `formatMutationLine`/`mutationSummary`, 7 d'intégration via un vrai
  `verifyCommand`).
- `test/check.test.js` — 5 tests ajoutés (silence si valide, clause de
  péremption, non-régression sans mutation, cohérence sur un `done` forcé à
  la main, aucune commande de checkpoint lancée).
- `epics/epic-02-tests-preuves-par-mutation/story-02-04-audit-mutation-check-status/{spec,plan}.md` —
  cases cochées, Decisions ajoutées.

**Tests existants modifiés.** Aucun — uniquement des ajouts dans
`test/status.test.js` et `test/check.test.js`.

**Tests exécutés.**
- `node --test test/status.test.js test/check.test.js` → 99/99, 0 échec.
- `npm test` → 486/486, 0 échec (aucune régression ; 465 avant cette story).
- Preuve négative : les 21 tests nouveaux échouent (14 non-trivialement,
  `not ok`) quand `bin/lib/status.js`/`bin/lib/check.js` sont remis à l'état
  d'avant cette story (`git stash` sur ces deux fichiers seuls) — confirmés
  load-bearing, pas des tautologies.
- `ai-flow verify --story <dir>` → vert (`npm test`, 1 commande). Coverage
  gate : `not-required` (risque jugé faible par le harness — aucun trust
  boundary, lecture seule) ; les critères d'acceptation de `spec.md` n'étaient
  pas encore cochés au moment du run, cochés dans cette même passe juste
  après (voir ci-dessus).
- `ai-flow harness check --story <dir>` → passed (143 fichiers scannés).
- Vérification manuelle via le vrai binaire CLI sur un projet temporaire :
  `node bin/ai-learn.js verify 0 --dir <tmp>` (phase `mutation: true`, un
  littéral booléen tué) → `Phase 0 marked done.` ; puis `node bin/ai-learn.js
  status --dir <tmp>` → ligne `mutation : 100 % (1 tués / 1)` sous la phase ;
  `node bin/ai-learn.js status --dir <tmp> --json` → champ `mutation` exact
  (`{"required":true,"score":100,"killed":1,"mutants":1}`).
- `node bin/ai-learn.js check --root .` sur ce dépôt lui-même : ce dépôt
  n'est pas lui-même un projet d'apprentissage (aucun `progress.json` à sa
  racine — c'est l'outil `ai-learn`, pas un parcours) : `check --root .`
  répond « No learning projects », exit 0, sans lancer aucune commande —
  cohérent, mais ne teste pas le chemin mutation. Le contrat de vitesse
  (« pas de checkpoint additionnel ») est prouvé par le test unitaire
  `check never launches a checkpoint command to audit mutation` (spy sur
  `child_process.spawnSync`, 0 appel), pas par cette commande manuelle.

### Rollback Notes

Retirer `measuredMutation`/`formatMutationLine`/`mutationSummary` de
`status.js`, leur appel dans `printStatus`/`buildStatusReport`, et la clause
mutation conditionnelle du message de péremption de `check.js`. Lecture
seule, aucune donnée persistante modifiée par cette story — un `git revert`
suffit.
