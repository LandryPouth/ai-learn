# Tasks — Story 08.01

- [x] Lire `coding-flow/bin/lib/opencode.js` et `test/opencode-guard.test.js` ; relever les noms d'arguments d'outils OpenCode vérifiés (`filePath`, `newString`, `patchText`).
- [x] Vérifier sur `opencode 1.19.3` que `.opencode/plugins/*.js` est chargé (`opencode debug config`, `opencode debug info`).
- [x] Écrire les tests rouges du plugin généré (write, edit, bash, apply_patch, read, fail-open).
- [x] Implémenter `bin/lib/platforms/opencode-guard.js`.
- [x] Câbler `init`, `update`, `check` ; test d'absence de fichier hors OpenCode.
- [x] Observer un vrai refus dans OpenCode ; consigner le constat.
- [x] README : cellule OpenCode, seulement après le constat ; `docs/architecture.md` ; `docs/project-context.md` si l'état change.
- [x] `npm test`, puis `/flow-review`.

## Result

### Ce qui a été livré

- `templates/opencode-guard-plugin.js` — source du plugin généré (ESM, `default.server`
  pour OpenCode 1.x, forme 2.x `{ id, server, setup }` avec sortie tôt de `setup`
  sans `ctx.tool`). Traduction `write→Write`, `edit→Edit`, `bash→Bash`,
  `apply_patch→un Write par fichier + Move to` ; outils de lecture ignorés.
  `decide` est appelé en processus (`createRequire`), repli `spawnSync("node",
  [bin, "guard"])`, puis fail-open tracé « NOT checked ».
- `bin/lib/platforms/opencode-guard.js` — `ensureOpenCodeGuard` (créé / régénéré /
  inchangé / laissé intact), `inspectOpenCodeGuard` (current / stale / foreign /
  absent), `usesOpenCode`, marqueur de première ligne `// ai-learn:guard-plugin`.
- `bin/lib/guard.js` — `recordUnchecked` (journal borné
  `.ai-learn/guard-unchecked.jsonl`) et export de `recordDenial`, pour que le
  refus en processus laisse la même trace que le hook Claude. `decide` est
  inchangé.
- `init` / `update` : plugin écrit seulement si OpenCode est utilisé
  (`opencode.json`, `opencode.jsonc`, `.opencode/`) ou `--platform opencode` ;
  `update` nomme `créé` / `régénéré` / `inchangé` / `personnalisé — laissé intact`.
- `check` : warning actionnable (`ai-learn update`) sur absent / périmé /
  étranger, seulement quand OpenCode est utilisé ; ligne `guard (opencode)` dans
  le rapport.
- README (cellule OpenCode), `docs/architecture.md`, `docs/project-context.md`,
  `docs/DOGFOODING.md` (verrou de story périmé).

### Preuve réelle (session OpenCode 1.19.3)

Projet temporaire (`.ai-learn/guard.json` + `opencode.json` + plugin généré par
`ensureOpenCodeGuard`), modèle `opencode/deepseek-v4.1-flash-free`,
`opencode run --auto --format json`, session `ses_e9214b5a3ffeoJLv8D2MWiXvh4` :

```text
TOOL write status=error
error: "ai-learn guard: src/a.js est un fichier solution de l'apprenant (src/**).
L'IA n'écrit pas ici : révéler le code dans le chat (ou dans `docs/solutions/` si
l'apprenant le demande), l'apprenant tape le vrai code (cf. AGENTS.md §3)."
```

`src/a.js` n'existe pas après l'appel et `.ai-learn/guard.log` contient le refus
(tool `Write`, path `src/a.js`). Le refus vient du plugin généré, pas de la prose
d'`AGENTS.md` : le prompt de test demande explicitement d'appeler `write` et de
rapporter l'erreur. Preuve rejouée après les correctifs de revue.

### Validation

- `npm test` : 786 tests, 0 échec ; `test/opencode-guard.test.js` en compte 39.
- `ai-flow verify --story epics/epic-08-portabilite-multi-plateformes/story-08-01-garde-opencode` : voir le verdict capturé.

### Rollback Notes

- `git revert` suffit : le plugin généré est un fichier neuf (marqueur en
  première ligne). `init`/`update` ne le suppriment jamais : ils le régénèrent
  s'il porte notre marqueur et laissent intact tout plugin personnalisé. Un
  projet déjà équipé garde donc son `.opencode/plugins/ai-learn-guard.js`
  jusqu'à ce qu'il soit supprimé à la main — aucun état de données, aucune
  migration.
- Le journal `.ai-learn/guard-unchecked.jsonl` est purement diagnostique et peut
  être supprimé sans conséquence.

## Status: done
