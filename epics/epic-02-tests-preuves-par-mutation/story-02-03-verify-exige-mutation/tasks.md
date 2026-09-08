# Tasks — Story 02.03

## Status: done

## Pre-Implementation

- [x] Lire `plan.md` et le `## Result` de story-02-02 (moteur/config à réutiliser)
- [x] Relire `bin/lib/predictions.js#predictionsReport`/`formatPredictionsGap`
      en entier (gabarit exact à reproduire)
- [x] Relire `bin/lib/verify.js` en entier (construction de `evidence`, calcul
      de `ok`, démotion `done → in_progress`)

## Implementation Tasks

- [x] Ajouter le bloc de validation lenient `phase.mutation` dans
      `progress.js#validateProgress`
- [x] Écrire `mutationReport({ dir, phase })` et `formatMutationGap` dans
      `mutate.js`, réutilisant le moteur de 02-02
- [x] Appeler `mutationReport` dans `verify.js`, seulement si `result.ok`
- [x] Intégrer `mutationReport.ok` dans le calcul global de `ok`
- [x] Ajouter la section `mutation` à l'objet `evidence`
- [x] Vérifier que la démotion `done → in_progress` existante couvre bien le
      cas d'un mutant qui se met à survivre (elle devrait, via `ok` global —
      confirmer par test plutôt que supposer)

## Testing Tasks

- [x] Étendre `test/verify.test.js` (tous les cas du Test Plan de `plan.md`)
- [x] Ajouter le cas de validation `phase.mutation` non booléen (`test/verdict.test.js`
      ou `test/verify.test.js`, au choix du fichier existant le plus cohérent)
- [x] Justifier dans le `## Result` toute modification d'un test existant

## Validation Tasks

- [x] `npm test`
- [x] `node bin/ai-learn.js verify <id> --dir <projet-temporaire>` sur un cas
      bloquant et un cas passant

## Result

**Résumé.** `ai-learn verify <id>` bloque désormais `done` sur une phase
`mutation: true` tant qu'un mutant survit, au même titre que la norme
clean-code, les artefacts et les prédictions. `mutate.js` expose
`mutationReport({ dir, phase })` (réutilise intégralement le moteur de 02-02 —
banque d'opérateurs, config `.ai-learn/mutate.json`, plafond
`maxMutantsPerRun`) et `formatMutationGap`/`emptyMutationReport`, calqués
fonction par fonction sur `predictions.js#predictionsReport`/
`formatPredictionsGap`. `progress.js#validateProgress` gagne le même bloc de
validation lenient que `gitTier`/`stressCheckpoint` pour `phase.mutation`.
`evidence.mutation` suit exactement le schéma de `plan.md` (`{ ok, required,
mutants, killed, survived, score, truncated }`), toujours présent — jamais
absent — même pour une phase sans `phase.mutation`.

**Décision non prévue au plan — extraction de `bin/lib/exec.js`.** `mutate.js`
importait déjà `runCommand` depuis `verify.js` (02-01/02-02). Câbler
`mutationReport` dans `verify.js` comme demandé par cette story aurait ajouté
la dépendance inverse (`verify.js` → `mutate.js`), fermant un cycle de
require CommonJS à deux entrées de haut de fichier. Repéré avant d'écrire le
premier test (pas après un crash) : quel que soit le module chargé en premier
par un test (`test/verify.test.js` charge `verify.js` en premier), le second
`require()` du cycle aurait reçu les exports encore vides de l'autre module —
`mutate.js` se serait retrouvé avec `runCommand === undefined`, un crash
silencieux à la première mutation testée, indétectable à la seule lecture du
code. Corrigé en extrayant `runCommand` (primitive `spawnSync` sur le
checkpoint, inchangée) vers un nouveau module feuille `bin/lib/exec.js`,
importé par les deux fichiers ; `verify.js` réexporte toujours `runCommand`
pour ne rien changer à son API publique (confirmé qu'aucun fichier hors
`mutate.js` ne l'importait directement). Voir Decisions de `plan.md` pour le
détail complet.

**Décision non prévue au plan — `required` en identité stricte.** La première
version de `plan.md` (Technical Notes) esquissait `required:
Boolean(phase.mutation)`, mais `spec.md` (Requirements et Acceptance
Criteria) demande explicitement `phase.mutation === true` — une valeur non
booléenne doit produire un warning et ne **jamais** activer la mutation.
`Boolean("true")` (une chaîne, par exemple) vaut `true` : la coercition aurait
silencieusement activé la mutation sur une valeur invalide, contredisant l'AC
dédié. Corrigé dans `plan.md` avant d'écrire le code, même discipline que la
correction spec/plan de 02-02.

**Fichiers modifiés.**
- `bin/lib/mutate.js` — `mutationReport`, `formatMutationGap`,
  `emptyMutationReport` ajoutés et exportés ; `runCommand` importé depuis
  `./exec` au lieu de `./verify`.
- `bin/lib/exec.js` (nouveau) — `runCommand`, extrait de `verify.js`.
- `bin/lib/verify.js` — importe `runCommand` depuis `./exec` (réexporté
  inchangé) et `mutationReport`/`formatMutationGap`/`emptyMutationReport`
  depuis `./mutate` ; calcule `mutReport` juste après le bloc prédictions
  (seulement si `result.ok`), l'intègre dans `ok` et dans `evidence.mutation`,
  logue le bloc `Mutation :` (sites survécus au format
  `fichier:ligne — opérateur — SURVÉCU`, suggestion `ai-learn mutate --phase
  <id>`) et un avertissement de transparence si `truncated`.
- `bin/lib/progress.js#validateProgress` — bloc de validation lenient
  `phase.mutation` (warning si non booléen), symétrique à `gitTier`/
  `stressCheckpoint`.
- `test/mutate.test.js` — 10 tests unitaires ajoutés (`mutationReport` ×7,
  `emptyMutationReport` ×1, `formatMutationGap` ×1, et le cas
  « mutators: [] » ajouté séparément lors de la revue de 02-02), dont la
  troncature `maxMutantsPerRun` tuée/survécue.
- `test/verify.test.js` — 8 tests d'intégration ajoutés (bloc/déblocage,
  aucun site, phase sans mutation, checkpoint déjà rouge, démotion,
  `--no-mark`, troncature transparente).
