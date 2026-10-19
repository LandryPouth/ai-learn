# Tasks — Story 03.01

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

`guard.json` porte désormais `mode` ; en `dirigeant`, le périmètre du guard
s'inverse — l'IA écrit `src/**`, la spécification (`test/**`, `checkpoint/**`)
reste à l'apprenant. Les correctifs de revue (P2/P3) sont intégrés.

- `bin/lib/guard.js` : `loadGuardConfig` résout `mode` (défaut `apprenti`,
  jamais le plus permissif), dérive `learnerFiles` (`["test/**",
  "checkpoint/**"]` en dirigeant, un `learnerFiles` stocké étant ignoré ;
  inchangé sinon) et `implementationFiles` **du mode uniquement** (`["src/**"]`
  en dirigeant, `learnerFiles` sinon — une valeur stockée est ignorée). Toutes
  les listes retournées sont des copies (pas d'array partagé mutable).
  `validateGuardConfig`/`guardConfigIssues` suivent la convention des fichiers
  de données ; `check` signale un mode inconnu, une version inattendue ou un
  champ mal typé. Les raisons de refus sont dérivées du mode, et le README
  généré de `docs/solutions/` est rendu par `renderSolutionsReadme(mode)` puis
  rafraîchi au changement de mode. `decide` et `detectGitOrGh` restent
  inchangés sur le fond : le blocage git/gh vaut dans les deux modes.
- `bin/lib/source-hash.js`, `bin/lib/mutate.js`, `bin/lib/norm.js` : lisent
  `implementationFiles` au lieu de `learnerFiles`. C'est le correctif le plus
  important de la revue — sans lui, en dirigeant, l'empreinte de preuve
  couvrait la spécification et une modification de l'implémentation ne
  périmait plus l'évidence `done` (régression d'epic 01).
- `bin/lib/check.js` : warning `guard.json` invalide ; message du guard
  dé-masculinisé (« fichiers de l'apprenant »).
- `bin/lib/platforms/codex-guard.js` : inchangé — il consomme déjà
  `learnerFiles`, donc le sandbox Codex dénie aussi `test/**`/`checkpoint/**`
  en dirigeant.
- Docs : `docs/architecture.md` (le périmètre de `norm`/`mutate`/`source-hash`
  est `implementationFiles`, pas `learnerFiles`), `templates/AGENTS-apprentissage.md`
  (encart mode dirigeant, table des commandes, règle d'or), `README.md`.
- Tests : `test/guard.test.js` (matrice {mode} × {src, test, checkpoint, git},
  mode inconnu → apprenti, Bash inversé, `learnerFiles`/`implementationFiles`
  stockés ignorés, copies d'arrays, `validateGuardConfig`, warning `check`,
  `ensureGuardHook` → `mode: "apprenti"` préservé, profil Codex + README
  inversés en dirigeant, raisons de refus mode-aware), `test/verdict.test.js`
  (hash = implémentation en dirigeant, scope custom en apprenti),
  `test/norm.test.js` et `test/mutate.test.js` (même bascule).
- Négatif vérifié manuellement : forcer `mode = apprenti` fait échouer le test
  de matrice ; restauré, il repasse.
- `npm test` : 527 tests, 0 échec.

### Rollback Notes

Revert du commit : `mode`/`implementationFiles` retirés de `guard.js`, les
consommateurs repassent à `learnerFiles`, les tests de la matrice et des
consommateurs retirés. Aucune migration de données — champs additifs du
`guard.json`, et un `guard.json` déjà écrit avec `mode` reste lu sans erreur
(mode inconnu → `apprenti`, signalé par `check`).

### Remaining Risks

- Faille préexistante, non introduite ici : le guard ne protège pas son propre
  `.ai-learn/guard.json` (ni `.claude/settings.json`) — l'IA peut réécrire
  `mode`. La « config corrompue ne peut jamais ouvrir `src/**` » vaut donc pour
  une config *malformée*, pas pour une config *réécrite par l'agent*. Hors
  périmètre de 03.01.
- En `dirigeant`, `DIRIGEANT_LEARNER_FILES` couvre désormais les conventions
  reconnues par `scan.js#detectTests` (`test(s)/`, `__tests__/`, `*.test.*`,
  `*_test.*`, `test_*`, etc.) en plus de `checkpoint/**`, pour le hook Claude.
  Limite côté Codex (sandbox OS, vérifiée sur codex-cli 0.138.0) : les clés de
  `filesystem.":workspace_roots"` sont des chemins, pas des globs — seules les
  formes répertoire (`test`, `checkpoint`) sont réellement appliquées. Un test
  colocalisé (`src/index.test.ts`) reste donc écrivable par le sandbox Codex ;
  le hook Claude, lui, le bloque. À traiter quand Codex exposera des motifs.
