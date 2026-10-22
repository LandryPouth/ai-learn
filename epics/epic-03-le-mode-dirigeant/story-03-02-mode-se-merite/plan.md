# Plan — Story 03.02

## Implementation Context

Fichiers probables :

- bin/lib/mode.js (nouveau)
- bin/ai-learn.js (dispatch + aide)
- bin/lib/tracks/tests.js (lecture seule)
- bin/lib/check.js (écart mode ↔ ledger)
- test/mode.test.js (nouveau)
- templates/AGENTS-apprentissage.md, README.md, docs/project-context.md, docs/architecture.md (doc du statut prouvé et de la limite assumée)

Ancres de recherche : `readOrDefaultTestsTracks`, `TIER_IDS`, `loadGuardConfig`

Mode d'exécution : `STRICT`

Scout pre-step : `no` — les points d'intégration sont nommés ci-dessus.

À éviter sauf nécessité : bin/lib/tracks/tests.js (aucune écriture)

## Decisions

- **Résolu — la porte lit le ledger, ne le modifie jamais.** `mode.js` appelle `readTestsTracks`/`validateTestsTracks` et s'arrête là. Un ledger illisible **refuse** (échec fermé), contrairement aux syncs qui échouent en silence : les syncs n'ajoutent que des preuves (un échec perd une observation, sans danger), tandis que la porte **autorise un mode** — un ledger absent, corrompu ou de version inconnue ne prouve rien et ne doit donc jamais ouvrir `dirigeant`. Ce choix est documenté dans `docs/architecture.md` comme l'unique exception assumée à la règle « fail-open ».
- **Résolu — le ledger reste éditable à la main, et c'est dit.** La porte est un garde-fou pédagogique, pas un contrôle de sécurité : elle rend le statut cohérent avec les preuves, elle ne prétend pas rendre la triche impossible. `templates/AGENTS-apprentissage.md` et le README l'écrivent explicitement. En contrepartie, `check` signale en **erreur** un `guard.json` passé en `dirigeant` à la main quand le ledger ne prouve pas les tiers 1-3 — l'écart devient visible même s'il n'est pas empêché.
- **Résolu — la bascule est tracée dans `guard.json`.** Champs additifs `modeChangedAt` (ISO) et `modeTiers` (tiers 1-3 observés au moment de la bascule), à côté de `mode`. Les autres champs du fichier sont préservés (scope custom, `blockedCommands`). Après écriture, `ensureGuardHook` re-rend le profil Codex et le README généré pour que le mode ne soit pas à moitié appliqué selon la plateforme.
- **Résolu — `apprenti` est inconditionnel.** Le retour ne lit pas le ledger comme condition : même absent/corrompu, il est permis. `modeTiers` retombe alors sur les tiers lisibles (vide si illisible) pour ne pas inventer une preuve.
- **Résolu — un seul verdict partagé.** `requiredTiersStatus`/`formatLedgerRefusal` vivent dans `mode.js` et sont réutilisés par `check.js` : la commande et l'audit ne peuvent pas diverger sur ce qu'« atteint » veut dire.
- **Résolu (revue indépendante) — le ledger global est protégé par le guard.** `~/.ai-learn/**` vit hors de la racine projet, où `toRelative` renvoie `null` et le guard laissait passer : l'IA pouvait réécrire `tracks/tests.json`, puis basculer le mode avec sa propre preuve fabriquée. `guard.js#isHomeAiLearnPath` refuse désormais Write/Edit/MultiEdit et les écritures Bash reconnues sur ce répertoire, comme sur `guard.json`. La protection résout les chemins **via realpath** (racine et cible) : un symlink interne (`ln -s ~/.ai-learn evil`) ne contourne plus rien, et le chemin résolu sert aussi aux contrôles protégé/apprenant, fermant la même faille pour `guard.json` et `test/**`. `guardRelatives` juge le chemin **lexical et** le `realpath`, et refuse si l'un des deux touche le set protégé/apprenant : un symlink qui pointe hors de la racine reste bloqué par son chemin lexical (son relatif résolu vaut `null`), là où juger le seul realpath ouvrait `src/**`. `~`, `~<login du compte courant>`, `$HOME`/`${HOME}` sont expansés (un autre login reste non résolu plutôt que rabattu sur `$HOME`), et le `realpath` du home est comparé au `realpath` de la cible — un `$HOME` symlinké ne déplace plus le ledger hors de la comparaison. Limite assumée : Bash reste une haie (un chemin calculé ou un autre `$VAR` échappe au détecteur), et le ledger reste éditable par l'apprenant — c'est un garde-fou pédagogique, pas un sandbox.
- **Suivi (revue, LOW) — les évidences `.ai-learn/runs/*.json` ne sont pas protégées.** Elles alimentent le ledger via `syncTestsTrack`, donc les forger reste un chemin théorique vers des tiers fabriqués ; c'est le même régime de confiance que le ledger éditable, hors du périmètre « porte + écarts » de cette story. À traiter si le mode devient une frontière de sécurité (signature des évidences) — noté, non corrigé ici.
- **Résolu (revue) — la bascule est atomique côté `guard.json`.** Si `ensureGuardHook` échoue après l'écriture, l'ancien contenu est restauré et la commande échoue (pas de mode appliqué avec un profil Codex resté sur l'ancien mode). Un `.codex/config.toml` personnalisé (non généré) est signalé en warning au lieu d'être silencieusement laissé périmé.
- **Résolu (revue) — le check d'un projet cloné hors machine reste une erreur.** Le ledger est global et home-scoped ; sur une autre machine il n'existe pas, donc `check` refuse `dirigeant` (AC5). C'est la conséquence assumée d'un statut « prouvé, pas déclaré » : la preuve se re-émet localement. Le message nomme le ledger absent et la commande à lancer.
- **Résolu — `--dir` et `--platform` ne mangent pas le positional.** Le dispatch `mode` déclare les deux flags à valeur.

## Test Plan

- [x] Unit : chaque tier manquant isolément — `test/mode.test.js`.
- [x] Intégration : ledger absent, corrompu et version inconnue → refus — `test/mode.test.js`.
- [x] Intégration : `mode apprenti` toujours permis (ledger absent/corrompu) — `test/mode.test.js`.
- [x] Intégration : `check` signale l'écart `dirigeant` ↔ ledger (et se tait en apprenti) — `test/mode.test.js`.
- [x] CLI : refus end-to-end exit 1 nommant le tier, et bascule end-to-end qui recâble le guard — `test/mode.test.js`.
- [x] Négatif : neutraliser la lecture du ledger (`if (false && …)`) → 5 tests de refus échouent ; restauré → vert.

## Acceptance Traceability

| Acceptance criterion | Test proving it |
| --- | --- |
| Given les tiers 1-3 atteints, when `ai-learn mode dirigeant` tourne, then `guard.json` passe en `mode: "dirigeant"` et la bascule est tracée | `test/mode.test.js` :: `dirigeant is granted when tiers 1-3 are achieved, and the switch is traced` |
| Given le tier 3 (« rouge d'abord ») non atteint, when la commande tourne, then elle refuse, exit 1, et nomme le tier manquant | `test/mode.test.js` :: `each missing tier refuses and names what would achieve it` + `the CLI refuses dirigeant end to end, naming the missing tier` |
| Given un ledger absent, corrompu ou de version inconnue, when la commande tourne, then elle refuse | `test/mode.test.js` :: `an absent ledger refuses — never access by default` + `a corrupt ledger refuses` + `an unknown ledger version refuses` |
| Given `ai-learn mode apprenti`, when il tourne, then le retour est toujours permis, sans condition | `test/mode.test.js` :: `mode apprenti is always permitted, even with an absent ledger and no guard.json` + `mode apprenti is always permitted, even with a corrupt ledger` |
| Given une édition manuelle de `guard.json` vers `dirigeant` sans passer par la commande, when `check` tourne, then l'écart avec le ledger est signalé en erreur | `test/mode.test.js` :: `check errors when guard.json claims dirigeant without the ledger proof` + `check errors when guard.json claims dirigeant and the ledger is absent` |

## Commands

- Command: `npm test`
  - Expected: la suite complète passe.

## Rollback

Revert du commit de la story ; aucune migration de données hors champs additifs
(`modeChangedAt`, `modeTiers` — un ancien binaire les ignore, le mode retombe
proprement en `apprenti`).
