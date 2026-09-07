# Plan — Story 02.05

## Implementation Context

Fichiers probables :

- `bin/lib/tracks/tests.js` (nouveau) — copie structurelle de
  `bin/lib/tracks/git.js` : `tracksHome`/`tracksPath` (fichier `tests.json` au
  lieu de `git.json`), `defaultTestsTracks`, `readTestsTracks`,
  `validateTestsTracks`, `writeTestsTracks`, `readOrDefaultTestsTracks`,
  `syncTestsTrack`.
- `bin/lib/verify.js` (≈ lignes 226-236, bloc `try { syncGitTrack… } catch {}`
  suivi de `syncDomainLedger`) — ajouter un troisième bloc isolé
  `try { syncTestsTrack(...) } catch {}`, même contrat (jamais fatal pour
  `verify`).
- `test/tracks-tests.test.js` (nouveau, calqué sur `test/tracks-git.test.js`).

Ancres de recherche :

- `bin/lib/tracks/git.js` en entier — gabarit ligne à ligne. Différences
  attendues : pas de `captureGitSignals` (rien d'équivalent à lire depuis
  git/gh ici), remplacé par une lecture des évidences de `.ai-learn/runs/`.
- `findEvidence` (`progress.js`) — modèle pour parcourir
  `.ai-learn/runs/*-verify.json` triés ; `syncTestsTrack` doit lire **plusieurs**
  évidences d'une même phase (pas seulement la dernière passante comme
  `latestEvidenceForPhase`), donc probablement une nouvelle fonction
  `allEvidenceForPhase(dir, phaseId)` dans `progress.js`, à côté des deux
  existantes.
- `test/tracks-git.test.js#tmpHome` — même helper d'isolation `$HOME` à
  réutiliser pour `test/tracks-tests.test.js`.

Mode d'exécution :

- `STANDARD`

Scout pre-step :

- `no` — le gabarit à dupliquer (`tracks/git.js`) est connu ligne à ligne, le
  seul point réellement nouveau (lecture multi-évidences) est déjà cadré via
  `progress.js#findEvidence`.

À éviter sauf nécessité :

- `bin/lib/tracks/git.js`, `bin/lib/tracks/domain.js` (lire pour reproduire le
  patron, ne jamais modifier — chaque ledger reste indépendant)
- `check.js`, `status.js` (aucun affichage nouveau sauf décision explicite —
  voir Decisions)
- `mutate.js` (consommer `evidence.mutation` déjà écrite par 02-03, ne pas y
  ajouter de logique de ledger)

## Technical Notes

**`allEvidenceForPhase(dir, phaseId)`.** Nouvelle fonction dans `progress.js`,
à côté de `findEvidence`/`latestEvidenceForPhase`/`latestAnyEvidenceForPhase` :
renvoie **toutes** les évidences d'une phase, triées du plus ancien au plus
récent (ordre inverse de `findEvidence`, qui va du plus récent au plus ancien).
Nécessaire pour observer une transition dans le temps, pas seulement l'état le
plus récent.

**Détection « rouge d'abord ».** Pour une phase donnée : parcourir
`allEvidenceForPhase` dans l'ordre chronologique, chercher une évidence avec
`ev.mutation && ev.mutation.ok === false` suivie plus tard (n'importe quand
après, pas nécessairement immédiatement) d'une évidence avec
`ev.mutation && ev.mutation.ok === true`. Dès que cette paire existe une fois
pour une phase, le tier correspondant est acquis pour le projet — et propagé
au ledger cross-projet par `syncTestsTrack` (jamais retiré ensuite).

**`syncTestsTrack`.** Signature `{ dir, phase, verifyEvidence, home }`, appelée
uniquement si `verifyEvidence.ok === true` (même garde que `syncGitTrack`).
Recharge `allEvidenceForPhase(dir, phase.id)` pour recalculer les tiers
observables sur cette phase (pas seulement `verifyEvidence`, qui est juste la
plus récente) — c'est ce qui permet de détecter « rouge d'abord » même si la
transition s'est produite sur des runs antérieurs jamais synchronisés.

## Decisions

