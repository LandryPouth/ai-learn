# Plan — Story 08.03

## Implementation Context

Fichiers probables :

- bin/lib/install.js (orchestration, retrait des anciens fichiers)
- bin/lib/platforms/commands.js (source unique : parse `commands/*.md`)
- bin/lib/platforms/opencode.js, antigravity.js, codex.js, gemini.js (rendu par plateforme)
- bin/lib/platforms/ensure.js (self-heal)
- commands/*.md (source canonique, format Claude)
- README.md (tableau des plateformes), docs/architecture.md
- test/install.test.js, test/platforms.test.js, test/integration-opencode.test.js

Ancres de recherche : `renderCommand`, `COMMAND_PLATFORMS`, `~/.config/opencode/command`, `antigravity`, `EPERM`

Référence (lecture seule) : `~/dev/tools/coding-flow/bin/lib/opencode-config.js` (migration `command/*.md` → skills par hash)

Mode d'exécution : `STANDARD`

Scout pre-step : `no`

À éviter sauf nécessité : le contenu des commandes, `guard.js`

## Decisions

- Décision : la source reste `commands/*.md` (format Claude) ; un seul rendu `SKILL.md` partagé par Claude, OpenCode, Antigravity. Pas de seconde source.
- Décision : le retrait des anciens fichiers se fait par empreinte (hash du contenu écrit par `ai-learn`), pas par nom. Un fichier modifié par l'utilisateur est gardé.
- Décision : Codex et Gemini ne sont migrés que si leur emplacement de lecture des skills est prouvé (documentation embarquée du paquet installé, ou commande de debug) ; sinon ils restent sur prompts/TOML, raison au README. Aucune hypothèse sur ces emplacements n'est écrite sans preuve.
- Décision : le préfixe d'invocation change (`/ai-learn/<nom>` vers le nom du skill) : le changement et les alias sont listés dans le CHANGELOG et dans la sortie d'`install`.

## Test Plan

Parseur strict de frontmatter sur toutes les sorties ; idempotence ; conservation d'un fichier modifié ; `--dry-run` ; intégration OpenCode (`opencode debug skill`) qui s'ignore sans binaire.

## Acceptance Traceability

| Critère | Preuve |
|---|---|
| SKILL.md valides | test/platforms.test.js::skills claude et opencode |
| OpenCode les voit | test/integration-opencode.test.js::debug skill |
| retrait par empreinte | test/install.test.js::anciennes commandes retirées / modifiées gardées |
| alias | test/install.test.js::alias historiques |
| autres plateformes | README + test/platforms.test.js::codex gemini antigravity |
| idempotence | test/install.test.js::deuxième install |
| EPERM | test/install.test.js::copie de repli |

## Commands

```
npm test
```