- `test/check.test.js` — 1 test ajouté (`phase.mutation` non booléen → warning,
  même gabarit que le test `gitTier` existant).
- `epics/epic-02-tests-preuves-par-mutation/story-02-03-verify-exige-mutation/{spec,plan}.md` —
  incohérences spec/plan corrigées avant l'implémentation (voir ci-dessus),
  cases d'acceptation cochées.

**Tests existants modifiés.** Aucun — uniquement des ajouts dans
`test/mutate.test.js`, `test/verify.test.js`, `test/check.test.js`. Aucune
assertion préexistante changée.

**Tests exécutés.**
- `node --test test/mutate.test.js test/verify.test.js test/check.test.js` →
  146/146, 0 échec.
- `npm test` → 459/459, 0 échec (aucune régression ; 441 avant cette story).
- `ai-flow verify --story <dir>` → vert. `Coverage: evidence` (3 fichiers de
  test renforcés aux côtés de 4 fichiers de comportement modifiés ; aucun
  rapport de couverture émis par `npm test` dans ce projet, donc `verify` ne
  peut pas mesurer directement les lignes ajoutées — même limite que 02-02).
- `ai-flow harness check --story <dir>` → passed (143 fichiers scannés).
- Vérification manuelle via le vrai binaire CLI, deux projets temporaires
  (`node bin/ai-learn.js verify 0 --dir <tmp>`) :
  - Checkpoint faible (n'inspecte jamais le retour) sur un fichier à un
    littéral booléen, `mutation: true` → bloc `Mutation :` affiché,
    `src/index.js:2 — boolean-literal — SURVÉCU`, suggestion `ai-learn mutate
    --phase 0`, phase non marquée, exit 1.
  - Checkpoint fort (vérifie `isReady() === true`) sur le même fichier →
    `Phase 0 marked done.`, exit 0, `evidence.mutation` = `{ ok: true,
    required: true, mutants: 1, killed: 1, survived: [], score: 100,
    truncated: false }`, fichier source restauré à l'identique, aucun
    `.ai-learn/mutate.lock.json` résiduel.

### Rollback Notes

Retirer `mutationReport`/`formatMutationGap`/`emptyMutationReport` de
`mutate.js`, leur appel et leur inclusion dans `ok`/`evidence` de `verify.js`,
et le bloc de validation `phase.mutation` de `progress.js`. `bin/lib/exec.js`
peut rester (aucun risque à le garder — `runCommand` y vivrait simplement
sans second consommateur), ou être réintégré dans `verify.js` si on préfère
annuler complètement l'extraction. Une évidence déjà écrite avec une section
`mutation` reste lisible par le code revenu en arrière, qui l'ignore
simplement. Aucun changement de schéma persistant ailleurs (`progress.json`
gagne un champ optionnel `phase.mutation`, ignoré silencieusement par le code
revenu en arrière).
