# Story 02.03 — `verify` exige la mutation

## Goal

Faire de la mutation une condition de blocage dur de `ai-learn verify`, au même
titre que la norme clean-code et les prédictions : une phase déclarée `mutation:
true` ne peut être marquée `done` que si tous ses mutants ont été tués.

## User Value

Sans ce blocage, `ai-learn mutate` reste un outil que l'apprenant peut ignorer.
Le verdict de l'outil (epic 01 : « le verdict est fiable ») doit inclure la
mutation pour que la thèse tienne jusqu'au bout — une phase ne peut pas être
« prouvée » si son test ne protège rien.

## Context

`verify.js` calcule déjà, inconditionnellement, trois blocages symétriques :
`normReport` (clean-code), `missingArtifacts`, `predReport` (prédictions,
epic 01 story 01-04). Chacun ajoute sa section à `evidence` et participe au
calcul final de `ok`. La mutation suit exactement ce patron, avec une différence :
elle n'est vérifiée **que pour les phases qui le demandent explicitement**
(`phase.mutation === true`), parce que muter le code prend un temps non
négligeable (un run complet du checkpoint par mutant) — l'imposer à toutes les
phases sans distinction pénaliserait des phases triviales (une phase 0 qui
n'écrit qu'un `console.log`, par exemple).

## Requirements

- [ ] `progress.js#validateProgress` accepte un champ optionnel `phase.mutation`
      (booléen), avec un warning si sa valeur n'est pas un booléen — même
      discipline que `phase.gitTier`/`phase.stressCheckpoint`.
- [ ] `verify.js` calcule un rapport de mutation pour toute phase où
      `phase.mutation === true`, en réutilisant le moteur de 02-01/02-02
      (mêmes opérateurs, même périmètre `learnerFiles`).
- [ ] L'évidence gagne une section `mutation` (miroir de `norm`/`predictions`) :
      `{ ok, required, mutants, killed, survived, score }`. Pour une phase sans
      `phase.mutation`, cette section est `{ ok: true, required: false, ... }` —
      jamais absente, pour que `check`/`status` (02-04) aient toujours une forme
      stable à lire.
- [ ] `ok` global de `verify` intègre `mutationReport.ok` exactement comme
      `normReport`/`predReport` déjà présents.
- [ ] Un mutant survivant sur une phase `mutation: true` bloque le passage à
      `done`, avec un message listant les sites survécus (même format que le
      rapport `mutate` — `fichier:ligne — opérateur`).
- [ ] Une phase `mutation: true` sans aucun site mutable trouvé n'est **pas**
      bloquée (décision verrouillée dans `index.md` — absence de matière n'est
      jamais un échec).
- [ ] Une phase déjà `done` dont la mutation ne passe plus (code changé, un
      mutant survit maintenant) est rétrogradée à `in_progress` — même mécanisme
      de démotion que la story 01-02 pour un `sourceHash` périmé.

## Acceptance Criteria

- [ ] Given une phase `mutation: true` dont tous les mutants trouvés sont tués,
      when `ai-learn verify <id>` tourne (checkpoint par ailleurs vert), then la
      phase est marquée `done` et `evidence.mutation.ok` est `true`.
- [ ] Given une phase `mutation: true` avec au moins un mutant survécu, when
      `ai-learn verify <id>` tourne, then la phase n'est pas marquée `done`,
      `evidence.mutation.ok` est `false`, et le message liste le(s) site(s)
      survécu(s).
- [ ] Given une phase `mutation: true` sans aucun site mutable dans son
      périmètre, when `ai-learn verify <id>` tourne (checkpoint vert), then la
      phase est marquée `done` normalement.
- [ ] Given une phase sans `mutation` déclaré, when `ai-learn verify <id>`
      tourne, then `evidence.mutation` existe avec `required: false` et `ok: true`,
      et son absence ne change jamais le verdict global.
- [ ] Given une phase déjà `done` avec mutation exigée, when le code change et
      qu'un mutant se met à survivre, then `ai-learn verify <id>` rétrograde la
      phase à `in_progress` avec un message explicite.
- [ ] Given `phase.mutation` avec une valeur non booléenne dans `progress.json`,
      when `ai-learn verify`/`check` tourne, then un warning est émis (jamais
      une erreur bloquante), et la mutation n'est pas exigée.

## Edge Cases

- [ ] Une phase `mutation: true` mais sans `checkpoint` déclaré — même erreur
      que `verify` sans checkpoint (le blocage de base, inchangé).
- [ ] Le checkpoint de base échoue déjà (avant toute mutation) — `verify` échoue
      pour cette raison seule, la mutation n'est pas calculée en plus (cohérent
      avec 02-01 : un test déjà rouge ne prouve rien).
- [ ] `--no-mark` (flag existant de `verify`) — la mutation est quand même
      calculée et écrite dans l'évidence (même contrat que `norm`/`predictions`,
      qui sont déjà inconditionnels), mais ne déclenche aucune écriture de
      statut.
- [ ] `maxMutantsPerRun` atteint pendant un `verify` bloquant — le run partiel
      compte les mutants réellement testés ; les mutants non atteints ne sont ni
      tués ni survécus, et cela doit être visible dans l'évidence (`truncated: true`)
      plutôt que silencieusement ignoré.

## UX Notes

Le message de blocage doit citer le(s) site(s) survécu(s) au format déjà appris
par `ai-learn mutate` (`fichier:ligne — opérateur — SURVÉCU`) — pas un nouveau
vocabulaire pour la même information. La suggestion de correction doit pointer
vers `ai-learn mutate --phase <id>` pour rejouer l'investigation en dehors de
`verify`.

## Dependencies

Dépend de **story-02-02** : le calcul de mutation réutilise le moteur complet
(banque d'opérateurs, score, config `.ai-learn/mutate.json`). Ne peut pas
démarrer avant que 02-02 soit fusionnée.

## Out of Scope

- [ ] Audit `check`/résumé `status` sur l'état de la mutation projet — story 02-04
      (cette story ne touche que `verify`/`progress.js`).
- [ ] Ledger cross-projet `tests.json` — story 02-05.
- [ ] Sortie `--json` de `verify` — non concernée par cette story (le champ
      `--json` existant de `check`/`status`/`next`, epic 01 story 01-05, n'inclut
      pas `verify`).
