# Story 02.04 — Audit mutation dans `check` et résumé dans `status`

## Goal

Rendre l'état de mutation visible au quotidien, sans avoir à lancer `verify` :
`ai-learn check` signale une phase `done` dont la mutation n'est plus valable
(même logique de péremption que `sourceHash`, epic 01), et `ai-learn status`
affiche un résumé du score de mutation par phase concernée.

## User Value

Sans cette story, la mutation ne serait visible qu'au moment de `verify` — un
apprenant qui modifie du code après coup ne verrait la régression que beaucoup
plus tard. `check`/`status` sont les commandes consultées en continu (comme
`norm`/le verdict de l'epic 01 le sont déjà) : c'est là que doit vivre le
rappel quotidien.

## Context

`check.js` recalcule déjà `normReport` à chaque appel (ligne ~154,
« toujours revérifier, jamais en cache », décision documentée dans
`docs/plans/norm-clean-code.md`) et compare `evidence.sourceHash` au hash
courant pour chaque phase `done` (ligne ~345-357). `status.js` fait de même
(ligne ~120-128 pour `norm`, ligne ~145-147 pour le hash). La mutation suit
exactement le même double patron : recalcul à chaque appel pour l'audit
courant, lecture de `evidence.mutation` (écrite en 02-03) pour l'historique
d'une phase déjà `done`.

## Requirements

- [ ] `ai-learn check` signale une phase `done` avec `phase.mutation: true` dont
      l'évidence porte `mutation.ok: false`, ou dont un mutant survivrait
      aujourd'hui sur le code actuel (même péremption que `sourceHash` — pas
      seulement ce que l'évidence historique dit).
- [ ] `ai-learn check` **ne recalcule pas** la mutation à chaque appel comme il
      le fait pour `norm` — recalculer imposerait un run complet du checkpoint
      par mutant sur chaque `check`, ce qui casserait le contrat de `check`
      documenté (retour rapide, lecture seule). `check` compare uniquement
      `evidence.sourceHash` (déjà écrit par verify) à la péremption existante :
      un code changé après un `verify` réussi rend la phase `stale` par le
      mécanisme déjà en place (epic 01), qui couvre déjà la mutation
      indirectement puisque `evidence.mutation` fait partie de cette même preuve
      périmée.
- [ ] `ai-learn status` affiche, pour chaque phase avec `phase.mutation: true`,
      le score de mutation de la dernière évidence passante (`X % (N tués / M)`),
      à côté de son état de verdict.
- [ ] `ai-learn status --json` (sortie posée en epic 01 story 01-05) inclut le
      même résumé de mutation par phase, sous une clé stable (`mutation:
      { required, score, killed, mutants }`).
- [ ] Une phase sans `phase.mutation` n'affiche aucune ligne de mutation dans
      `status` — pas de bruit pour les phases qui ne la demandent pas.

## Acceptance Criteria

- [ ] Given une phase `done` avec `phase.mutation: true` dont la dernière
      évidence a `mutation.ok: true`, when `ai-learn check` tourne (code
      inchangé depuis ce `verify`), then aucune erreur de mutation n'est émise.
- [ ] Given une phase `done` avec `phase.mutation: true` dont le code a changé
      depuis le dernier `verify` réussi, when `ai-learn check` tourne, then la
      phase est signalée périmée (mécanisme existant de l'epic 01, sourceHash),
      et le message mentionne que la mutation en fait partie.
- [ ] Given une phase `done` avec `phase.mutation: true` et un score de mutation
      de 80 % dans sa dernière évidence, when `ai-learn status` tourne, then la
      ligne de cette phase affiche « mutation : 80 % (4 tués / 5) ».
- [ ] Given une phase sans `phase.mutation`, when `ai-learn status` tourne,
      then aucune ligne de mutation n'apparaît pour cette phase.
- [ ] Given `ai-learn status --json`, when on lit la sortie pour une phase
      `mutation: true`, then le champ `mutation.score` correspond exactement à
      celui de la dernière évidence passante.
- [ ] Given `ai-learn check` sur ce dépôt lui-même après cette story, when la
      commande tourne, then elle reste verte (aucune régression du contrat de
      vitesse : pas de checkpoint additionnel lancé par `check`).

## Edge Cases

- [ ] Phase `mutation: true` jamais encore vérifiée (`pending`/`in_progress`) —
      aucune ligne de score dans `status` (rien à résumer), cohérent avec le
      comportement déjà existant pour `norm`.
- [ ] Évidence historique avec `mutation.score: null` (aucun site trouvé lors du
      dernier `verify`) — `status` affiche « aucun site mutable » plutôt qu'un
      pourcentage trompeur.
- [ ] `evidence.mutation` absente parce que l'évidence a été écrite par une
      version antérieure à cette story (rétro-compatibilité) — traité comme
      « pas encore mesuré », jamais comme une erreur ni comme 0 %.
- [ ] Phase `mutation: true` en cours de re-preuve (`stale`) — le score affiché
      est celui de la dernière évidence *passante*, explicitement étiqueté comme
      potentiellement obsolète (même sémantique que `sourceHash` périmé).

## UX Notes

Le score de mutation dans `status` doit être visuellement associé à la phase,
pas noyé dans le résumé global de norme déjà affiché — une ligne dédiée, pas un
chiffre ajouté à une phrase existante. Le message de péremption de `check`
doit dire explicitement que la mutation fait partie de ce qui est redevenu
« à re-prouver », pour qu'un apprenant ne pense pas que seul le clean-code est
concerné.

## Dependencies

Dépend de **story-02-03** : consomme la section `evidence.mutation` qu'elle
introduit. Peut s'exécuter en parallèle de **story-02-05** (ledger cross-projet)
une fois 02-03 fusionnée — fichiers disjoints (`check.js`/`status.js` ici,
`tracks/tests.js` pour 02-05).

## Out of Scope

- [ ] Ledger cross-projet `tests.json` — story 02-05.
- [ ] Protocole/documentation (`AGENTS-apprentissage.md`, `commands/learn.md`) —
      story 02-06.
- [ ] Recalcul de la mutation par `check` (explicitement exclu — voir
      Requirements).
