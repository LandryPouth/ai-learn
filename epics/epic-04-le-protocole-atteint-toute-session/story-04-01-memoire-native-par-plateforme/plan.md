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

- Décision : le stub est un fichier **append-only** (ligne `@AGENTS.md` ajoutée si absente) — jamais un remplacement, parce qu'un `CLAUDE.md` existant appartient à l'apprenant. Une écriture impossible (fichier en lecture seule) renvoie `failed` et `init`/`update` la signalent sans planter.
- Décision : table `NATIVE_MEMORY_FILE` par plateforme, à côté de `MARKER_FILE` (`claude` → `CLAUDE.md`, `gemini` → `GEMINI.md`). Codex/OpenCode/Antigravity lisent `AGENTS.md` nativement : aucune entrée, donc aucun stub superflu.
- Décision : `init` n'écrit que le stub de la plateforme explicite ; `update` sans `--platform` backfile les stubs des plateformes **détectées** (commandes `/…` installées, même signal que `check`), car il parcourt des projets sans savoir quel agent les ouvre — sans créer de `GEMINI.md` pour un apprenant Claude seul. Un `--platform` explicite restreint au stub de cette plateforme.
- Décision : l'écriture est un vrai `appendFileSync` (octets existants jamais ré-encodés) et un `CLAUDE.md` symlink est refusé (`failed`), pour ne pas écrire hors du projet.
- Décision : `check` détecte une plateforme par ses commandes `/…` installées (`MARKER_FILE`, même source que `ensurePlatformCommands`) et n'avertit que si le projet porte un `AGENTS.md` — sans protocole à importer, l'absence de stub n'est pas un écart.

## Test Plan

- [x] Unit : l'ajout est idempotent (deux `update` = un seul import).
- [x] Unit : un fichier personnalisé garde ses lignes.
- [x] Intégration : `init` puis `check` ne signale rien ; suppression du stub puis `check` signale un warning.
- [x] Unit : lecture seule — `init` ne plante pas et signale.

## Acceptance Traceability

| Acceptance criterion | Test proving it |
| --- | --- |
| Given un projet scaffoldé par `ai-learn init` sur claude-code, when on… | `test/init.test.js::init writes the platform's native memory file importing AGENTS.md (claude)` |
| Given un projet existant sans `CLAUDE.md`, when `ai-learn update --roo… | `test/update.test.js::update backfills a missing CLAUDE.md without touching a customized AGENTS.md` |
| Given un `CLAUDE.md` déjà personnalisé par l'apprenant, when `init`/`u… | `test/init.test.js::init appends only the missing import to a customized CLAUDE.md, idempotently` + `test/update.test.js::update appends only the missing import to a customized CLAUDE.md, idempotently` |
| Given une plateforme qui lit déjà `AGENTS.md` nativement (codex, openc… | `test/init.test.js::init writes no native memory stub for platforms that read AGENTS.md natively` |
| Given `ai-learn check`, when le stub d'une plateforme détectée manque,… | `test/check.test.js::check warns when a detected platform's native memory stub is missing` + `test/check.test.js::init then check is clean; deleting the native memory stub makes check warn` |

## Commands

- Command: `npm test`
  - Expected: la suite complète passe.

## Rollback

Revert du commit de la story ; aucune migration de données hors champs additifs.
