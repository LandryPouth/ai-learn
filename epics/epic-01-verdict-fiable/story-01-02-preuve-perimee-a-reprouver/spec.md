# Story 01.02 — Une preuve périmée redevient à prouver

## Goal

Fermer la boucle ouverte par la story 01.01 : une phase dont la preuve ne tient plus
doit revenir dans le flux de travail — être proposée par `next`, redescendre de
`done`, et dire *quoi* a changé — sans jamais qu'un `done` soit écrit ailleurs que
par `verify`.

## User Value

Aujourd'hui une régression n'a aucun chemin de retour : une phase `done` le reste
pour toujours, et l'apprenant n'a aucun moyen de savoir qu'il doit y revenir. La
péremption détectée en 01.01 devient une consigne actionnable au lieu d'un constat.

## Context

Trois manques constatés à l'audit :

1. Aucun moyen de dé-marquer une phase. `setPhaseStatus` n'est appelé que pour
   écrire `done`.
2. `verify --no-mark` produit une évidence passante sans marquer la phase — que
   `check` signale ensuite comme dérive : *« has passing evidence but is not marked
   done (stale or reverted?) »*. Un warning déclenché par un usage normal du flag.
3. Le message de péremption de la story 01.01 dit qu'il y a eu un changement mais
   pas lequel — l'apprenant ne sait pas s'il vient de casser quelque chose ou s'il
   a simplement avancé.

## Requirements

- [ ] `verify` reste le seul écrivain du statut d'une phase, **dans les deux sens**.
- [ ] Un `verify` qui échoue sur une phase actuellement `done` la fait redescendre à
      `in_progress`, avec un message explicite.
- [ ] Un `verify` qui échoue sur une phase non-`done` ne change pas son statut
      (comportement actuel préservé).
- [ ] Une évidence écrite avec `--no-mark` est identifiable comme telle et ne
      déclenche plus le warning de dérive.
- [ ] `next` propose une phase périmée avant toute phase `pending` ultérieure.
- [ ] Le message de péremption nomme les fichiers qui ont changé (au moins les
      premiers, et leur nombre total).

## Acceptance Criteria

- [ ] Given une phase `done` prouvée, when le code est modifié et `ai-learn verify <id>` échoue, then la phase repasse à `in_progress` et le message le dit explicitement.
- [ ] Given une phase `pending` sans preuve, when `ai-learn verify <id>` échoue, then son statut reste `pending`.
- [ ] Given une phase `done` prouvée, when `ai-learn verify <id>` réussit à nouveau, then elle reste `done` avec une évidence fraîche.
- [ ] Given une évidence écrite avec `--no-mark`, when `ai-learn check` tourne, then aucun warning de dérive n'est émis pour cette phase.
- [ ] Given une phase périmée et une phase `pending` plus loin dans le parcours, when `ai-learn next` tourne, then la phase périmée est présentée en premier.
- [ ] Given une phase périmée dont trois fichiers ont changé, when `ai-learn check` tourne, then le message nomme au moins un fichier changé et indique le nombre total.
- [ ] Given toutes les phases `done` et à jour, when `ai-learn next` tourne, then le message de parcours terminé est inchangé.

## Edge Cases

- [ ] Phase périmée **et** artefact manquant simultanément — les deux doivent être
      signalés, pas seulement le premier rencontré.
- [ ] Fichier supprimé (et non modifié) dans le périmètre de l'empreinte.
- [ ] Fichier ajouté dans `src/**` sans qu'aucun fichier existant ne change.
- [ ] Plusieurs phases périmées à la fois.
- [ ] Évidence sans empreinte (héritée) — jamais périmée, donc jamais rétrogradée.
- [ ] `verify --no-mark` sur une phase déjà `done` : ne doit rien rétrograder.

## UX Notes

La rétrogradation doit se lire comme une information neutre, pas comme une sanction :
elle dit ce qui a changé et quelle commande relancer. Ne pas suggérer que l'apprenant
a fait une erreur — avancer sur une phase déjà prouvée est le cas normal.

## Dependencies

- Dépendance : story 01.01 (le verdict et l'empreinte).

## Out of Scope

- [ ] Recalculer l'empreinte fichier par fichier pour un diff détaillé ligne à ligne.
- [ ] Toute forme d'historique des états d'une phase.
- [ ] La sortie `--json` — story 01.05.
