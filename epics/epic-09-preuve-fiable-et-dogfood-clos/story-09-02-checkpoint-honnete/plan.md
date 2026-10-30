# Plan — Story 09.02

## Implementation Context

Fichiers probables :

- bin/lib/source-hash.js (`computeLearnerHash`, `computeCheckpointHash`)
- bin/lib/verify.js (empreintes dans l'évidence, refus zéro-test)
- bin/lib/exec.js (`zeroTestsRan(result)`, groupe de processus)
- bin/lib/progress.js (`phaseVerdict` : `reason: "checkpoint-changed"`, `contractChanges` toléré par `validateProgress`)
- bin/lib/check.js (vert par le test, checkpoint hors code apprenant)
- bin/lib/status.js, bin/lib/next.js (affichage du motif)
- templates/AGENTS-apprentissage.md (§5 : quand et comment consigner `contractChanges`)
- test/verify.test.js, test/check.test.js, test/exec.test.js, test/status.test.js

Ancres : `phaseVerdict`, `computeSourceHash`, `checkpointFilePath`, `runCommand`, `portabilityHint`, `allEvidenceForPhase`

Mode : `STRICT` · scout pre-step : `no`

À éviter : changer la sémantique de `sourceHash` (les preuves existantes doivent rester lisibles) ; bloquer sur une heuristique (seuls zéro-test et checkpoint modifié pèsent sur le verdict).

## Decisions

- **Zéro test = échec dur** : aucune lecture légitime d'un checkpoint qui n'a rien exécuté n'en fait une preuve. Les motifs sont ceux des runners documentés par les packs de stack ; un runner inconnu n'est jamais refusé (pas de faux négatif bloquant).
- **Checkpoint modifié = `stale`, pas rouge** : la phase garde son histoire ; `verify` suffit à re-prouver sur le nouveau contrat. C'est le chemin `stale` existant, avec un motif nommé.
- **Vert par le test = avertissement** : le cas Fastify du 30/09 (phases 1-3 rouges puis vertes en 2 minutes après le passage à Postgres) est probablement une évolution de contrat légitime ; l'outil ne peut pas trancher, il le rend visible et laisse l'apprenant le consigner.
- **`contractChanges` écrit par l'agent à la demande de l'apprenant** : même discipline que le reste de `progress.json` ; le guard de `s3` ne le protège pas.

## Test Plan

TDD : chaque motif zéro-test (sorties figées) ; `phaseVerdict` avec commande changée ; séquence rouge→vert par le test sur fixtures d'évidences ; évidences anciennes sans nouveaux champs ; reproduction du processus d'arrière-plan dans un test (port libre, délai court) avant tout correctif.

## Acceptance Traceability

| Critère | Preuve |
|---|---|
| checkpoint modifié | test/check.test.js::a changed checkpoint command makes the proof stale |
| vert par le test | test/check.test.js::green obtained by changing only the checkpoint is warned |
| contractChanges | test/check.test.js::a recorded contract change silences the warning |
| zéro test | test/verify.test.js::a checkpoint that ran zero tests never proves a phase |
| motifs | test/exec.test.js::zeroTestsRan recognises each runner and nothing else |
| hors code | test/check.test.js::a checkpoint file that never mentions learner files is warned |
| rétro-compat | test/check.test.js::old evidence without split hashes raises nothing new |
| arrière-plan | test/exec.test.js::a backgrounded server does not hold verify until the timeout (ou Result) |

## Commands

```
npm test
```
