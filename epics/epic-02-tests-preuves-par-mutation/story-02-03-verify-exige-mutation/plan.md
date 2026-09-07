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
- `test/verify.test.js` (étendu — cas mutation, symétriques aux cas
  `predictions` déjà écrits en story 01-04).

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
  required: Boolean(phase.mutation),
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
`mutationReport.ok` reste `false` tant que `truncated` est vrai **et** qu'au
moins un mutant a survécu OU que le run n'a pas couvert tous les sites — pour
rester du côté « ne bloque pas sur du travail non fait » : si tous les mutants
traités ont été tués mais que le plafond a coupé le run avant la fin,
`ok = true` mais `truncated = true` est quand même signalé pour transparence
(pas un blocage, une information).

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

## Test Plan

Unitaire (`test/verify.test.js` ou nouveau `test/mutation-report.test.js`) :

- [ ] Phase sans `mutation` → `mutationReport` court-circuite, `required: false`,
      `ok: true`, aucun appel au moteur de mutation.
- [ ] Phase `mutation: true`, tous mutants tués → `ok: true`, `score: 100`.
- [ ] Phase `mutation: true`, un mutant survécu → `ok: false`, `survived`
      contient ce site.
- [ ] Phase `mutation: true`, aucun site mutable → `ok: true`, `score: null`.
- [ ] Checkpoint de base rouge → `mutationReport` n'est pas calculée du tout
      (vérifier qu'aucun fichier n'est muté dans ce cas).
- [ ] `truncated: true` avec tout ce qui a été traité tué → `ok: true`.
- [ ] `truncated: true` avec au moins un survécu parmi les traités → `ok: false`.

Intégration (`test/verify.test.js`) :

- [ ] `ai-learn verify <id>` sur une phase `mutation: true` bien couverte →
      phase marquée `done`, `evidence.mutation.ok === true`.
- [ ] `ai-learn verify <id>` sur une phase `mutation: true` mal couverte →
      phase **non** marquée `done`, message listant le(s) site(s) survécu(s).
- [ ] Phase déjà `done` (mutation exigée), code changé de sorte qu'un mutant
      survit maintenant → `verify` la rétrograde à `in_progress`.
- [ ] `--no-mark` sur une phase `mutation: true` mal couverte → l'évidence
      contient quand même `mutation.ok: false`, sans changer le statut.
- [ ] `phase.mutation` avec une valeur non booléenne dans `progress.json` →
      `validateProgress` émet un warning, la mutation n'est pas exigée.

## Acceptance Traceability

| Acceptance criterion | Test proving it (`file::test`) |
| --- | --- |
| Tous mutants tués → phase done | `test/verify.test.js::marque done une phase dont tous les mutants sont tués` |
| Mutant survécu → phase non done, message | `test/verify.test.js::bloque une phase avec un mutant survécu` |
| Aucun site mutable → phase done | `test/verify.test.js::ne bloque pas une phase sans site mutable` |
| Phase sans mutation → evidence stable, non bloquante | `test/verify.test.js::renseigne mutation.required=false sans bloquer` |
| Démotion done → in_progress si mutation régresse | `test/verify.test.js::rétrograde une phase dont un mutant se met à survivre` |
| Valeur non booléenne → warning, pas d'erreur | `test/verdict.test.js::phase.mutation non booléen émet un warning` (ou `test/verify.test.js` selon où vit le test de validation) |

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
