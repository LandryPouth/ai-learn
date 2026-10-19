# Plan — Story 02.03

## Implementation Context

Fichiers probables :

- `bin/lib/progress.js#validateProgress` (≈ lignes 124-138, blocs `gitTier`/
  `stressCheckpoint`) — ajouter le même bloc de validation lenient pour
  `phase.mutation`.
- `bin/lib/verify.js` (≈ lignes 118-181, construction de `normReport`/
  `missingArtifacts`/`predReport` puis `ok`) — insérer `mutationReport` au même
  endroit, même style d'inclusion dans `ok` et dans l'objet `evidence`.
- `bin/lib/mutate.js` — exposer une fonction pure/quasi-pure réutilisable par
  `verify.js`, par exemple `mutationReport({ dir, phase })`, calquée sur
  `predictions.js#predictionsReport({ dir, phase })` (même signature, même
  esprit : retourne un objet de faits, ne logue rien elle-même).
- `bin/lib/exec.js` (nouveau, non prévu à la lecture initiale — voir
  Decisions) — extrait `runCommand` de `verify.js` pour casser le require
  circulaire que cette story introduirait sinon entre `verify.js` et
  `mutate.js`.
- `test/verify.test.js` (étendu — cas mutation, symétriques aux cas
  `predictions` déjà écrits en story 01-04).
- `test/mutate.test.js` (étendu — tests unitaires de `mutationReport`/
  `formatMutationGap`/`emptyMutationReport`, même répartition unité/intégration
  que `predictions.test.js`/`verify.test.js` en story 01-04).
- `test/check.test.js` (étendu — cas `phase.mutation` non booléen, même
  gabarit que le test `gitTier` existant).

Ancres de recherche :

- `predictionsReport`, `formatPredictionsGap` (`predictions.js`) — gabarit exact
  à reproduire pour `mutationReport`/`formatMutationGap` : même séparation
  "calcul pur" / "formatage du message".
- `normReport.violations.length === 0` dans le calcul de `ok` (`verify.js`
  ≈ ligne 176-181) — insérer `mutationReport.ok` au même endroit.
- La démotion `done → in_progress` (`verify.js` ≈ lignes 249-259) — la
  mutation participe au même `ok` global, donc bénéficie de cette démotion
  sans code supplémentaire si elle est bien intégrée au calcul de `ok`.

Mode d'exécution :

- `STANDARD`

Scout pre-step :

- `no` — les trois points d'intégration (`progress.js`, `verify.js`, et la
  nouvelle fonction dans `mutate.js`) sont nommés avec leurs lignes
  approximatives.

À éviter sauf nécessité :

- `check.js`, `status.js` (aucune consommation de `evidence.mutation` dans
  cette story — 02-04)
- `tracks/*.js` (aucun ledger touché ici — 02-05)
- `bin/lib/stacks/*.js` (banque déjà posée en 02-02, ne pas y retoucher sauf
  bug découvert en écrivant les tests de cette story)

## Technical Notes

**`mutationReport({ dir, phase })`.** Retourne toujours un objet de forme
stable, y compris pour une phase sans `phase.mutation` :

```js
{
  required: phase.mutation === true,
  ok: true | false,
  mutants: number,
  killed: number,
  survived: [{ file, line, operator }],
  score: number | null,   // null si mutants === 0
  truncated: boolean,     // maxMutantsPerRun atteint
}
```

Pour `phase.mutation` absent/faux : court-circuiter immédiatement en
`{ required: false, ok: true, mutants: 0, killed: 0, survived: [], score: null,
truncated: false }`, sans lancer le moteur de mutation — pas de coût de
performance pour les phases qui ne le demandent pas.

**Intégration dans `ok`.** `ok = result.ok && (!stressResult || stressResult.ok)
&& normReport.violations.length === 0 && missingArtifacts.length === 0 &&
predReport.missing === 0 && mutationReport.ok` — même style d'expression
booléenne plate déjà utilisée, pas de branche conditionnelle séparée.

