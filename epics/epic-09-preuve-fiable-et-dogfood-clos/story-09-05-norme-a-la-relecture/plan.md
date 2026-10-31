# Plan — Story 09.05

## Implementation Context

Fichiers probables :

- bin/lib/norm.js (`normHookContext` accepte `Read` sur fichier apprenant ; matcher installé ; mise à jour par `update`)
- bin/lib/next.js (`norm` dans le rapport)
- bin/lib/update.js (matcher)
- templates/AGENTS-apprentissage.md (§3quater)
- test/norm.test.js, test/next.test.js, test/update.test.js

Ancres : `normHookContext`, `NORM_HOOK_MARKER`, `const matcher = "Write|Edit|MultiEdit"`, `buildNextReport`

Mode : `STANDARD` · scout pre-step : `no`

À éviter : rendre le hook bloquant ; mesurer tout `src/**` à chaque lecture.

## Decisions

- **Accrocher la mesure à la relecture plutôt qu'à l'écriture** : en mode apprenti, la relecture par l'IA est le seul moment mécanique où le code de l'apprenant passe devant l'agent, et c'est exactement le moment du feedback (AGENTS §2).
- **`next` comme repli universel** : appelé à chaque reprise par `/learn-next`, il porte la norme sur toutes les plateformes sans nouveau hook.
- **Vérifier la doc d'abord** : le comportement de `PostToolUse` sur `Read` est une hypothèse ; la story ne la code pas sans source.

## Test Plan

Entrées de hook `Read` simulées (fichier apprenant avec/sans violation, fichier hors périmètre, lecture partielle) ; `next` avec violation ; `update` sur un settings existant avec hooks tiers.

## Acceptance Traceability

| Critère | Preuve |
|---|---|
| Read violation | test/norm.test.js::a Read of a learner file reports its violations without blocking |
| hors périmètre | test/norm.test.js::a Read outside learner files is silent |
| propre | test/norm.test.js::a Read of a clean learner file is silent |
| update | test/update.test.js::update adds Read to the norm hook matcher |
| next | test/next.test.js::next reports learner norm violations |
| doc | Result (source citée) |

## Commands

```
npm test
```
