# Plan — Story 08.04

## Implementation Context

Fichiers probables :

- bin/lib/guard.js (`ensureGuardHook`, quoting de `toolBin`)
- bin/lib/docs.js (suppression via `trash`)
- bin/lib/exec.js (`shell: true`, message de portabilité)
- bin/lib/platforms/opencode-guard.js (chemins, si 08-01 est livré)
- README.md (section Windows), docs/conventions.md (tests ignorés sous Windows)
- test/guard.test.js, test/docs.test.js, test/platforms.test.js
- .github/workflows/test.yml (déjà ubuntu/windows/macos × Node 18/20/22)

Ancres de recherche : `toolBin`, `guard.js`, `trash`, `shell: true`, `EPERM`, `CASE_INSENSITIVE`

Mode d'exécution : `STANDARD`

Scout pre-step : `no`

À éviter sauf nécessité : `decide`, `shellWriteTargets`

## Decisions

- Décision : on corrige le quoting au minimum, sans changer la forme `node <bin> guard` (déjà sans syntaxe POSIX, meilleure que la commande de Coding Flow).
- Décision : pas de nouvelle grammaire shell ; la limite est documentée et figée par un test.
- Décision : le README ne revendique rien de plus que ce que la CI et une session ont observé.

## Test Plan

Exécution réelle de la commande de hook écrite dans un dossier à espace ; simulation de `trash` absent (PATH contrôlé) ; test de caractérisation des écritures PowerShell/`cmd` ; vérification de la CI sur les trois systèmes.

## Acceptance Traceability

| Critère | Preuve |
|---|---|
| chemin avec espace | test/guard.test.js::hook avec espace |
| trash absent | test/docs.test.js::sans trash |
| limites PowerShell | test/guard.test.js::formes non analysées + README |
| CI Windows | .github/workflows/test.yml (run vert) |
| plugin OpenCode | test/platforms.test.js::chemins Windows |
| niveaux de preuve README | relecture en review |

## Commands

```
npm test
```
