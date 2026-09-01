# Plan — Story 01.02

## Implementation Context

Fichiers probables :

- `bin/lib/verify.js` — la branche `if (ok)` / absence de branche `else` : ajouter la
  rétrogradation quand `!ok` et que la phase est `done`.
- `bin/lib/progress.js` — l'empreinte rendue par 01.01 doit exposer assez de détail
  (liste des chemins et leur digest individuel) pour dire *quels* fichiers diffèrent.
- `bin/lib/check.js` — le warning « passing evidence but is not marked done »
  (branche non-`done`) doit ignorer les évidences marquées `--no-mark` ; le message
  de péremption s'enrichit.
- `bin/lib/next.js` — ordonner : périmée d'abord, puis la première non-`done`.
- `test/verify.test.js`, `test/check.test.js`, `test/next.test.js`.

Ancres de recherche :

- `setPhaseStatus`
- `noMark`
- `has passing evidence but is not marked done`
- `const next = phases.find(`

Mode d'exécution :

- `STANDARD`

Scout pre-step :

- `no`

À éviter sauf nécessité :

- `status.js` (l'affichage y est déjà branché par 01.01)
- `tracks/git.js`, `tracks/domain.js` — la synchronisation des ledgers ne doit pas
  être appelée sur une rétrogradation

## Technical Notes

**Forme de l'empreinte.** Pour nommer les fichiers changés, l'évidence doit stocker
`{ algo, digest, files: [{ path, digest }] }` plutôt qu'un seul digest global. Le
digest global reste la valeur comparée en premier (rapide) ; la liste ne sert qu'à
composer le message. Si 01.01 a écrit un digest seul, cette story l'étend — et une
évidence portant l'ancienne forme reste comparable par son digest global.

**Rétrogradation.** Un seul point d'écriture, dans `verify`, symétrique de la
promotion existante :

- `!ok` et `phase.status === "done"` ⇒ `setPhaseStatus(dir, id, "in_progress")` ;
- `!ok` et statut autre ⇒ rien ;
- `noMark` ⇒ **rien dans les deux sens** (le flag veut dire « ne touche pas au ledger »).

Les synchronisations de ledger (`syncGitTrack`, `syncDomainLedger`) restent dans la
branche succès uniquement : une rétrogradation ne doit rien accumuler.

**Marquage `--no-mark`.** Ajouter `marking: "skipped" | "applied"` à l'évidence.
`check` ne signale la dérive « evidence sans done » que pour `marking !== "skipped"`.
Une évidence héritée sans le champ garde le comportement actuel — rétro-compatible.

**Ordre dans `next`.** Chercher d'abord une phase au verdict `stale`, sinon la
première non-`done`. Ne pas trier les phases : la première périmée dans l'ordre du
ledger, pour rester prévisible.

## Decisions

- Décision : la rétrogradation va vers `in_progress`, jamais vers `pending`.
  - Raison : le travail a bien eu lieu ; `pending` effacerait cette information.
  - Conséquence : combiné à 01.01 (une phase `in_progress` n'est plus une erreur),
    une phase rétrogradée n'a pas d'effet de bord sur le code de sortie de `check`,
    qui la signale par la péremption elle-même.
- Décision : `--no-mark` neutralise l'écriture dans les deux sens.
  - Raison : le flag existe pour observer sans modifier le ledger. Rétrograder
    malgré lui serait une surprise.
  - Conséquence : un `verify --no-mark` qui échoue sur une phase `done` laisse le
    ledger tel quel ; `check` reste le mécanisme qui signale la péremption.

## Test Plan

Unitaire / intégration (`test/verify.test.js`) :

- [ ] Échec sur une phase `done` → statut `in_progress` dans `progress.json`
- [ ] Échec sur une phase `pending` → statut inchangé
- [ ] Échec avec `--no-mark` sur une phase `done` → statut inchangé
- [ ] Succès sur une phase périmée → `done` avec évidence fraîche
- [ ] Une rétrogradation n'écrit ni dans `tracks/git.json` ni dans `domains/*.json`
- [ ] L'évidence porte `marking: "applied"` / `"skipped"` selon le flag

`test/check.test.js` :

- [ ] Évidence `--no-mark` → aucun warning de dérive
- [ ] Évidence héritée sans `marking` → warning conservé (non-régression)
- [ ] Message de péremption nommant un fichier changé et le total
- [ ] Fichier supprimé du périmètre → détecté comme changement
- [ ] Fichier ajouté au périmètre → détecté comme changement
- [ ] Péremption **et** artefact manquant → deux erreurs distinctes

`test/next.test.js` :

- [ ] Phase périmée proposée avant une `pending` ultérieure
- [ ] Plusieurs périmées → la première du ledger
- [ ] Aucune périmée → comportement actuel inchangé

Manuel :

- [ ] Sur un projet réel : prouver une phase, modifier un fichier, relancer `verify`,
      constater la rétrogradation et le message.

## Acceptance Traceability

| Acceptance criterion | Test proving it (`file::test`) |
| --- | --- |
| Échec sur phase `done` → `in_progress` | `test/verify.test.js::un échec rétrograde une phase done` |
| Échec sur phase `pending` → inchangé | `test/verify.test.js::un échec ne rétrograde pas une phase pending` |
| Re-preuve → `done` | `test/verify.test.js::une phase périmée reprouvée redevient done` |
| `--no-mark` sans warning de dérive | `test/check.test.js::une évidence --no-mark ne déclenche pas la dérive` |
| Périmée proposée en premier | `test/next.test.js::next propose la phase périmée avant la pending` |
| Fichiers changés nommés | `test/check.test.js::le message de péremption nomme les fichiers changés` |
| Parcours terminé inchangé | `test/next.test.js::toutes les phases done` |

## Commands

- Command: `npm test`
  - Expected: la suite complète passe.
- Command: `node bin/ai-learn.js check --root .`
  - Expected: exit 0 sur ce dépôt.

## Rollback

Retirer la branche de rétrogradation de `verify` et le champ `marking` de l'évidence.
Une phase rétrogradée par la version précédente reste en `in_progress` — état
légitime, aucune donnée à réparer.