**Site déjà rouge avant mutation.** `verifyCommand` lance déjà `result =
runCommand(phase.checkpoint, dir)` avant tout calcul de rapport. `mutationReport`
doit être appelée seulement si `result.ok` est vrai (comme `normReport` l'est
déjà inconditionnellement, mais la mutation ajoute un coût réel — pas de raison
de muter du code dont le test de base échoue déjà). Passer ce garde-fou
explicitement, pas implicitement via un `try/catch`.

**`truncated`.** Si `maxMutantsPerRun` (02-02) est atteint pendant le calcul,
`truncated` est un simple drapeau d'information, jamais un terme du calcul de
`ok` : `ok` reste défini uniquement par `survived.length === 0` parmi les
mutants réellement testés. Si tous les mutants traités ont été tués mais que
le plafond a coupé le run avant la fin, `ok = true` et `truncated = true` sont
signalés ensemble — transparent, pas un blocage (voir Decisions).

## Decisions

- Décision : la mutation n'est calculée par `verify` que si le checkpoint de
  base est déjà vert.
  - Raison : muter du code dont le test échoue déjà ne produit aucune
    information utile (un test déjà rouge ne peut pas "détecter" un mutant de
    plus) — coûterait du temps pour un résultat sans valeur.
  - Conséquence : `mutationReport` n'est pas strictement inconditionnelle comme
    `normReport`, contrairement à ce que le Context de `index.md` semble
    suggérer en surface — assumé et documenté ici, cohérent avec 02-01
    (« un test déjà rouge ne prouve rien »).
- Décision : `truncated: true` avec tous les mutants traités tués reste `ok: true`.
  - Raison : bloquer une phase pour un plafond de performance (pas un vrai
    trou de couverture) romprait la règle « absence de matière n'est jamais un
    échec » — un plafond est une limite technique, pas un jugement sur le code.
  - Conséquence : un projet qui grossit au point de dépasser `maxMutantsPerRun`
    systématiquement voit son `mutation.score` toujours partiel — un futur epic
    pourrait vouloir alerter dessus (hors scope ici, noté pour référence).
- Décision (revue avant implémentation) : `required` teste `phase.mutation
  === true` (identité stricte), pas `Boolean(phase.mutation)` comme
  l'esquissait la première version de ce Technical Notes.
  - Raison : `spec.md` (Requirements et Acceptance Criteria) demande
    explicitement l'identité stricte — une valeur non booléenne (ex. la
    chaîne `"true"`, un mensonge de `progress.json`) doit produire un warning
    de `validateProgress` **et** ne jamais activer la mutation. `Boolean("true")`
    vaut `true` : coercition aurait silencieusement activé la mutation sur une
    valeur invalide, contredisant l'AC dédié. Corrigé avant d'écrire le code,
    même discipline que la correction spec/plan de 02-02.
  - Conséquence : aucune — `mutationReport`/`emptyMutationReport` et le bloc de
    validation de `progress.js` utilisent tous la même comparaison stricte.
