# Plan — Story 01.01

## Implementation Context

Fichiers probables :

- `bin/lib/progress.js` — accueille le calcul de verdict, à côté de
  `latestEvidenceForPhase`. **Doit rester une feuille** (aucun `require` interne) :
  le hash a besoin de `learnerFiles`, donc passer les globs en paramètre plutôt que
  d'importer `guard.js` ici.
- `bin/lib/verify.js` (≈ ligne 140, construction de `evidence`) — ajout du champ
  d'empreinte, à côté de `norm` et `missingArtifacts`.
- `bin/lib/check.js` (≈ lignes 285-330, boucle `for (const phase of config.phases)`)
  — remplacer les deux branches `done` / `!done` par la consommation du verdict.
- `bin/lib/status.js#printStatus`, `bin/lib/next.js#nextCommand` — affichage.
- `test/verify.test.js`, `test/check.test.js`, `test/status.test.js`,
  `test/next.test.js`, nouveau `test/verdict.test.js`.

Ancres de recherche :

- `latestEvidenceForPhase`
- `checkpointFilePath`
- `checkpoint exists but no passing evidence`
- `is marked done but has no passing evidence`
- `walkSources` (pour le périmètre de fichiers, déjà utilisé par `norm.js`)

Mode d'exécution :

- `STANDARD`

Scout pre-step :

- `no` — périmètre connu, modules nommés.

À éviter sauf nécessité :

