# Plan — Story 10.01

## Implementation Context

Fichiers probables :

- commands/learn.md, commands/learn-next.md, commands/learn-status.md
- commands/references/{scan,propose,check,docs}.md (déplacés depuis commands/learn-*.md)
- bin/lib/platforms/commands.js (`COMMAND_ALIASES`, `listCommands`)
- bin/lib/platforms/skills.js (`renderSkill` : fichiers annexes)
- bin/lib/install.js (`writeSkill`, `migrateLegacyCommands`, retrait des skills retirés)
- bin/lib/platforms/retired.js (nouveau : empreintes des versions publiées)
- bin/lib/platforms/ensure.js (self-heal : marqueurs)
- templates/AGENTS-apprentissage.md (section « Commandes »)
- README.md, CHANGELOG.md, docs/architecture.md, docs/project-context.md (liste des commandes)
- test/install.test.js, test/platforms.test.js, test/integration-opencode.test.js

Ancres : `COMMAND_ALIASES`, `DEPRECATION_MARKER`, `looksLikeOurSkill`, `legacyExpected`, `result.kept`, `learn-propose`

Mode : `STRICT` (suppression de fichiers dans le home de l'utilisateur) · scout pre-step : `no`

À éviter : le CLI `scan`/`propose`/`check`/`docs` lui-même, `guard.js`.

## Decisions

- **Retrait par empreinte publiée, pas par heuristique.** `looksLikeOurSkill` dit « c'est un skill ai-learn », pas « il n'a pas été modifié ». Avant de supprimer les sources, on calcule le SHA-256 du rendu de chaque skill retiré pour chaque plateforme, sur chaque version publiée depuis 08.03 (rendus reconstruits depuis `git show <tag>:commands/…`), et on les fige dans `bin/lib/platforms/retired.js`. Un fichier installé dont l'empreinte (après normalisation CRLF→LF) est dans la liste est retiré ; sinon conservé et nommé.
- **Références dans le dossier du skill.** `learn/references/*.md` : un seul skill, pas de seconde source. Vérifier par plateforme que le chargeur ignore ces fichiers comme skills (aucun frontmatter `name` dedans) ; si une plateforme n'expose pas les fichiers annexes à l'agent, le rendu de cette plateforme inline les références en annexe de `SKILL.md` — à prouver comme en 08.03 (`opencode debug skill`, doc embarquée), pas supposer.
- **Aucun alias conservé.** Décision utilisateur (« garde juste les 4 commandes »). Rupture assumée : CHANGELOG + sortie d'`install` nomment chaque retrait et la commande qui la remplace (`/learn`).
- **`/learn-next` lance `check` en silence** : la ceinture de sécurité reste active sans commande dédiée.

## Test Plan

Rouge d'abord : install sur home vierge (3 skills + references) ; retrait des skills retirés non modifiés pour chaque plateforme ; conservation d'un fichier modifié ; skill utilisateur homonyme intact ; `--dry-run` ; idempotence (deuxième install = rien) ; fin de ligne CRLF reconnue ; parseur strict de frontmatter sur les sorties ; OpenCode `debug skill` (auto-skip).

## Acceptance Traceability

| Critère | Preuve |
|---|---|
| 3 skills + references | test/install.test.js::fresh install writes only the visible skills and references |
| retrait non modifié | test/install.test.js::retired skills removed by published fingerprint |
| modifié conservé | test/install.test.js::modified retired skill is kept and named |
| homonyme intact | test/install.test.js::unrelated user skill named check is untouched |
| dry-run | test/install.test.js::dry-run lists retirements without touching disk |
| 5 plateformes | test/platforms.test.js::every platform renders the three skills and references |
| learn.md route | test/commands.test.js::learn routes to references and never asks the learner to type ai-learn |
| README / AGENTS | test/init.test.js::AGENTS commands section lists only visible commands |

## Commands

```
npm test
```
