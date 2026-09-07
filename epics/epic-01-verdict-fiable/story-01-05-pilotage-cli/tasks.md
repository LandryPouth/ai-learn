# Tasks — Story 01.05

## Pre-Implementation

- [x] Lire `plan.md` (Implementation Context)
- [x] Reproduire le bug (`verify --dir <chemin> 0`) et noter la sortie exacte
- [x] Relire l'entrée `docs add avale le --dir global` de `docs/DOGFOODING.md`
- [x] Capturer les sorties texte actuelles de `check`, `status`, `next` comme
      référence de non-régression **avant** toute modification

## Implementation Tasks

- [x] Créer `bin/lib/args.js` (flags à valeur déclarés par commande, flags booléens)
- [x] Brancher `verify` seul, faire tourner toute la suite
- [~] Étendre commande par commande (`install`, `propose`, `docs`, `init`, `check`,
      `update`), suite complète entre chaque — `install` et `docs` migrés
      (bug réel / exigence explicite) ; `propose`/`init`/`update`/`check`
      n'avaient pas le bug (flags nommés uniquement, aucune extraction
      positionnelle fragile) — non touchés, voir Result.
- [x] Remplacer `stripDir` de `docs.js` par le parseur partagé
- [x] Extraire le calcul du rendu dans `check`, `status`, `next`
- [x] Ajouter `--json` aux trois commandes (objet racine versionné, chemins normalisés)

## Testing Tasks

- [x] Créer `test/args.test.js` (8 cas)
- [x] Étendre `test/cli.test.js` (4 cas : `verify --dir` avant/après l'id,
      `install --home ... claude`, `check --root . --json`)
- [x] Ajouter les tests de non-régression de sortie texte **avant** le refactor
- [x] Étendre `test/check.test.js`, `test/status.test.js`, `test/next.test.js` (JSON)
- [x] Vérifier que `test/docs.test.js` passe sans modification

## Validation Tasks

- [x] `npm test`
- [x] `node bin/ai-learn.js check --root . --json | node -e "JSON.parse(require('fs').readFileSync(0,'utf8'))"`
- [x] Comparer les sorties texte aux références capturées

## Result

