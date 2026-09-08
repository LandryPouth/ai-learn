# Plan — Story 02.04

## Implementation Context

Fichiers probables :

- `bin/lib/check.js` (≈ lignes 149-160 pour le patron `normReport`, ≈ lignes
  343-360 pour la comparaison `sourceHash`/péremption par phase) — étendre le
  message de péremption existant pour mentionner la mutation quand
  `phase.mutation` est vrai ; ne pas ajouter de nouveau recalcul.
- `bin/lib/status.js` (≈ lignes 40-60 pour la boucle par phase, ≈ lignes
  120-128 pour l'affichage `norm`, ≈ ligne 162 pour la sortie `--json`) — ajouter
  la ligne/le champ de résumé mutation par phase.
- `test/check.test.js`, `test/status.test.js` (étendus).

Ancres de recherche :

- `phase.status === "done" && ev && ev.sourceHash` (`status.js` ≈ ligne 54,
  `check.js` ≈ ligne 357) — le point exact où lire `ev.mutation` à côté de
  `ev.sourceHash`, `ev` étant déjà la dernière évidence passante récupérée via
  `latestEvidenceForPhase`.
- Le bloc d'affichage `norm` de `status.js` (≈ lignes 120-128) — gabarit de
  formatage à reproduire pour la ligne de résumé mutation, phase par phase
  plutôt qu'au niveau projet (la norme est un résumé projet, la mutation est
  un résumé par phase — ne pas copier la portée, seulement le style).
- La sortie `--json` de `status.js` (≈ ligne 162, objet retourné) — ajouter
  `mutation` par entrée de phase, à côté des champs déjà posés par la story 01-05.

Mode d'exécution :

- `STANDARD`

Scout pre-step :

- `no` — deux fichiers connus, sections déjà localisées à la ligne près.

À éviter sauf nécessité :

- `verify.js`, `mutate.js`, `progress.js` (aucune nouvelle logique de calcul de
  mutation ici — cette story ne fait que **lire** `evidence.mutation` déjà
  écrite par 02-03)
- `tracks/*.js` (ledger — 02-05)
- Le mécanisme de péremption `sourceHash` lui-même (epic 01) — le consommer,
  ne pas le modifier

## Technical Notes

**Pourquoi `check` ne recalcule pas la mutation.** `norm` est un recalcul bon
marché (un parcours de fichiers, aucune exécution de commande externe). La
mutation exécute le checkpoint une fois par mutant — un recalcul à chaque
`check` romprait son contrat documenté de retour rapide (voir
`docs/plans/norm-clean-code.md`, décision « toujours revérifier » qui suppose
un coût négligeable). La péremption de `sourceHash` (epic 01) couvre déjà le
cas qui compte : si le code a changé depuis le dernier `verify` réussi, la
phase entière (dont sa preuve de mutation) redevient `stale` — pas besoin d'un
second mécanisme de péremption spécifique à la mutation.

