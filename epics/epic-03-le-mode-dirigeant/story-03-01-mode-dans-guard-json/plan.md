# Plan — Story 03.01

## Implementation Context

Fichiers :

- bin/lib/guard.js (`loadGuardConfig`, `validateGuardConfig`, `decide`, `ensureGuardHook`)
- bin/lib/platforms/codex-guard.js
- bin/lib/source-hash.js, bin/lib/mutate.js, bin/lib/norm.js (consommateurs de `implementationFiles`)
- bin/lib/check.js (signale un `guard.json` invalide)
- test/guard.test.js, test/verdict.test.js, test/norm.test.js, test/mutate.test.js

Ancres de recherche : `learnerFiles`, `implementationFiles`, `DEFAULT_LEARNER_FILES`, `matchesLearnerPath`, `loadGuardConfig`

Mode d'exécution : `STRICT`

Scout pre-step : `no` — les points d'intégration sont nommés ci-dessus.

## Decisions

- **Résolu — inversion portée par le mode.** `loadGuardConfig` résout `mode` puis dérive `learnerFiles` : en `dirigeant` la valeur couvre toutes les conventions de test reconnues par `scan.js#detectTests` (`test/**`, `tests/**`, `__tests__/**`, `*.test.*`, `*.spec.*`, `test_*`, `*_test.*`, etc.) plus `checkpoint/**` — le `learnerFiles` stocké est ignoré, pour qu'une inversion à moitié appliquée soit impossible ; en `apprenti` le comportement existant est inchangé.
- **Résolu — cible de mutation distincte.** Un champ `implementationFiles` est introduit dans `loadGuardConfig`, **dérivé du mode** : en `apprenti` il suit `learnerFiles` (un projet scopé sur `lib/**` ne doit pas se mettre à muter `src/**`) ; en `dirigeant` il vaut `src/**` par défaut, ou la valeur explicite `implementationFiles` de `guard.json` quand elle est un tableau non vide de chaînes non vides (un projet dont le code vit dans `lib/**`/`app/**` garde ainsi un scope de preuve réel au lieu d'un scope vide silencieux). Le `learnerFiles` stocké est ignoré en dirigeant (l'inversion ne peut pas être à moitié appliquée), et un `implementationFiles` malformé retombe sur `src/**`. Il n'est **pas écrit** dans le `guard.json` généré. Les trois consommateurs (`mutate.js`, `norm.js`, `source-hash.js`) **lisent ce champ** : laissé en `learnerFiles`, `source-hash.js` aurait fait porter l'empreinte de preuve sur la spécification, donc une modification de l'implémentation n'aurait plus périmé une évidence `done` (régression d'epic 01). Ce branchement, d'abord prévu en suivi, est livré ici (revue).
- **Résolu — l'IA ne réécrit pas sa policy.** `PROTECTED_FILES` (`.ai-learn/guard.json`, `.claude/settings.json`, `.claude/settings.local.json`, `.codex/config.toml`) est refusé dans les deux modes, avant le test des chemins apprenant. Sans ce verrou, un Write suffisait à repasser `mode` à `apprenti` — ou à vider `learnerFiles` — et la garantie mécanique du mode disparaissait. `.claude/settings.local.json` est inclus parce qu'il outranke `.claude/settings.json` : un `"disableAllHooks": true` y coupe le hook pour la session en cours. Côté Codex, le profil sandbox refuse aussi `.ai-learn/guard.json` et `.codex/config.toml` en écriture (clés littérales), sans quoi une session Codex pourrait réécrire son propre profil. La comparaison des chemins protégés et apprenants est insensible à la casse sur `win32`/`darwin`, où le filesystem l'est ; en `dirigeant`, elle l'est partout, car `detectTests` classe les suffixes sans tenir compte de la casse. Le CLI (`init`/`update`), lui, continue d'écrire ces fichiers normalement.
- **Résolu — Codex : clés littérales uniquement.** `denyEntries` ne conserve que la forme littérale d'un glob (`test/**` → `test`) et supprime les motifs non exprimables (`*.test.*`). Émettre à la fois `src/**` et `src` faisait échouer bwrap dès qu'un fichier existait sous `src` (`Can't create file ... Read-only file system`) : la forme glob est donc supprimée, pas seulement considérée comme inerte. En `dirigeant`, `findLiteralTestDirs` ajoute les répertoires de test existants (`src/test`, `src/__tests__`, …) ; les répertoires créés après coup et les tests colocalisés restent une limite documentée du modèle Codex.
- **Résolu — le hash de preuve exclut la spécification colocalisée.** `source-hash.js` filtre les fichiers reconnus par `detectTests`, comme `norm`/`mutate` : `src/a.test.js` n'entre plus dans l'empreinte d'implémentation, donc modifier son propre test ne périme plus une évidence `done`.
- **Résolu — Bash ne contourne plus par `cd`.** `shellWriteTargets` suit le répertoire courant à travers `&&`/`;`/newline et résout les cibles relatives contre lui. Il couvre aussi `tee -a`, `rm`, `mv` (source comprise) et `truncate`, et `isProtectedPath` refuse un répertoire parent protégé (`.ai-learn`, `.claude`, `.codex`).
- **Résolu — config mal typée = repli, pas fail-open.** `learnerFiles`/`blockedCommands`/`gitAliases` ne sont acceptés que si chaque entrée est une chaîne non vide ; sinon le champ entier retombe sur le défaut. Un `[null]` faisait lever `globToRegExp` dans `decide`, que `guardCommand` transformait en `allow` (fail-open silencieux).
- **Résolu — une seule définition du fichier de test.** `scan.js#detectTests` reconnaît désormais `__tests__/`, comme le guard ; `mutate`/`norm` excluent donc les mêmes fichiers que ceux que le guard déclare apprenant. Les basenames nus (`test.js`, `spec.ts`, `src/test.py`) sont ajoutés à `DIRIGEANT_LEARNER_FILES` pour la même raison.
- **Résolu — un `guard.json` invalide est signalé.** `validateGuardConfig`/`guardConfigIssues` suivent la convention des fichiers de données ; `check` émet un warning pour un `mode` inconnu, une version inattendue ou un champ mal typé. Le guard lui-même reste fail-safe et silencieux : un mode inconnu retombe sur `apprenti`.
- **Résolu — le texte suit le mode.** Les raisons de refus, le README généré de `docs/solutions/` et le profil Codex sont dérivés du mode : en dirigeant, l'IA lit « spécification de l'apprenant, écris `src/**` » et non « dépose le code de révélation ».
- **Résolu — le défaut est le plus restrictif.** Seul le littéral exact `"dirigeant"` sélectionne le mode inverse. Toute autre valeur (absente, mal orthographiée, non-chaîne, config corrompue) résout vers `apprenti` : une config cassée ne peut jamais ouvrir `src/**` à l'IA.

## Test Plan

- [x] Matrice complète de décision du guard (unit) — `test/guard.test.js`.
- [x] Intégration : `mode` corrompu → apprenti — `test/guard.test.js`.
- [x] Négatif : retirer le garde (forcer `mode = apprenti`) → le test de la matrice échoue (vérifié manuellement : `fail 11` avec le garde retiré, `fail 0` restauré).
- [x] Parité `detectTests` : `test.js`, `spec.ts`, `src/test.py`, `src/__tests__/…` bloqués en dirigeant — `test/guard.test.js`, `test/scan.test.js`.
- [x] Auto-protection : `.ai-learn/guard.json`, `.claude/settings.json`, `.claude/settings.local.json`, `.codex/config.toml` refusés en Write et Bash dans les deux modes ; profil Codex refusant ses propres fichiers de config — `test/guard.test.js`.
- [x] Casse : chemins protégés et apprenants insensibles à la casse sur `win32`/`darwin` — `test/guard.test.js`.
- [x] Config mal typée : `[null]` → repli sur le défaut, jamais fail-open — `test/guard.test.js`.
- [x] Consommateurs : `computeSourceHash`, `findAllSites` et `normProject` visent `implementationFiles`, y compris un scope custom en dirigeant — tests dédiés dans `test/verdict.test.js`, `test/mutate.test.js`, `test/norm.test.js`.
- [x] Câblage : `ensureGuardHook` écrit `mode: "apprenti"`, préserve un mode existant, inverse le profil Codex et le README généré en dirigeant.
- [x] Config invalide : `validateGuardConfig` + warning `check` sur un mode inconnu et sur un scope d'implémentation vide.

## Acceptance Traceability

| Acceptance criterion | Test proving it |
| --- | --- |
| Given `guard.json` en mode `apprenti` (défaut, ou champ absent), when … | `test/guard.test.js` :: `mode apprenti (défaut) : src/** bloqué, test/** et checkpoint/** autorisés — non-régression` |
| Given le mode `dirigeant`, when l'IA écrit dans `test/**` ou `checkpoi… | `test/guard.test.js` :: `mode dirigeant : l'IA écrit src/** (autorisé) et ne touche plus à test/** ni checkpoint/** (bloqués)` |
| Given un `guard.json` sans `mode` ou avec une valeur inconnue, when le… | `test/guard.test.js` :: `mode inconnu, absent ou non-chaîne retombe sur apprenti — jamais le mode le plus permissif` |
| Given le mode `dirigeant`, when une commande git/gh est lancée par l'I… | `test/guard.test.js` :: `matrice de décision du guard : git/gh reste bloqué dans les deux modes (§3bis inchangé)` |
| Given la matrice de décision du guard, when la suite de tests tourne, … | `test/guard.test.js` :: `matrice de décision du guard : chaque case {mode} × {src, test, checkpoint} est couverte` |
| Given un nom reconnu par `detectTests` (`test.js`, `spec.ts`, `__tests__/…`), when l'IA l'écrit en dirigeant, … | `test/guard.test.js` :: `mode dirigeant : toutes les conventions de test reconnues par scan.js restent à l'apprenant` + `test/scan.test.js` :: `detectTests recognizes test(s)/ and __tests__…` |
| Given l'IA tente de réécrire sa configuration, when le guard évalue l'écriture, … | `test/guard.test.js` :: `le guard refuse à l'IA de réécrire sa propre configuration dans les deux modes` |
| Given un projet `dirigeant` hors `src/**`, when il déclare `implementationFiles`, … | `test/verdict.test.js`/`test/mutate.test.js`/`test/norm.test.js` (scope custom) + `test/guard.test.js` :: `checkProject warns when the implementation scope matches no files` |

## Commands

- Command: `npm test`
  - Expected: la suite complète passe.

## Rollback

Revert du commit de la story ; aucune migration de données hors champs additifs.
