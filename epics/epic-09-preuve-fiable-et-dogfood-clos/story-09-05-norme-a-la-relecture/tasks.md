# Tasks — Story 09.05

- [x] Vérifier dans la doc Claude Code : `PostToolUse` sur `Read`, retour de contexte à l'agent. Citer la source au Result.
- [x] Tests rouges (hook Read, next, update).
- [x] `norm.js` : `Read` + matcher ; `update` ; `next`.
- [x] AGENTS §3quater.
- [~] Rejouer sur une copie de Fastify : un `Read` simulé de `src/` remonte-t-il une violation réelle ? Consigner. — différé : projet `fastify-traducteur-api` introuvable ; `file_path` de `Read` à observer sur un vrai Claude Code.
- [x] `npm test`, `/flow-review`.

## Status: done

## Result

### Changed
- `bin/lib/norm.js` : `Read` mesuré (`MEASURED_TOOLS`), matcher `Write|Edit|MultiEdit|Read`, `ensureNormHook` élargit l'ancien matcher en place (hooks tiers intacts).
- `bin/lib/next.js` : champ `norm.violations` (JSON) + section « Norme : N violation(s) » (texte).
- `templates/AGENTS-apprentissage.md` §3quater : mesure à la relecture + repli `next` / `ai-learn norm`.
- Tests : norm (3 Read + élargissement matcher), next, update.

### Doc check
Source : https://code.claude.com/docs/en/hooks — `PostToolUse` se déclenche sur chaque appel d'outil (hors EndConversation) et filtre le matcher sur le nom d'outil (`Read` valide) ; `hookSpecificOutput.additionalContext` renvoie du contexte à l'agent. Le champ `file_path` de l'entrée `Read` n'est pas détaillé sur cette page (renvoi vers la référence des outils) : supposé identique à Write/Edit, non confirmé. Pas de repli nécessaire.

### Remaining Risks
- Rejeu sur copie de Fastify non fait : projet `fastify-traducteur-api` introuvable sous `~/dev/tools/tech-experiments`. Tâche laissée `[~]`.
- Lecture sur Claude Code réel non observée (simulée par entrées de hook).

### Rollback Notes
`git revert` du commit.
