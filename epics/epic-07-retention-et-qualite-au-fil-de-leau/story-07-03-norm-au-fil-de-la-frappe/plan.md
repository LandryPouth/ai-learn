# Plan — Story 07.03

## Implementation Context

Fichiers probables :

- bin/lib/norm.js (mode `--hook`)
- bin/lib/platforms/ensure.js
- bin/lib/init.js
- bin/lib/update.js
- bin/lib/guard.js (lire le câblage du hook PreToolUse existant comme modèle, ne pas le modifier)
- test/norm.test.js
- test/update.test.js

Ancres de recherche : `ai-learn guard`, `settings.json`, `PreToolUse`

Mode d'exécution : `STANDARD`

Scout pre-step : `no` — les points d'intégration sont nommés ci-dessus.

À éviter sauf nécessité : guard.js (décision d'accès), verify.js

## Decisions

- Décision à prendre : le hook est consultatif — il ne bloque jamais (le blocage reste dans `verify`/`check`).
- Décision à prendre : coût borné — seul le fichier écrit est mesuré, jamais tout `src/**`.

## Test Plan

- [ ] Unit : `--hook` mesure un seul fichier, sortie vide si propre.
- [ ] Intégration : fusion de `settings.json` idempotente.

## Acceptance Traceability

| Acceptance criterion | Test proving it |
| --- | --- |
| Given un projet claude-code initialisé, when `.claude/settings.json` e… | `Unit : `--hook` mesure un seul fichier, sortie vide si propr` (à nommer `file::test` au `/flow-run`) |
| Given une écriture qui crée une violation de norme, when le hook tourn… | `Intégration : fusion de `settings.json` idempotente.` (à nommer `file::test` au `/flow-run`) |
| Given une écriture sans violation, when le hook tourne, then aucune so… | `Intégration : fusion de `settings.json` idempotente.` (à nommer `file::test` au `/flow-run`) |
| Given un `settings.json` déjà personnalisé, when `update` tourne, then… | `Intégration : fusion de `settings.json` idempotente.` (à nommer `file::test` au `/flow-run`) |
| Given une plateforme sans hook équivalent, when `init` tourne, then ri… | `Intégration : fusion de `settings.json` idempotente.` (à nommer `file::test` au `/flow-run`) |

## Commands

- Command: `npm test`
  - Expected: la suite complète passe.

## Rollback

Revert du commit de la story ; aucune migration de données hors champs additifs.
