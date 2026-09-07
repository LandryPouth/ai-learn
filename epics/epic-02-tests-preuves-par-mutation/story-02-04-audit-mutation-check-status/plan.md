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

## Test Plan

Unitaire / intégration (`test/check.test.js`) :

- [ ] Phase `done`, `mutation: true`, évidence `mutation.ok: true`, code
      inchangé → `check` ne signale rien pour cette phase.
- [ ] Phase `done`, `mutation: true`, code changé depuis le dernier `verify` →
      `check` signale la péremption avec la clause mutation dans le message.
- [ ] Phase `done`, `mutation: true`, évidence `mutation.ok: false` (jamais
      redevenue verte) — cas déjà couvert par la démotion de 02-03 (la phase ne
      serait plus `done`) ; vérifier que `check` reste cohérent si le fichier
      `progress.json` a été édité à la main pour forcer `done` malgré tout
      (defense-in-depth, pas un cas attendu en usage normal).
- [ ] `check` sur ce dépôt (`node bin/ai-learn.js check --root .`) ne lance
      aucune commande de checkpoint supplémentaire (vérifiable en instrumentant
      `spawnSync`/`runCommand` dans le test et en comptant les appels).

Unitaire / intégration (`test/status.test.js`) :

- [ ] Phase `mutation: true`, dernière évidence passante avec `mutation.score: 80` →
      ligne « mutation : 80 % (4 tués / 5) » affichée.
- [ ] Phase `mutation: true`, `mutation.score: null` → « aucun site mutable ».
- [ ] Phase sans `phase.mutation` → aucune ligne de mutation.
- [ ] Évidence pré-02-03 (`ev.mutation` absent) → aucune ligne, pas d'erreur.
- [ ] `status --json` : `mutation.score` correspond exactement à l'évidence.

## Acceptance Traceability

| Acceptance criterion | Test proving it (`file::test`) |
| --- | --- |
| Mutation inchangée → check silencieux | `test/check.test.js::ne signale rien pour une mutation toujours valide` |
| Code changé → péremption avec clause mutation | `test/check.test.js::signale la péremption de la mutation quand le code a changé` |
| Score affiché dans status | `test/status.test.js::affiche le score de mutation d'une phase` |
| Pas de ligne pour une phase sans mutation | `test/status.test.js::n'affiche aucune ligne de mutation sans phase.mutation` |
| `--json` cohérent | `test/status.test.js::--json inclut le score de mutation par phase` |
| `check` ne relance aucun checkpoint | `test/check.test.js::ne lance aucune commande supplémentaire pour la mutation` |

## Commands

- Command: `npm test`
  - Expected: la suite complète passe.
- Command: `node bin/ai-learn.js check --root .`
  - Expected: exit 0, temps d'exécution inchangé par rapport à avant la story.

## Rollback

Retirer la lecture de `ev.mutation` dans `check.js`/`status.js` et le champ
`mutation` de la sortie `--json`. Aucune donnée persistante modifiée par cette
story (lecture seule) — un `git revert` suffit.