**Message de péremption enrichi.** Le message actuel de `check.js` pour une
phase `stale` (epic 01, ≈ ligne 357 et environs) doit, quand
`phase.mutation === true`, ajouter une clause du type « (inclut la preuve de
mutation — un mutant qui survivait ou non n'est plus garanti) » plutôt que de
dupliquer le message de péremption pour la mutation seule.

**Affichage `status`.** Lire `ev.mutation` sur la dernière évidence passante
(déjà récupérée pour le hash, ≈ ligne 54 de `status.js`) :
- `ev.mutation` absent (évidence pré-02-03) → aucune ligne, jamais 0 %.
- `ev.mutation.score === null` → « mutation : aucun site mutable ».
- `ev.mutation.score` un nombre → « mutation : N % (K tués / M) ».

**Sortie `--json`.** Ajouter par entrée de phase :
```json
"mutation": { "required": true, "score": 80, "killed": 4, "mutants": 5 }
```
ou `null` si `phase.mutation` n'est pas déclaré — jamais un objet à moitié
rempli, pour rester simple à consommer côté script.

## Decisions

- Décision : `check` ne relance jamais le moteur de mutation ; il ne lit que la
  péremption déjà posée par l'epic 01 (`sourceHash`).
  - Raison : verrouillé dans les Requirements de `spec.md` — le coût d'un
    recalcul (exécuter le checkpoint par mutant) romprait le contrat de vitesse
    de `check`, documenté comme lecture rapide et répétée.
  - Conséquence : la seule façon de voir un score de mutation à jour est de
    relancer `ai-learn verify`/`ai-learn mutate` — `check`/`status` restent des
    lecteurs de la dernière preuve, jamais des recalculateurs pour la mutation
    (asymétrique avec `norm`, assumé et documenté ici).
- Décision : le résumé de mutation dans `status` est par phase, pas un résumé
  projet global comme `norm`.
  - Raison : la mutation est activée phase par phase (`phase.mutation`), alors
    que `norm` s'applique à tout le périmètre `learnerFiles` en continu — les
    deux résumés n'ont pas la même granularité naturelle.
  - Conséquence : `status --json` gagne un champ par entrée de phase plutôt
    qu'un objet unique au niveau racine.

## Decisions (revue avant implémentation)

- Décision : le scénario « score de 80 % dans la dernière évidence passante »
  (spec.md AC #3) n'est pas littéralement atteignable via une exécution réelle
  de `verify` — corrigé dans le test, pas dans le comportement.
  - Raison : `latestEvidenceForPhase` ne retourne que l'évidence dont `ok`
    (le verdict global de `verify`) est `true`. Depuis la story 02-03, `ok`
    intègre `mutationReport.ok`, qui vaut `survived.length === 0` — donc toute
    évidence passante a nécessairement `score` ∈ `{100, null}` (100 si des
    mutants ont été mesurés, `null` si aucun site n'a été trouvé). Un score de
    80 % implique un survivant, donc `ok: false`, donc jamais retourné par
    `latestEvidenceForPhase`. Le AC illustre le format d'affichage avec un
    chiffre parlant, pas un scénario reproductible tel quel.
  - Conséquence : le test qui prouve cet AC fabrique l'évidence directement
    (même technique déjà utilisée ailleurs dans ce dépôt pour simuler une
    évidence legacy/éditée — voir `test/check.test.js`, tests `sourceHash`),
    plutôt que de relancer `ai-learn verify` avec un mutant survivant. Le test
    d'intégration réel (`status displays the mutation score line for a phase
    proven by a real verify run`) couvre en plus le seul cas réellement
    producible (`100 %`).
- Décision : la forme JSON « jamais un objet à moitié rempli » (plan.md
  Technical Notes) inclut aussi le cas « `phase.mutation: true` mais jamais
  encore mesuré » (pending, ou évidence pré-02-03) — `mutationSummary` renvoie
  alors `{ required: true, score: null, killed: 0, mutants: 0 }` plutôt que
  d'omettre des champs.
  - Raison : un objet partiellement rempli (ex. `{ required: true }` seul)
    forcerait un script consommateur à vérifier la présence de chaque champ ;
    `score: null` est déjà le vocabulaire choisi pour « rien à afficher en
    pourcentage » (même sémantique que le cas « aucun site mutable »).
  - Conséquence : un script ne peut pas distinguer, depuis le seul JSON,
    « mesuré, zéro site » de « jamais mesuré » — la sortie texte, elle,
    distingue les deux (aucune ligne dans le second cas). Assumé : le JSON
    n'a jamais eu vocation à remplacer la sortie texte comme source de vérité
    de detail, seulement à l'exposer de façon stable pour un script.

## Test Plan

Unitaire / intégration (`test/check.test.js`) :

- [x] Phase `done`, `mutation: true`, évidence `mutation.ok: true`, code
      inchangé → `check` ne signale rien pour cette phase.
- [x] Phase `done`, `mutation: true`, code changé depuis le dernier `verify` →
      `check` signale la péremption avec la clause mutation dans le message.
- [x] Phase `done`, `mutation: true`, évidence `mutation.ok: false` (jamais
      redevenue verte) — cas déjà couvert par la démotion de 02-03 (la phase ne
      serait plus `done`) ; vérifier que `check` reste cohérent si le fichier
      `progress.json` a été édité à la main pour forcer `done` malgré tout
      (defense-in-depth, pas un cas attendu en usage normal).
- [x] `check` sur ce dépôt (`node bin/ai-learn.js check --root .`) ne lance
      aucune commande de checkpoint supplémentaire (vérifiable en instrumentant
      `spawnSync`/`runCommand` dans le test et en comptant les appels).

Unitaire / intégration (`test/status.test.js`) :

- [x] Phase `mutation: true`, dernière évidence passante avec `mutation.score: 80` →
      ligne « mutation : 80 % (4 tués / 5) » affichée.
- [x] Phase `mutation: true`, `mutation.score: null` → « aucun site mutable ».
- [x] Phase sans `phase.mutation` → aucune ligne de mutation.
- [x] Évidence pré-02-03 (`ev.mutation` absent) → aucune ligne, pas d'erreur.
- [x] `status --json` : `mutation.score` correspond exactement à l'évidence.

## Acceptance Traceability

| Acceptance criterion | Test proving it (`file::test`) |
| --- | --- |
| Mutation inchangée → check silencieux | `test/check.test.js::check reports nothing for a phase whose mutation proof is still valid (code unchanged)` |
| Code changé → péremption avec clause mutation | `test/check.test.js::check's stale message names the mutation proof as part of what's périmé when phase.mutation is required` |
| Score affiché dans status | `test/status.test.js::formatMutationLine renders the score, killed and total mutants for a measured phase` + `status displays the mutation score line for a phase proven by a real verify run` |
| Pas de ligne pour une phase sans mutation | `test/status.test.js::status shows no mutation line for a phase without phase.mutation` |
| `--json` cohérent | `test/status.test.js::status --json includes the mutation summary, matching the evidence exactly` |
| `check` ne relance aucun checkpoint | `test/check.test.js::check never launches a checkpoint command to audit mutation (fast, read-only contract)` |

## Commands

- Command: `npm test`
  - Expected: la suite complète passe.
- Command: `node bin/ai-learn.js check --root .`
  - Expected: exit 0, temps d'exécution inchangé par rapport à avant la story.

## Rollback

Retirer la lecture de `ev.mutation` dans `check.js`/`status.js` et le champ
`mutation` de la sortie `--json`. Aucune donnée persistante modifiée par cette
story (lecture seule) — un `git revert` suffit.
