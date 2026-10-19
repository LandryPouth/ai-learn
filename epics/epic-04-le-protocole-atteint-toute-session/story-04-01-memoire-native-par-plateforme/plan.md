# Plan — Story 04.01

## Implementation Context

Fichiers probables :

- bin/lib/init.js (≈88-93)
- bin/lib/update.js (≈101-131)
- bin/lib/platforms/ensure.js (`MARKER_FILE`, `INSTALLERS`)
- bin/lib/platforms/{gemini,antigravity,codex,opencode}.js
- test/init.test.js
- test/update.test.js

Ancres de recherche : `INSTALLERS`, `MARKER_FILE`, `detectPlatform`, `ensureCodexConfig`

Mode d'exécution : `STANDARD`

Scout pre-step : `no` — les points d'intégration sont nommés ci-dessus.

À éviter sauf nécessité : bin/lib/guard.js, bin/lib/scan.js, templates/AGENTS-apprentissage.md (contenu inchangé)

## Decisions

- Décision à prendre : le stub est un fichier **append-only** (ligne `@AGENTS.md` ajoutée si absente) — jamais un remplacement, parce qu'un `CLAUDE.md` existant appartient à l'apprenant.
- Décision à prendre : table `NATIVE_MEMORY_FILE` par plateforme, à côté de `MARKER_FILE`, pour ne pas disperser la connaissance des plateformes.

## Test Plan

- [ ] Unit : l'ajout est idempotent (deux `update` = un seul import).
- [ ] Unit : un fichier personnalisé garde ses lignes.
- [ ] Intégration : `init` puis `check` ne signale rien ; suppression du stub puis `check` signale un warning.

## Acceptance Traceability

| Acceptance criterion | Test proving it |
| --- | --- |
| Given un projet scaffoldé par `ai-learn init` sur claude-code, when on… | `Unit : l'ajout est idempotent (deux `update` = un seul impor` (à nommer `file::test` au `/flow-run`) |
| Given un projet existant sans `CLAUDE.md`, when `ai-learn update --roo… | `Unit : un fichier personnalisé garde ses lignes.` (à nommer `file::test` au `/flow-run`) |
| Given un `CLAUDE.md` déjà personnalisé par l'apprenant, when `init`/`u… | `Intégration : `init` puis `check` ne signale rien ; suppress` (à nommer `file::test` au `/flow-run`) |
| Given une plateforme qui lit déjà `AGENTS.md` nativement (codex, openc… | `Intégration : `init` puis `check` ne signale rien ; suppress` (à nommer `file::test` au `/flow-run`) |
| Given `ai-learn check`, when le stub d'une plateforme détectée manque,… | `Intégration : `init` puis `check` ne signale rien ; suppress` (à nommer `file::test` au `/flow-run`) |

## Commands

- Command: `npm test`
  - Expected: la suite complète passe.

## Rollback

Revert du commit de la story ; aucune migration de données hors champs additifs.
