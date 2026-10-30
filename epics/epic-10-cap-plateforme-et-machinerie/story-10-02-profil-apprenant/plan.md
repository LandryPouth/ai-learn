# Plan — Story 10.02

## Implementation Context

Fichiers probables :

- bin/lib/profile.js (nouveau, calqué sur `tutor.js` + `home` injectable comme `tracks/git.js`)
- bin/ai-learn.js (sous-commande `profile`)
- bin/lib/status.js, bin/lib/check.js
- commands/learn.md, commands/learn-next.md
- README.md (tableau des mécanismes), docs/project-context.md (table des mécanismes)
- test/profile.test.js (nouveau)

Ancres : `readTutorConfig`, `validateTutorConfig`, `tracksHome`, `tutor profile (story 05.05)`

Mode : `STANDARD` · scout pre-step : `no`

À éviter : `guard.js` (sa protection de `~/.ai-learn/**` suffit).

## Decisions

- JSON plutôt que Markdown : validé, lisible par `status`/`check`, et le futur choix des paliers (10.03) lit des champs, pas de la prose.
- Écriture par le CLI seulement : même discipline que les ledgers ; l'IA ne réécrit jamais `~/.ai-learn/**` à la main.
- Le profil n'est jamais bloquant : absent = comportement actuel.

## Test Plan

Unitaires sur `validateProfile` (chaque champ, limites) ; CLI `profile set` / `profile --json` sur home temporaire ; `check` et `status` sur profil absent/invalide/valide.

## Acceptance Traceability

| Critère | Preuve |
|---|---|
| absent | test/profile.test.js::profile --json reports exists false when missing |
| set valide | test/profile.test.js::profile set writes a versioned profile |
| set invalide | test/profile.test.js::profile set refuses invalid fields and leaves the file untouched |
| check | test/profile.test.js::check reports a corrupt profile |
| status | test/profile.test.js::status prints the profile line |
| learn.md | test/commands.test.js::learn creates the profile once and never re-asks |
| aucune donnée perso | revue `/flow-review` |

## Commands

```
npm test
```
