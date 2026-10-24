# Story 08.01 — Garde OpenCode (plugin `tool.execute.before`)

## Goal

`init`/`update` câblent, pour un projet OpenCode, un plugin `.opencode/plugins/ai-learn-guard.js` qui refuse une écriture de l'IA dans `src/**` (mode `apprenti`) avec la même décision que le hook Claude.

## Risk

Garde d'accès : un faux « autorisé » désarme la pédagogie, un faux « refusé » bloque l'apprenant. Écrit dans `.opencode/` : jamais d'écrasement d'un fichier qui n'est pas le nôtre.

## Acceptance Criteria

- [x] Given un appel OpenCode `write` ou `edit` sur `src/a.js` en mode `apprenti`, when le plugin généré reçoit `tool.execute.before`, then il lève une erreur dont le message est la raison de `decide`.
- [x] Given un appel `bash` qui écrit dans `src/` (`echo x > src/a.js`) ou lance `ai-learn mode`, when le plugin tourne, then il refuse comme le hook Claude.
- [x] Given un appel `apply_patch` dont le `patchText` ajoute ou déplace un fichier vers `src/**`, when le plugin tourne, then il refuse ; un patch qui ne touche que `test/**` passe.
- [x] Given un appel `read`, `glob` ou `grep`, when le plugin tourne, then aucun contrôle n'est lancé et rien n'est refusé.
- [x] Given `decide` indisponible ou en erreur, when une écriture arrive, then elle passe (fail-open) mais « NOT checked » est écrit sur stderr et tracé dans le journal des gardes non vérifiées.
- [x] Given un projet sans `opencode.json` ni `.opencode/`, when `init` tourne sans `--platform opencode`, then aucun fichier OpenCode n'est créé.
- [x] Given un plugin existant sans notre marqueur, when `update` tourne, then il est laissé intact et nommé ; avec notre marqueur il est régénéré ; s'il est à jour, `unchanged`.
- [x] Given un plugin absent, périmé ou étranger, when `check` tourne, then il le signale avec la correction (`ai-learn update`).
- [x] Given le binaire `opencode` présent, when un refus est provoqué dans une vraie session OpenCode 1.19.x, then le refus est observé et consigné dans la section Result de la story. Le README ne passe en « mécanique » qu'après ce constat.

## Edge Cases

- [x] `patchText` avec fins de ligne CRLF, ou dont aucun fichier n'est lisible : traité comme une écriture à vérifier, jamais comme « rien à contrôler ».
- [x] Le plugin doit être chargeable par OpenCode 1.x (`default.server`) ; la forme 2.x `{ id, server, setup }` est présente et `setup` sort tôt sans `ctx.tool`.
- [x] Le répertoire de démarrage d'OpenCode est sous la racine du projet : la racine est retrouvée avec `findProjectRoot`.
- [x] Chemins avec espaces et séparateurs Windows dans les arguments d'outil.
- [x] `opencode.jsonc` avec commentaires : on ne le réécrit pas.

## Out of Scope

- [ ] Modifier `decide` ou la grammaire shell.
- [ ] Hook `norm` (story 08-02).
- [ ] Gemini, Antigravity.
