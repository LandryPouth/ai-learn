# Plan — Story 08.01

## Implementation Context

Fichiers probables :

- bin/lib/platforms/opencode-guard.js (nouveau : source du plugin, `ensureOpenCodeGuard`, `inspectOpenCodeGuard`, marqueur)
- bin/lib/guard.js (export seulement si besoin ; ne pas toucher `decide`)
- bin/lib/init.js, bin/lib/update.js (câblage, comme `ensureGuardHook`)
- bin/lib/check.js (état current/stale/foreign/absent)
- bin/lib/platforms/ensure.js, bin/lib/platforms/detect.js (usage d'OpenCode dans le projet)
- README.md, docs/architecture.md (tableau et module)
- test/opencode-guard.test.js (nouveau ; couvre aussi init/update/check, sans modifier leurs fichiers de test)

Ancres de recherche : `ensureGuardHook`, `ensureCodexGuard`, `NORM_HOOK_MARKER`, `decide(`, `findProjectRoot`, `.opencode`

Référence de conception (lecture seule) : `~/dev/tools/coding-flow/bin/lib/opencode.js`, `test/opencode-guard.test.js`

Mode d'exécution : `STRICT`

Scout pre-step : `no` — la référence et les points d'intégration sont nommés.

À éviter sauf nécessité : `decide`, `shellWriteTargets`, `scan.js`

## Decisions

- Décision : le plugin charge `guard.js` en processus (`createRequire`, OpenCode tourne sous Bun) et appelle `decide(hook, root)` ; repli `spawnSync("node", [bin, "guard"])` puis refus de rien décider seul : sans module, l'écriture passe et est tracée « NOT checked ». Même contrat fail-open que le hook Claude.
- Décision : table de traduction `write→Write`, `edit→Edit`, `bash→Bash`, `apply_patch→un Write par fichier + Move to`. Les outils de lecture sont ignorés. Un outil inconnu avec un champ chemin est transmis sous son propre nom.
- Décision : marqueur de première ligne (`// ai-learn:guard-plugin`) ; régénérer ce qui le porte, ne jamais toucher le reste. Même règle que `NORM_HOOK_MARKER`.
- Décision : le plugin est écrit seulement si le projet utilise OpenCode (`opencode.json`, `opencode.jsonc` ou `.opencode/`) ou si `--platform opencode` est passé.
- Décision : pas de dépendance d'exécution vers le paquet `coding-flow` (zéro dépendance) : on s'en inspire, on ne l'importe pas.
- Décision : exception à « ne pas toucher `decide` » — seules ses *données* changent : `PROTECTED_FILES`/`PROTECTED_DIRS` gagnent `.opencode/plugins/**`, `.ai-learn/guard.log` et `.ai-learn/guard-unchecked.jsonl`. Sans cela l'IA pourrait réécrire le plugin (ou effacer les traces du fail-open) et désarmer la garde. Conséquence : le hook Claude refuse aussi ces chemins ; couvert par `test/guard.test.js`.
- Décision : le chemin absolu du binaire est écrit dans le plugin comme pour le hook Claude (`toolBin`), avec les mêmes limites ; la story 08-04 traite les espaces.

## Test Plan

- Tests unitaires du plugin généré : on l'importe depuis un dossier temporaire et on lui passe des entrées OpenCode (`write`, `edit`, `bash`, `apply_patch` LF et CRLF, `read`).
- `update`/`check` : créé, inchangé, régénéré, étranger, absent.
- Test d'intégration qui s'ignore sans `opencode` : `opencode debug config` voit le plugin.
- Preuve réelle manuelle (non automatisable sans appel modèle) : session OpenCode 1.19.x, tentative d'écriture dans `src/`, refus observé ; le constat va dans Result.

## Acceptance Traceability

| Critère | Preuve |
|---|---|
| write/edit refusés | test/opencode-guard.test.js::write et edit dans src |
| bash refusé | test/opencode-guard.test.js::bash |
| apply_patch | test/opencode-guard.test.js::apply_patch |
| outils de lecture | test/opencode-guard.test.js::read ignoré |
| fail-open tracé | test/opencode-guard.test.js::decide en erreur |
| pas de fichier sans OpenCode | test/opencode-guard.test.js::init ne crée rien sans OpenCode |
| marqueur | test/opencode-guard.test.js::plugin étranger / régénéré / inchangé |
| check | test/opencode-guard.test.js::état du plugin |
| session réelle | Result de la story (constat manuel) |

## Commands

```
npm test
```