- Décision : les 6 tiers du ledger `tests.json` sont, dans l'ordre :
  1. **Un mutant tué** — au moins une évidence avec `mutation.killed >= 1`.
  2. **Score de mutation 100 % sur une phase** — au moins une évidence avec
     `mutation.score === 100` (et `mutation.mutants >= 1`, pour exclure le cas
     « aucun site », qui n'est pas une preuve de maîtrise).
  3. **Rouge d'abord observé** — la transition `mutation.ok: false → true`
     décrite ci-dessus, pour une même phase.
  4. **Diversité d'opérateurs** — au moins deux opérateurs de mutation
     différents (`site.operator`) tués sur l'ensemble du projet, pas
     uniquement le même type de mutant répété.
  5. **Résiste à une re-preuve** — une phase dont la mutation était déjà à
     100 %, redevenue `stale` (code changé, epic 01), puis re-vérifiée avec un
     nouveau `verify` qui retrouve `mutation.score === 100` — preuve que le
     test protège encore après un changement réel, pas seulement au moment où
     il a été écrit.
  6. **Généralisation inter-projets** — le tier 2 (score 100 %) atteint sur au
     moins deux projets distincts dans `config.projects`.
  - Raison : reproduit la progression de `git.json` (du geste isolé vers la
    généralisation, tier 6 le plus élevé) tout en gardant chaque tier
    strictement observable depuis des évidences déjà écrites — aucun tier ne
    dépend d'une déclaration de l'apprenant ou de l'IA.
  - Conséquence : ces définitions sont nouvelles à cette story (le roadmap ne
    les énumérait pas) ; elles doivent être documentées dans
    `bin/lib/tracks/tests.js` avec le même commentaire de traçabilité que
    `git.js` fait vers son plan (ici vers cette story, faute de plan dédié
    préexistant).
- Décision : aucun affichage nouveau dans `status`/`check` pour ce ledger, par
  symétrie avec `tracks/git.js` qui n'en a pas non plus.
  - Raison : vérifié dans le Context — si `git.json` (le ledger le plus ancien
    et le plus mature du dépôt) n'a toujours aucune consommation dans
    `status`, en ajouter une seulement pour `tests.json` créerait une
    incohérence de traitement entre deux ledgers de même nature.
  - Conséquence : la visibilité des tiers `tests.json` reste, pour l'instant,
    au niveau du fichier lui-même (`~/.ai-learn/tracks/tests.json`, inspectable
    à la main) — un futur epic pourrait vouloir l'exposer, hors scope ici.
- Décision : `syncTestsTrack` relit toutes les évidences de la phase à chaque
  appel plutôt que de ne considérer que la dernière.
  - Raison : le tier « rouge d'abord » et « diversité d'opérateurs » ont besoin
    d'un historique, pas d'un instantané — contrairement à `syncGitTrack`, qui
    n'a besoin que du run qui vient de réussir.
  - Conséquence : le coût de `syncTestsTrack` croît avec le nombre d'évidences
    d'un projet — acceptable pour la taille d'un projet d'apprentissage
    (dizaines de runs, pas des milliers).

## Test Plan

Unitaire (`test/tracks-tests.test.js`, calqué sur `test/tracks-git.test.js`) :

- [ ] `defaultTestsTracks` a bien 6 tiers, tous `achieved: false`.
- [ ] `validateTestsTracks` rejette une version inconnue, un tier manquant, une
      structure invalide — mêmes cas que `validateGitTracks`.
- [ ] Tier 1 : une évidence avec `mutation.killed >= 1` marque le tier atteint.
- [ ] Tier 2 : une évidence avec `mutation.score === 100` et `mutants >= 1`
      marque le tier atteint ; une évidence avec `score === null` (aucun site)
      ne le marque pas.
- [ ] Tier 3 : deux évidences successives (false puis true) marquent le tier ;
      une seule évidence déjà `true` ne le marque pas.
- [ ] Tier 4 : deux opérateurs distincts tués sur l'ensemble des évidences du
      projet marquent le tier ; un seul type répété ne le marque pas.
- [ ] Tier 5 : score 100 % → `stale` (simulé) → nouveau `verify` à 100 % à
      nouveau marque le tier.
- [ ] Tier 6 : tier 2 atteint sur deux `dir` différents dans `config.projects`
      marque le tier ; sur un seul projet, ne le marque pas.
- [ ] Un tier déjà `achieved: true` reste `true` après un sync qui ne le
      retoucherait pas autrement (non-régression, jamais remis à zéro).
- [ ] `syncTestsTrack` ne fait rien si `verifyEvidence.ok !== true`.
- [ ] Ledger corrompu/version inconnue → `readOrDefaultTestsTracks` renvoie un
      ledger par défaut, ne plante jamais.

Intégration (`test/verify.test.js`) :

- [ ] `ai-learn verify` réussi sur une phase `mutation: true` met à jour
      `~/.ai-learn/tracks/tests.json` (avec `$HOME` isolé, `tmpHome()`).
- [ ] Une erreur simulée dans `syncTestsTrack` (ledger illisible) ne fait pas
      échouer `verify` (même isolation que `syncGitTrack`/`syncDomainLedger`).

## Acceptance Traceability

| Acceptance criterion | Test proving it (`file::test`) |
| --- | --- |
| Rouge d'abord détecté depuis deux évidences réelles | `test/tracks-tests.test.js::marque le tier rouge d'abord depuis une transition observée` |
| Pas de rouge d'abord sans échec antérieur observé | `test/tracks-tests.test.js::ne marque pas rouge d'abord sans échec préalable` |
| Tier acquis jamais retiré | `test/tracks-tests.test.js::un tier acquis reste acquis` |
| Deux projets contribuent au même ledger | `test/tracks-tests.test.js::deux projets distincts sont listés séparément` |
| Ledger corrompu ne casse jamais verify | `test/verify.test.js::verify réussit même si le sync tests.json échoue` |

## Commands

- Command: `npm test`
  - Expected: la suite complète passe.
- Command: `node bin/ai-learn.js verify <id> --dir <projet-temporaire>` (deux
  fois, avec `$HOME` isolé) puis inspecter
  `$HOME/.ai-learn/tracks/tests.json`
  - Expected: les tiers observés (au minimum tier 1/2) sont `achieved: true`.

## Rollback

Retirer `bin/lib/tracks/tests.js`, son appel dans `verify.js`, et
`allEvidenceForPhase` de `progress.js` si aucune autre story n'en dépend
d'ici là. Le fichier `~/.ai-learn/tracks/tests.json` déjà écrit chez un
apprenant reste un fichier inoffensif non lu par le code revenu en arrière.