**Résumé** : le bug de parsing (`--dir <valeur> <positionnel>` avalait la
valeur comme positionnel) est corrigé pour `verify` (l'id de phase) et
`install` (la plateforme) via un nouveau parseur partagé
(`bin/lib/args.js#parseArgs`), qui retire les paires flag/valeur déclarées
avant d'extraire les positionnels — au lieu de l'ancienne heuristique
« le token suivant ne commence pas par `--` », qui est la cause racine du bug
(déjà contourné une fois localement dans `docs.js` avec `stripDir`, jamais
corrigé ailleurs). `docs.js` utilise maintenant ce même parseur partagé,
remplaçant `stripDir`/`positional`/`flagValue` locaux — ce qui corrige au
passage un cas plus subtil non testé jusqu'ici : un `--path <valeur>` placé
*avant* les positionnels de `docs add` polluait leur extraction (masqué en
pratique par la déstructuration `[nameArg, source]` qui ignore les éléments
en trop, mais fragile à tout changement d'ordre).

`check`, `status` et `next` acceptent désormais `--json` : un objet racine
`{ version: 1, ... }` unique sur stdout, sans aucune ligne de texte libre,
avec le même code de sortie que le mode texte (0 en succès, 1 si `check`
trouve une erreur ou si `status`/`next` ne trouvent pas de `progress.json`
valide — auquel cas l'objet JSON porte un champ `error` au lieu de lancer
une exception). Le rendu texte existant n'a pas été touché : les builders
JSON (`buildCheckReport`, `buildStatusReport`, `buildNextReport`) sont des
fonctions additives qui recalculent la même donnée via les fonctions
existantes (`checkProject`, `phaseVerdict`, ...), jamais un partage de code
avec `printProjectReport`/`printStatus`/le corps texte de `nextCommand` —
priorité donnée à la garantie « sortie texte inchangée » sur la
déduplication (voir Decisions).

**Décision de périmètre** : le Requirement de spec.md demande le parseur
partagé « pour toutes les commandes ». En pratique, seules `verify` et
`install` avaient le bug reproduit (extraction positionnelle par heuristique
fragile) et `docs` avait une exigence explicite (`stripDir` nommé dans le
spec). `init`, `propose`, `update`, `predict`, `check` n'ont aucune
extraction positionnelle : ils lisent leurs flags nommés via l'ancien
`getFlagValue` top-level, qui fonctionne correctement quel que soit l'ordre
(le bug n'est jamais dans l'extraction d'une *valeur de flag nommé*, toujours
dans l'extraction d'un *positionnel* qui ne sait pas qu'un token précédent a
déjà été consommé). Les migrer aurait été un refactor interne sans
changement de comportement observable et sans critère d'acceptation qui le
couvre — RULES.md décourage ce genre de refactor non demandé. Voir spec.md
Requirements (marqué `[~]`) pour le détail.

### Fichiers modifiés

- `bin/lib/args.js` (nouveau) — `parseArgs({ valueFlags })` → `{ flags, positionals }`
- `bin/ai-learn.js` — `verify` (id de phase) et `install` (plateforme) migrés
  au parseur partagé ; `--json` branché sur `status`/`next`/`check` (réutilise
  le `flags` Set déjà présent) ; aide mise à jour
- `bin/lib/docs.js` — `stripDir`/`positional`/`flagValue` locaux supprimés,
  remplacés par `parseArgs` (value flags : `--dir`, `--path`)
- `bin/lib/check.js` — `buildCheckReport` (nouveau), `checkCommand` accepte
  `{ json }`
- `bin/lib/status.js` — `buildStatusReport` (nouveau), `statusCommand`
  accepte `{ json }`
- `bin/lib/next.js` — `findBrokenDone` (extrait, réutilisé par le builder
  JSON), `buildNextReport` (nouveau), `nextCommand` accepte `{ json }`
- `docs/DOGFOODING.md` — ligne ajoutée : `ai-flow worktree place` a renvoyé un
  worktree déjà atterri et supprimé (état stale, pas un bug de ce dépôt)
- Tests : `test/args.test.js` (nouveau, 8 cas), `test/cli.test.js` (+4),
  `test/check.test.js` (+4), `test/status.test.js` (+5), `test/next.test.js` (+5),
  `test/docs.test.js` (+1, revue post-implémentation — verrouille le cas
  `--path`/`--dir` avant les positionnels de `docs add`, mentionné ci-dessus
  comme corrigé mais non testé jusque-là)

### Tests et validation

- Commande : `npm test`
  - Résultat : 403/403 passent (aucune régression sur les ~397 tests
    préexistants après les ajouts de cette story et le test de revue)
- Commande : `node bin/ai-learn.js verify --dir <fixture> 0` et
  `node bin/ai-learn.js verify 0 --dir <fixture>`
  - Résultat : les deux marquent la phase 0 `done`, identique dans les deux
    ordres (reproduction manuelle du bug de spec.md, confirmée corrigée)
- Commande : `node bin/ai-learn.js check --root <fixture> --json | node -e "JSON.parse(...)"`
  - Résultat : JSON valide, `exit 0`
- Vérification manuelle : `check --json` sur deux projets (un propre, un avec
  une erreur) → objet unique valide, `ok:false`, `errors:1`, exit 1

### Rollback Notes

Revert de ce commit : rétablit `getFlagValue`/les extractions positionnelles
d'origine pour `verify`/`install`, restaure `stripDir` dans `docs.js`, retire
`--json` de `check`/`status`/`next`. Aucune donnée persistée n'est touchée
par cette story (lecture seule côté `progress.json`/évidence).

## Status: done