- `scan.js` (ne pas modifier le moteur de détection ; le consommer)
- `guard.js` (lire `loadGuardConfig` depuis l'appelant, ne pas toucher la décision)
- `norm.js`, `docs.js`, `traps.js`, `propose.js`, `platforms/**`

## Technical Notes

**Où calculer.** `phaseVerdict({ phase, evidence, currentHash, checkpointFileExists })`
dans `progress.js` : fonction pure, aucune I/O, tous les faits passés en arguments.
C'est ce qui la rend testable en table de cas sans projet temporaire, et ce qui évite
le cycle de `require` documenté dans `docs/architecture.md`.

**États rendus** (au moins) :
`pending` · `in-progress` · `proven` · `proven-unhashed` · `stale` · `unproven`.
`unproven` est réservé au cas qui reste une erreur : le fichier de checkpoint existe,
la phase n'est pas en cours, aucune évidence passante.

**Empreinte.** `sha256` via `node:crypto` (stdlib). Périmètre : les fichiers
retournés par `walkSources` filtrés par `matchesLearnerPath(learnerFiles)` — soit
exactement le périmètre que `norm.js#normProject` calcule déjà, plus le fichier de
checkpoint désigné par la commande (`checkpointFilePath` existe déjà dans `check.js`,
à extraire vers un module partagé plutôt qu'à dupliquer).

Recette du hash, à respecter pour la stabilité :
1. trier les chemins relatifs **normalisés** (`normalizePortable`) ;
2. pour chaque fichier, absorber `chemin\n` puis les octets bruts du contenu ;
3. rendre `{ algo: "sha256", files: <n>, digest: "<hex>" }`.

Ne pas normaliser les fins de ligne : le hash porte sur les octets. Un CRLF↔LF est
un vrai changement de fichier, et le prétendre identique ouvrirait un trou.

**Rétro-compatibilité.** `evidence.sourceHash === undefined` ⇒ `proven-unhashed`,
jamais `stale`. C'est la décision verrouillée du 2026-09-01 : aucun projet existant
ne doit devenir rouge à l'installation de cette version.

**Le filet à ne pas perdre.** L'erreur `unproven` existe pour rendre `verify`
non-skippable par omission. Elle est conservée telle quelle pour `pending` ; seule
`in_progress` est relâchée. Si le doute revient, se rappeler qu'un `in_progress` sans
travail visible n'est pas un mensonge — c'est l'état normal du milieu d'une phase.

## Decisions

- Décision : `phaseVerdict` est une fonction pure, les faits sont collectés par
  l'appelant.
  - Raison : `progress.js` est une feuille ; y importer `guard.js`/`scan.js`
    recréerait le cycle qui a déjà forcé le déplacement de `latestEvidenceForPhase`.
  - Conséquence : chaque lecteur collecte les faits (évidence, hash courant,
    existence du fichier de checkpoint) ; le coût de `walkSources` est déjà payé par
    `norm` dans `check` et `status`.
- Décision : le hash porte sur les octets bruts, pas sur du contenu normalisé.
  - Raison : un hash « intelligent » a des faux négatifs, et ce mécanisme sert à
    dire « ça a changé ».
  - Conséquence : un `git config core.autocrlf` peut faire clignoter l'état sur
    Windows. La CI Windows de la story 01.06 est ce qui le rendra visible.
- Décision : `checkpointFilePath` est extrait de `check.js` vers un module partagé.
  - Raison : `verify` en a besoin pour le périmètre du hash ; le dupliquer garantit
    la divergence.
  - Conséquence : une modification de `check.test.js` sur l'import est attendue.

## Test Plan

Unitaire (`test/verdict.test.js`) — table de cas, fonction pure :

- [ ] `pending` sans évidence ni fichier de checkpoint → `pending`
- [ ] `pending` avec fichier de checkpoint, sans évidence → `unproven`
- [ ] `in_progress` avec fichier de checkpoint, sans évidence → `in-progress`
- [ ] `done` avec évidence sans empreinte → `proven-unhashed`
- [ ] `done` avec évidence, empreinte identique → `proven`
- [ ] `done` avec évidence, empreinte différente → `stale`
- [ ] `done` sans évidence → `unproven`

Unitaire (empreinte) :

- [ ] Deux appels sans modification donnent le même digest.
- [ ] L'ordre de création des fichiers ne change pas le digest.
- [ ] Un chemin contenant un backslash (simulé) produit le même digest qu'un slash.
- [ ] Ensemble vide → digest stable et `files: 0`.
- [ ] Un fichier binaire dans le périmètre ne fait pas échouer le calcul.

Intégration (`test/check.test.js`, `test/verify.test.js`) :

- [ ] `check` sur une phase `in_progress` avec checkpoint → exit 0, aucune erreur.
- [ ] `check` sur une phase `pending` avec checkpoint → exit 1 (non-régression).
- [ ] `verify` réussi écrit `sourceHash` dans l'évidence.
- [ ] Modification d'un fichier `src/**` après un `verify` réussi → `check` exit 1
      avec un message de péremption.
- [ ] Évidence forgée sans `sourceHash` → `check` exit 0.

Affichage (`test/status.test.js`, `test/next.test.js`) :

- [ ] `status` affiche l'état périmé.
- [ ] `next` propose la phase périmée comme à re-prouver.

Manuel :

- [ ] Sur le dogfood Fastify (projet déjà scaffoldé, évidences sans empreinte) :
      `ai-learn check` reste vert. C'est le test de la rétro-compatibilité.

## Acceptance Traceability

| Acceptance criterion | Test proving it (`file::test`) |
| --- | --- |
| Phase `in_progress` n'est plus une erreur | `test/check.test.js::in_progress avec checkpoint ne produit pas d'erreur` |
| Phase `pending` reste une erreur | `test/check.test.js::pending avec checkpoint reste une erreur` |
| Code modifié → périmé | `test/check.test.js::une modification de src rend la preuve périmée` |
| Code inchangé → prouvé | `test/check.test.js::preuve valide quand rien n'a changé` |
| Évidence sans empreinte jamais périmée | `test/check.test.js::évidence héritée sans empreinte reste prouvée` |
| Empreinte stable | `test/verdict.test.js::le digest est stable entre deux calculs` |
| `status` consomme le verdict partagé | `test/status.test.js::status affiche l'état périmé` |
| `next` oriente vers la re-preuve | `test/next.test.js::next propose la phase périmée` |

## Commands

- Command: `npm test`
  - Expected: la suite complète passe (~340 tests + les nouveaux).
- Command: `node bin/ai-learn.js check --root .`
  - Expected: exit 0 sur ce dépôt.

## Rollback

Retirer le champ d'empreinte de `verify` et rétablir les deux branches d'origine
dans `check.js`. Aucune migration de données : les évidences déjà écrites avec
empreinte restent lisibles par le code d'origine, qui ignore simplement le champ.
