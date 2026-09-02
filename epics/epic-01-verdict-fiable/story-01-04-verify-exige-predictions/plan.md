# Plan — Story 01.04

## Implementation Context

Fichiers probables :

- `bin/lib/verify.js` — le calcul de `ok` (≈ ligne 145) et la construction de
  `evidence` : une section `predictions` à côté de `norm`.
- `bin/lib/predictions.js` — une fonction de contrôle par phase
  (`predictionsReport({ dir, phase })` → `{ count, required, missing, anomalies }`).
- `bin/lib/check.js` — aligner le message sur celui de `verify`, sans dupliquer le calcul.
- `templates/AGENTS-apprentissage.md` et `README.md` — la limite (« l'ordre est
  prouvé, pas l'honnêteté »).
- `test/verify.test.js`, `test/predictions.test.js`, `test/check.test.js`.

Ancres de recherche :

- `const ok =`
- `normReport.violations.length === 0`
- `missingArtifacts`
- `predictionsRequired`

Mode d'exécution :

- `STANDARD`

Scout pre-step :

- `no`

À éviter sauf nécessité :

- `progress.js`, `status.js`, `next.js` (déjà servis par 01.01/01.02)
- `guard.js`, `norm.js`, `scan.js`

## Technical Notes

**Symétrie stricte avec la norme.** La section prédictions se calcule
inconditionnellement (comme `normReport` et `stressResult`), quel que soit
`--no-mark`, et entre dans `ok` au même endroit. Ne pas créer une seconde façon de
bloquer : un seul `ok`, quatre puis cinq facteurs.

**Antériorité.** Anomalie quand `revealedAt` existe et `at > revealedAt`. Décision de
plan : **signaler sans bloquer** en première intention.
Raison : le champ est rapporté par l'agent, pas observé par l'outil ; en faire un mur
punirait un horodatage maladroit avec la même force qu'un checkpoint rouge, ce que la
convention « une heuristique résout vers ne pas bloquer » interdit. Le blocage
deviendra légitime le jour où l'écriture de la prédiction et celle de la révélation
seront deux appels distincts observés par l'outil — à réévaluer, pas à trancher ici.

**Rétro-compatibilité.** Aucune donnée de prédictions ⇒ `required` est ignoré et
aucun blocage n'a lieu. C'est ce qui empêche cette story de rendre rouge, d'un coup,
tous les projets déjà en cours — y compris le dogfood.

**Message.** Reprendre la forme déjà employée par `verify` pour la norme et les
artefacts (un bloc titré, une ligne `✗` par manque), pour que la sortie reste une
seule liste de raisons lisibles plutôt que trois dialectes.

## Decisions

- Décision : l'antériorité est signalée, pas bloquante.
  - Raison : le champ est déclaré par l'agent ; bloquer sur une donnée non observée
    contredirait la règle « ce qui bloque dur ne peut pas se permettre d'avoir tort ».
  - Conséquence : le README doit dire que l'ordre est *contrôlé*, pas *imposé*.
- Décision : l'absence de données de prédictions désactive le blocage.
  - Raison : rétro-compatibilité silencieuse (décision verrouillée).
  - Conséquence : le mécanisme ne mord que sur les projets qui ont adopté 01.03.
    Écrire ce fait, sinon il se lira comme un bug.
- Décision : le calcul vit dans `predictions.js`, consommé par `verify` et `check`.
  - Raison : deux comptages divergents produiraient deux verdicts différents pour la
    même phase — l'incohérence exacte que cet epic corrige.
  - Conséquence : `check` importe `predictions.js`, un couplage de plus sur le module
    déjà le plus couplé. Acceptable ; ne pas y ajouter de logique.

## Test Plan

`test/verify.test.js` :

- [ ] 1 prédiction sur 2 requises → pas de `done`, exit 1
- [ ] 2 sur 2 → `done`
- [ ] `predictionsRequired` absent → `done`
- [ ] `predictionsRequired: 0` → `done`
- [ ] Aucun `predictions.json` → `done` (rétro-compat)
- [ ] Message contenant le compte réel et attendu
- [ ] L'évidence porte la section prédictions
- [ ] `--no-mark` : contrôle affiché, ledger inchangé
- [ ] Phase avec `stressCheckpoint` : les deux raisons de blocage apparaissent

`test/predictions.test.js` :

- [ ] Anomalie d'antériorité détectée (`at > revealedAt`)
- [ ] Pas d'anomalie quand `revealedAt` est absent
- [ ] Horodatages égaux → pas d'anomalie

`test/check.test.js` :

- [ ] Le message de `check` et celui de `verify` rapportent le même compte

Manuel :

- [ ] Sur le dogfood Fastify : `verify` d'une phase ne bloque pas (aucune donnée).

## Acceptance Traceability

| Acceptance criterion | Test proving it (`file::test`) |
| --- | --- |
| Prédictions manquantes → pas de `done` | `test/verify.test.js::verify bloque sur prédictions manquantes` |
| Compte atteint → `done` | `test/verify.test.js::verify passe quand le compte est atteint` |
| Sans `predictionsRequired` → `done` | `test/verify.test.js::phase sans predictionsRequired` |
| Message avec compte réel/attendu | `test/verify.test.js::le message donne le compte` |
| Anomalie d'antériorité signalée | `test/predictions.test.js::antériorité inversée signalée` |
| Projet hérité non bloqué | `test/verify.test.js::aucun predictions.json ne bloque pas` |
| Évidence avec section prédictions | `test/verify.test.js::l'évidence porte la section prédictions` |

## Commands

- Command: `npm test`
  - Expected: la suite complète passe.
- Command: `node bin/ai-learn.js check --root .`
  - Expected: exit 0 sur ce dépôt.

## Rollback

Retirer le facteur `predictions` du calcul de `ok`. Les évidences déjà écrites
gardent leur section — inerte, jamais relue comme un blocage.
