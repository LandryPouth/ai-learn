# Roadmap — ai-learn

> Trois epics, dans cet ordre. Seul l'epic 01 est détaillé en stories
> (`epics/epic-01-verdict-fiable/`) : les epics 02 et 03 reposent sur des
> hypothèses que l'epic 01 va valider ou casser, les détailler maintenant
> serait planifier dans le vide.

## Décisions verrouillées (2026-09-01)

| Décision | Choix | Conséquence |
|---|---|---|
| Découpage | 3 epics, epic 01 détaillé seul | Les epics 02/03 se détaillent quand 01 est prouvé |
| Isolation de la mutation | In-place + backup + restauration | `testCommand` marche sans adaptation ; risque résiduel `kill -9`, réparé au run suivant |
| Compatibilité | Migration silencieuse, rétro-compatible | Une évidence sans hash n'est **jamais** périmée, seulement « non hashée » ; aucun projet existant ne casse |
| Source de vérité des prédictions | JSON source, `.md` généré | L'antériorité devient mécanique ; le `.md` n'est plus éditable à la main |

## Epic 01 — Le verdict est fiable

**Problème.** Le scanner est aujourd'hui rouge pendant tout le temps de travail
d'une phase, et une preuve reste valable indéfiniment même après que le code
qu'elle prouvait a disparu. Un outil dont le verdict est faux dans les deux sens
est un outil qu'on apprend à désactiver.

**Stories** (détail dans `epics/epic-01-verdict-fiable/index.md`) :

1. `story-01-01-trois-etats-du-verdict` — squelette de bout en bout : `verify` écrit
   l'empreinte du code prouvé, `check`/`status`/`next` la lisent, une phase en cours
   n'est plus une erreur.
2. `story-01-02-preuve-perimee-a-reprouver` — une preuve périmée fait redescendre la
   phase à « à re-prouver », sans jamais écrire `done` en douce.
3. `story-01-03-predictions-donnees` — `ai-learn predict`, `.ai-learn/predictions.json`
   horodaté source de vérité, `docs/plans/predictions.md` régénéré.
4. `story-01-04-verify-exige-predictions` — blocage dur, par phase, avec antériorité
   prédiction < révélation vérifiée mécaniquement.
5. `story-01-05-pilotage-cli` — parseur d'arguments partagé (le bug `--dir` qui avale
   le positionnel) + `--json` sur `check`/`status`/`next`.
6. `story-01-06-depot-tient-ses-promesses` — CI Windows/macOS, `CHANGELOG.md`,
   `docs/plans/` reconstitué (6 références mortes dans le code).

## Epic 02 — Les tests de l'apprenant sont prouvés par mutation

**Problème.** Si l'apprenant écrit les tests, il écrit la preuve — et `assert(true)`
passe. La mutation est la seule sortie mécanique : on casse le code, le test doit
tomber. Sans elle, ne pas faire la feature.

**Stories pressenties** (à détailler après l'epic 01) :

1. `mutate` de bout en bout : un opérateur, un mutant, in-place + backup +
   restauration prouvée, rapport `fichier:ligne — opérateur — SURVÉCU`, exit 1.
2. Banque d'opérateurs par stack pack (`bin/lib/stacks/*.js`, à côté de `norm` et
   `stresses`) + `.ai-learn/mutate.json` câblé par `init`/`update`.
3. Blocage dur dans `verify` (champ de phase `mutation`) + section `mutation` dans
   l'évidence, symétrique de `norm`.
4. Audit projet dans `check` + résumé dans `status`.
5. Ledger cross-projet `~/.ai-learn/tracks/tests.json`, 6 tiers, calqué sur
   `tracks/git.js`. Le tier « rouge d'abord » se lit **des évidences déjà sur
   disque** : une évidence `ok:false` puis une `ok:true` pour la même phase = ordre
   observé, pas déclaré.
6. Protocole : `AGENTS-apprentissage.md` §3quinquies (prédire *quel test doit
   tomber*), `commands/learn.md`, `checkpoint/README.md` (distinguer `checkpoint/`
   = preuve du tool de `test/` = travail de l'apprenant), README.

**Dépend de l'epic 01** : la section `mutation` de l'évidence et le blocage `verify`
reposent sur le modèle d'états et le hash posés par les stories 01-01/01-02.

## Epic 03 — Le mode dirigeant

**Problème.** « On ne code plus, on dirige » n'est vrai que si la compétence de
juger est prouvée. Sinon c'est le tutoriel avec un diff à la place de la vidéo.

**Stories pressenties** :

1. `.ai-learn/guard.json` gagne `mode: "apprenti" | "dirigeant"` ; en dirigeant,
   `learnerFiles` s'inverse (`test/**`, `checkpoint/**`) — l'IA écrit
   l'implémentation, l'apprenant garde la spécification.
2. `ai-learn mode dirigeant` refuse tant que les tiers 1-3 de
   `~/.ai-learn/tracks/tests.json` ne sont pas atteints. Le mode se prouve.
3. Tier « revue » : `docs/reviews/<brique>.md` citant un `fichier:ligne` du diff et
   une décision. Vérification par le contrat presence+substance déjà écrit
   (`check.js#citesRealPRUrl`) — réutiliser, ne pas réécrire.
4. `check` en mode dirigeant : erreur si une phase `done` n'a aucun test écrit par
   l'apprenant qui tue au moins un mutant.

**Dépend de l'epic 02** entièrement.

## Ligne rouge produit

Le mode dirigeant n'est pas un raccourci, c'est un statut prouvé. Le jour où le
README écrit « plus besoin de coder », l'outil devient le tutoriel qu'il combat.
