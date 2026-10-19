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
reste à l'apprenant. Les correctifs de revue (P1/P2/P3) sont intégrés.

- `bin/lib/guard.js` : `loadGuardConfig` résout `mode` (défaut `apprenti`,
  jamais le plus permissif), dérive `learnerFiles` (`["test/**",
  "checkpoint/**"]` en dirigeant, un `learnerFiles` stocké étant ignoré ;
  inchangé sinon) et `implementationFiles` (`["src/**"]` en dirigeant, la
  valeur explicite `implementationFiles` honorée dans ce mode seulement,
  `learnerFiles` en apprenti). Toutes les listes retournées sont des copies
  (pas d'array partagé mutable).
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
- `bin/lib/platforms/codex-guard.js` : consomme déjà `learnerFiles`, donc le
  sandbox Codex dénie aussi `test/**`/`checkpoint/**` en dirigeant ; il dénie
  en plus, en clés littérales, `.ai-learn/guard.json` et `.codex/config.toml`
  pour que Codex ne réécrive pas sa propre policy.
- `bin/lib/guard.js` (suite revue) : `.claude/settings.local.json` ajouté à
  `PROTECTED_FILES` — il outranke `.claude/settings.json`, et un
  `"disableAllHooks": true` y couperait le hook pour la session. Les chemins
  protégés et apprenants sont comparés sans casse sur `win32`/`darwin`.
- Docs : `docs/architecture.md` (le périmètre de `norm`/`mutate`/`source-hash`
  est `implementationFiles`, pas `learnerFiles`), `templates/AGENTS-apprentissage.md`
  (encart mode dirigeant, table des commandes, règle d'or), `README.md`.
- Tests : `test/guard.test.js` (matrice {mode} × {src, test, checkpoint, git},
  mode inconnu → apprenti, Bash inversé, `learnerFiles` stocké repris comme
  scope d'implémentation en dirigeant — `implementationFiles` stocké honoré,
  `learnerFiles` stocké ignoré, copies d'arrays, `validateGuardConfig` +
  entrées non-chaîne, auto-protection de la config en Write/Bash (dont
  `settings.local.json` et `disableAllHooks`), insensibilité à la casse
  `win32`/`darwin`, warning `check` sur un scope vide,
  `ensureGuardHook` → `mode: "apprenti"` préservé, profil Codex + README
  inversés en dirigeant, config Codex auto-protégée, raisons de refus
  mode-aware et raccourcies en dirigeant), `test/scan.test.js`
  (parité `detectTests` pour `test(s)/`, `__tests__/` et basenames nus),
  `test/verdict.test.js` (hash = implémentation en dirigeant, scope custom en
  apprenti et en dirigeant), `test/norm.test.js` et `test/mutate.test.js`
  (même bascule, `__tests__/` exclu).
- Négatif vérifié manuellement : forcer `mode = apprenti` fait échouer les
  tests de la matrice et des consommateurs ; retirer `isProtectedPath` fait
  échouer le test d'auto-protection. Restaurés, ils repassent.
- `npm test` : 541 tests, 0 échec.

### Rollback Notes

Revert du commit : `mode`/`implementationFiles` retirés de `guard.js`, les
consommateurs repassent à `learnerFiles`, les tests de la matrice et des
consommateurs retirés. Aucune migration de données — champs additifs du
`guard.json`, et un `guard.json` déjà écrit avec `mode` reste lu sans erreur
(mode inconnu → `apprenti`, signalé par `check`).

### Remaining Risks

- Le guard protège désormais sa propre configuration (`.ai-learn/guard.json`,
  `.claude/settings.json`, `.claude/settings.local.json`,
  `.codex/config.toml`), mais la protection reste une haie côté Bash : une
  commande non reconnue par `shellWriteTargets` peut toujours contourner le
  hook (fail-open assumé, comme pour `src/**`). Deux échappatoires restent hors
  de portée : un fichier de settings **utilisateur** (`~/.claude/settings.json`)
  est hors du projet (`toRelative` → `null`), et un alias symlink vers un
  fichier protégé n'est pas résolu par le hook.
- En `dirigeant`, `DIRIGEANT_LEARNER_FILES` couvre les conventions reconnues
  par `scan.js#detectTests` (`test(s)/`, `__tests__/`, basenames `test`/`spec`,
  `*.test.*`, `*_test.*`, `test_*`, etc.) en plus de `checkpoint/**`, pour le
  hook Claude. Limite côté Codex (sandbox OS, vérifiée sur codex-cli 0.138.0) :
  les clés de `filesystem.":workspace_roots"` sont des chemins, pas des globs —
  seules les formes répertoire (`test`, `checkpoint`) sont réellement
  appliquées. Un test colocalisé (`src/index.test.ts`) reste donc écrivable par
  le sandbox Codex ; le hook Claude, lui, le bloque. À traiter quand Codex
  exposera des motifs.
- En `dirigeant`, le scope d'implémentation vaut `src/**` sauf si le projet
  déclare `implementationFiles` dans `guard.json`. Un projet dont le code vit
  ailleurs (`lib/**`, `app/**`) doit le déclarer ; sinon `check` signale que le
  scope ne couvre aucun fichier (le hash/norm/mutation ne prouveraient rien).

### Follow-ups

- Échappatoire `rm` / commandes non reconnues par `shellWriteTargets` sur les
  fichiers protégés (pré-existante, commune à `src/**`).
- Fichier de settings utilisateur hors projet et alias symlink, hors de portée
  d'un guard de projet.