- Décision (revue avant implémentation) : `runCommand` (la primitive
  `spawnSync` sur le checkpoint) est extraite de `verify.js` vers un nouveau
  module `bin/lib/exec.js`, importé par les deux fichiers.
  - Raison : `mutate.js` importait déjà `runCommand` depuis `verify.js`
    (02-01/02-02) ; cette story ajoute la dépendance inverse — `verify.js`
    importe `mutationReport` depuis `mutate.js`. Un require circulaire à deux
    entrées de haut de fichier casse en CommonJS : quel que soit le module
    chargé en premier par un test (`verify.test.js` charge `verify.js` en
    premier), le second `require()` du cycle reçoit les exports encore vides
    de l'autre module — `mutate.js` se serait retrouvé avec `runCommand ===
    undefined`, un crash silencieux à la première mutation testée. Aucun test
    de cette story ne l'aurait révélé à la lecture du code ; seul un run réel
    l'aurait fait échouer.
  - Conséquence : `verify.js` réexporte toujours `runCommand` (aucun
    changement d'API publique — confirmé qu'aucun fichier hors `mutate.js` ne
    l'importait directement) ; `mutate.js` ne dépend plus du tout de
    `verify.js`. Le graphe reste acyclique : `exec.js` est une feuille dont
    dépendent `verify.js` et `mutate.js`, et `verify.js` dépend de `mutate.js`
    dans un seul sens.

## Test Plan

Unitaire (`test/verify.test.js` ou nouveau `test/mutation-report.test.js`) :

- [x] Phase sans `mutation` → `mutationReport` court-circuite, `required: false`,
      `ok: true`, aucun appel au moteur de mutation.
- [x] Phase `mutation: true`, tous mutants tués → `ok: true`, `score: 100`.
- [x] Phase `mutation: true`, un mutant survécu → `ok: false`, `survived`
      contient ce site.
- [x] Phase `mutation: true`, aucun site mutable → `ok: true`, `score: null`.
- [x] Checkpoint de base rouge → `mutationReport` n'est pas calculée du tout
      (vérifier qu'aucun fichier n'est muté dans ce cas).
- [x] `truncated: true` avec tout ce qui a été traité tué → `ok: true`.
- [x] `truncated: true` avec au moins un survécu parmi les traités → `ok: false`.

Intégration (`test/verify.test.js`) :

- [x] `ai-learn verify <id>` sur une phase `mutation: true` bien couverte →
      phase marquée `done`, `evidence.mutation.ok === true`.
- [x] `ai-learn verify <id>` sur une phase `mutation: true` mal couverte →
      phase **non** marquée `done`, message listant le(s) site(s) survécu(s).
- [x] Phase déjà `done` (mutation exigée), code changé de sorte qu'un mutant
      survit maintenant → `verify` la rétrograde à `in_progress`.
- [x] `--no-mark` sur une phase `mutation: true` mal couverte → l'évidence
      contient quand même `mutation.ok: false`, sans changer le statut.
- [x] `phase.mutation` avec une valeur non booléenne dans `progress.json` →
      `validateProgress` émet un warning, la mutation n'est pas exigée.

## Acceptance Traceability

| Acceptance criterion | Test proving it (`file::test`) |
| --- | --- |
| Tous mutants tués → phase done | `test/verify.test.js::verify marks done a phase whose mutation is required and every mutant found is killed` |
| Mutant survécu → phase non done, message | `test/verify.test.js::verify blocks a phase with a survived mutant: not marked done, message lists the site` |
| Aucun site mutable → phase done | `test/verify.test.js::verify does not block a phase with mutation required but no mutable site in scope` |
| Phase sans mutation → evidence stable, non bloquante | `test/verify.test.js::verify reports mutation.required=false without blocking when phase.mutation is absent` |
| Checkpoint déjà rouge → mutation non calculée, fichier intact | `test/verify.test.js::verify never computes mutation when the base checkpoint is already red — the file is never touched` |
| Démotion done → in_progress si mutation régresse | `test/verify.test.js::a done phase whose mutation regresses (a mutant starts surviving) is demoted to in_progress` |
| `--no-mark` calcule quand même, sans marquer | `test/verify.test.js::verify --no-mark on a mutation-required phase still computes mutation.ok=false without changing status` |
| `truncated` transparent, non bloquant en soi | `test/verify.test.js::verify signals a truncated mutation run for transparency, without blocking on the truncation alone` |
| Valeur non booléenne → warning, pas d'erreur | `test/check.test.js::a non-boolean phase.mutation is a warning, not an error; a real boolean is silent` |
| `mutationReport`/`formatMutationGap`/`emptyMutationReport` (calcul pur) | `test/mutate.test.js` — section « mutationReport / formatMutationGap / emptyMutationReport » (9 tests, dont troncature tuée/survécue) |

## Commands

- Command: `npm test`
  - Expected: la suite complète passe.
- Command: `node bin/ai-learn.js verify <id> --dir <projet-temporaire>`
  - Expected: exit 0/1 cohérent avec la couverture réelle des mutants pour une
    phase `mutation: true` de test.

## Rollback

Retirer `mutationReport`/`formatMutationGap` de `mutate.js`, son appel et son
inclusion dans `ok`/`evidence` de `verify.js`, et le bloc de validation
`phase.mutation` de `progress.js`. Une évidence déjà écrite avec une section
`mutation` reste lisible par le code revenu en arrière, qui l'ignore simplement.
