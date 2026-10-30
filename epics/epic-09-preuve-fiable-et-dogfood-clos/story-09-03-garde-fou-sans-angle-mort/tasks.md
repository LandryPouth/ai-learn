# Tasks — Story 09.03

- [x] Tests rouges : guard (4 fichiers), predict deux temps, hook mort, réparation.
- [x] `PROTECTED_FILES` + motifs.
- [x] `predictions.js` : enregistrement seul, `--reveal`, rétro-compat ; aide CLI.
- [x] `check` : hook mort (erreur), non révélée, après coup.
- [x] `update` : chemin mort remplacé (guard, norm, OpenCode, Codex).
- [x] AGENTS §2 et README (frontière du guard).
- [x] Rejouer sur une copie : couvert par test/check.test.js (hook mort) + test/update.test.js (réparation).
- [x] `npm test` (856 verts). `/flow-review` : revue indépendante ci-dessous.

## Result

- `guard.js` : 4 réglages dans `PROTECTED_FILES` (motifs dédiés : `predict` pour predictions.json, « l'apprenant édite » pour les autres) ; `hookScriptPath/hookScriptMissing` ; `ensureGuardHook` repointe un chemin mort, garde un chemin vivant.
- `norm.js` : `ensureNormHook` ne repointe plus qu'un chemin mort (avant : tout chemin différent).
- `predictions.js` / `ai-learn.js` : `predict` en deux temps, `--reveal <id>`, rétro-compat un temps.
- `check.js` : erreur « garde-fou éteint » (hook PreToolUse guard et PostToolUse norm), avertissement non révélée > 7 j, info « après coup » (nouveau canal `infos`).
- AGENTS §2 et README mis à jour.
- Revue indépendante (STRICT) : corrigés — parsing du chemin de hook (espaces, `$VAR`/`~`, lanceur inconnu = jamais « mort », relatif résolu depuis le projet), `--reveal` final et exigeant un feedback, norm : chemin mort repointé / non-quoté re-quoté / vivant conservé. Non corrigés : `predict` + `--reveal` enchaînés prouvent l'ordre des appels CLI, pas l'antériorité humaine (limite déjà assumée par AGENTS §2) ; une prédiction nue compte pour `predictionsRequired` (avertissement à 7 j seulement) ; `revealedAt` non typé dans la validation ; garde nested `src/.ai-learn/tutor.json` non protégé (non lu par l'outil).
- Revue post-merge : `check` détecte aussi le plugin OpenCode mort (`const BINARY`) ; le profil Codex n'a pas de chemin de script, rien à vérifier. `--reveal` exige le feedback complet (corrigé optionnel). Usage CLI corrigé.
- Limite assumée : la haie Bash ne voit pas les écritures via interpréteur en ligne (`python -c`), comme pour `guard.json`.

### Rollback Notes

## Status: done
