# Tasks — Story 09.05

- [x] Vérifier dans la doc Claude Code : `PostToolUse` sur `Read`, retour de contexte à l'agent. Citer la source au Result.
- [x] Tests rouges (hook Read, next, update).
- [x] `norm.js` : `Read` + matcher ; `update` ; `next`.
- [x] AGENTS §3quater.
- [x] Rejouer sur une copie de Fastify : un `Read` simulé de `src/` remonte-t-il une violation réelle ? Consigner.
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
- Lecture sur Claude Code réel non observée (simulée par entrées de hook).

### Rejeu Fastify
Copie de `~/dev/learning/tech-experiments/fastify-traducteur-api` (scratchpad, sans `node_modules`/`.git`). Les 4 fichiers de `src/` sont propres : `Read` simulé silencieux, `ai-learn norm` concorde. Après ajout d'une fonction de 83 lignes dans `src/routes/documents.ts`, un `Read` avec `offset`/`limit` renvoie `src/routes/documents.ts:80 — function \`tropLongue\` is 83 lines (max 50) [function-length]` (exit 0) ; un `Read` de `README.md` reste silencieux ; `ai-learn next` cite la même violation. Entrées de hook simulées : le `file_path` d'un vrai `Read` Claude Code reste à observer.

### Rollback Notes
`git revert` du commit.
