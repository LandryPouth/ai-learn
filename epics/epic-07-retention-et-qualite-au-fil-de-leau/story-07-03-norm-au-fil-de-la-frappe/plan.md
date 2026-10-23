# Plan — Story 07.03

## Implementation Context

Fichiers probables :

- bin/lib/norm.js (mode `--hook`, `ensureNormHook`)
- bin/ai-learn.js (dispatch `--hook`, aide)
- bin/lib/init.js (câblage claude-code)
- bin/lib/update.js (câblage idempotent)
- templates/AGENTS-apprentissage.md (§3quater, repli documenté)
- test/norm.test.js
- test/update.test.js

Ancres de recherche : `ai-learn guard`, `settings.json`, `PreToolUse`

Mode d'exécution : `STANDARD`

Scout pre-step : `no` — les points d'intégration sont nommés ci-dessus.

À éviter sauf nécessité : guard.js (décision d'accès), verify.js

## Decisions

- Décision : le hook est consultatif — sortie `hookSpecificOutput.additionalContext`
  (PostToolUse) et code 0, jamais de `permissionDecision`/`decision: block`. Le
  blocage reste dans `verify`/`check` : un retour à la frappe ne doit pas
  interrompre l'écriture de l'apprenant.
- Décision : coût borné — seul le fichier écrit est mesuré. La stack est résolue
  depuis les manifestes présents à la racine plus ce seul fichier, sans
  `walkSources` sur chaque écriture.
- Décision : le périmètre du hook est `implementationFiles` (le même que
  `normProject`), avec les `ignore` de `norm.json` et l'exclusion des tests sauf
  `includeTests`. Une écriture hors périmètre ne produit aucune sortie.
- Décision : `init` ne câble le hook que pour `--platform claude` (seule
  plateforme avec PostToolUse) ; `update` le câble inconditionnellement dans
  `.claude/settings.json`, comme `ensureGuardHook` — fusion par marqueur
  `ai-learn.js norm --hook`, jamais remplacement. Les autres plateformes lisent
  le repli dans AGENTS.md §3quater.
- Décision : `--hook` lit stdin (format PostToolUse) comme `guard`, avec
  `--input` pour les tests ; toute entrée illisible ou erreur interne = sortie
  silencieuse, jamais un échec qui casserait l'écriture.
- Décision (revue) : `ensureNormHook` ne réécrit jamais un `settings.json` qu'il ne
  peut pas fusionner sûrement (JSON illisible, `hooks`/`PostToolUse` de forme
  inattendue) : il renvoie `skipped` et `update` le signale. Le chemin du binaire
  est entouré de guillemets. `update --platform <autre que claude>` ne câble pas
  le hook.

## Test Plan

- [x] Unit : `--hook` mesure un seul fichier, sortie vide si propre, silencieux hors périmètre.
- [x] Intégration : fusion de `settings.json` idempotente (init claude vs codex, update).
- [x] Intégration : `update` rafraîchit AGENTS.md avec le repli documenté.

## Acceptance Traceability

| Acceptance criterion | Test proving it |
| --- | --- |
| Given un projet claude-code initialisé, when `.claude/settings.json` est lu, then un hook PostToolUse (matcher écriture/édition) appelle `ai-learn norm --hook`. | `test/norm.test.js::init wires the norm hook for claude-code and wires nothing for a platform without one` |
| Given une écriture qui crée une violation de norme, when le hook tourne, then la violation (`fichier:ligne — message [règle]`) est remontée à l'agent sans bloquer l'écriture. | `test/norm.test.js::ai-learn norm --hook reports the written file's violation to the agent without blocking` |
| Given une écriture sans violation, when le hook tourne, then aucune sortie (zéro bruit). | `test/norm.test.js::ai-learn norm --hook stays silent on a clean write` |
| Given un `settings.json` déjà personnalisé, when `update` tourne, then le hook est ajouté sans écraser les entrées existantes (marqueur `ai-learn`, comme `guard`). | `test/norm.test.js::ensureNormHook merges a PostToolUse hook without clobbering existing settings, idempotently` + `test/update.test.js::update wires the consultative norm hook and documents the no-hook fallback` |
| Given une plateforme sans hook équivalent, when `init` tourne, then rien n'est câblé et AGENTS.md §3quater décrit le repli (appeler `ai-learn norm` après chaque brique). | `test/norm.test.js::init wires the norm hook for claude-code and wires nothing for a platform without one` |

## Commands

- Command: `npm test`
  - Expected: la suite complète passe.

## Rollback

Revert du commit de la story ; aucune migration de données hors champs additifs.
