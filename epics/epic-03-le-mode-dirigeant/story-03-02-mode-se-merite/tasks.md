# Tasks — Story 03.02

## Status: done

## Pre-Implementation

- [x] Lire `plan.md`, `RULES.md`, et les fichiers « probables » ci-dessus
- [x] Rejouer le comportement actuel sur un projet temporaire (état de départ)

## Implementation Tasks

- [x] Implémenter le plus petit changement qui satisfait les critères, dans l'ordre du plan
- [x] Trancher chaque « Décision à prendre » dans `plan.md` avant d'écrire le code concerné

## Testing Tasks

- [x] Écrire les tests du Test Plan (rouge d'abord pour toute logique de décision)
- [x] Remplir la table `Acceptance Traceability` avec les vrais `file::test`

## Validation Tasks

- [x] `npm test`
- [x] `ai-flow verify --story <dir>`

## Result

### Changed

- `bin/lib/mode.js` (nouveau) : `ai-learn mode <apprenti|dirigeant>`.
  `requiredTiersStatus` lit `~/.ai-learn/tracks/tests.json` (jamais d'écriture),
  valide la version et le schéma, puis répond tiers 1-3 atteints ou non. Un
  ledger absent/corrompu/version inconnue **refuse** (échec fermé) ; `apprenti`
  est toujours permis. La bascule écrit `mode`, `modeChangedAt` et `modeTiers`
  dans `guard.json` en préservant les autres champs, puis appelle
  `ensureGuardHook` pour re-rendre le profil Codex et le README généré.
- `bin/ai-learn.js` : dispatch `mode` + catalogue d'aide.
- `bin/lib/check.js` : en `dirigeant`, une divergence entre `guard.json` et le
  ledger (tier manquant, ledger absent/corrompu) est une **erreur**, pas un
  warning — une édition manuelle ne passe plus silencieusement.
- `bin/lib/guard.js` (revue indépendante) : `isHomeAiLearnPath` refuse à l'IA
  Write/Edit/MultiEdit et les écritures Bash reconnues sur `~/.ai-learn/**` —
  sans cela l'IA pouvait fabriquer `tracks/tests.json` puis se basculer elle-même
  en `dirigeant`. `guardRelatives` juge le chemin lexical **et** son `realpath`
  et refuse si l'un des deux touche le set protégé/apprenant : un symlink
  interne vers `guard.json`/`test/**` est bloqué, et un symlink interne qui
  pointe **hors** de la racine reste bloqué par son chemin lexical (le résolu
  vaut `null`). `~`, `~<login courant>` et `$HOME` sont expansés (un autre login
  n'est pas rabattu sur `$HOME`). La bascule restaure
  **tous** les fichiers générés (guard.json, profil Codex, README) si le câblage
  échoue, et un `.codex/config.toml` personnalisé est signalé au lieu d'être
  laissé silencieusement sur l'ancien mode. Correctif de revue : `guardRelatives`
  juge le chemin lexical **et** le realpath, donc un symlink interne pointant
  hors de la racine ne rouvre plus `src/**` ; les constantes `MODE_*` sont
  importées depuis `guard.js` au lieu d'être dupliquées ; `expandHome` n'expanse
  `~<login>` que pour le compte courant.
- `templates/AGENTS-apprentissage.md`, `README.md`, `docs/project-context.md`,
  `docs/architecture.md` : le mode se mérite, la limite « garde-fou
  pédagogique, pas contrôle de sécurité » est écrite, et l'exception fail-closed
  est justifiée face à la règle fail-open du guard.
- `test/mode.test.js` (nouveau) : 19 tests (unit gate, ledger absent/corrompu/
  version, guard.json corrompu préservé/récupéré, apprenti inconditionnel,
  rollback du câblage, warning Codex, `check` apprenti/dirigeant, CLI end-to-end,
  `--platform` avant le positional).

### Validation

- `npm test` — 577 tests, 0 échec.
- `node --test test/mode.test.js` — 19/19 ; `test/guard.test.js` — 58/58.
- Négatif (rouge d'abord) : `if (false && …)` sur la porte → 5 tests de refus
  échouent ; restauré → 19/19 verts.
- `ai-flow verify --story …` — voir l'évidence capturée.

### Rollback Notes

Revert du commit de la story. Champs ajoutés à `guard.json` purement additifs
(`modeChangedAt`, `modeTiers`) : un ancien binaire les ignore et retombe sur
`apprenti` s'il ne connaît pas `mode`. Aucune migration de données ; le ledger
global n'est jamais modifié par la commande.

### Follow-ups

- Story 03.03 (tier revue) et 03.04 (`check` exige un test tueur) restent à
  livrer ; `check` n'expose pour l'instant que le contrôle mode ↔ ledger.
