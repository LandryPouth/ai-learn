# Story 01.06 — Le dépôt tient ses propres promesses

## Goal

Réparer trois endroits où `ai-learn` ne s'applique pas à lui-même ce qu'il exige de
ses utilisateurs : une CI qui ne teste pas ce que le README affirme, un historique de
versions absent, et les décisions de conception les plus importantes du projet
renvoyées à un dossier qui n'existe pas.

## Context

**1. La CI ne couvre pas Windows ni macOS.** `.github/workflows/ci.yml` tourne sur
`ubuntu-latest` seulement, alors que le README affirme « Windows/PowerShell testé »
et que le code traite explicitement des cas OS : bascule symlink → copie sur `EPERM`
Windows, `normalizePortable` sur tous les chemins écrits, `shell: true` pour les
checkpoints. Rien ne protège ces cas d'une régression. L'epic 01 ajoute par-dessus
une empreinte de fichiers sensible aux séparateurs de chemin et aux fins de ligne :
sans CI multi-OS, ce risque reste invisible.

**2. Aucun `CHANGELOG.md`** alors que le projet versionne proprement
(0.1.0 → 0.4.0, avec des commits de release dédiés) et que `ai-learn upgrade` met à
jour l'outil chez des utilisateurs qui n'ont aucun moyen de savoir ce qui change.

**3. `docs/plans/` n'existe pas.** Six commentaires de code y renvoient comme à la
source des décisions de conception :

- `bin/lib/verify.js:99` — « docs/plans — Partie B »
- `bin/lib/tracks/git.js:22` — « docs/plans — Partie A du module git/gh »
- `bin/lib/tracks/domain.js:7` — « docs/plans — Partie C »
- `bin/lib/scan.js:707` — « docs/plans — Partie B », banque de renfort 10x
- `bin/lib/status.js:89` — « décision : toujours vérifier — voir docs/plans »
- `bin/lib/norm.js:5` — la décision de rejeter la Norminette hébergée

Ce sont les raisons du *pourquoi* de l'outil, et elles sont des références mortes.

## Acceptance Criteria

- [ ] Given le workflow CI, when il est déclenché, then la suite tourne sur Ubuntu, Windows et macOS.
- [ ] Given la CI sur Windows, when la suite tourne, then elle passe sans échec lié aux chemins ou aux fins de ligne — ou l'échec est reproduit, documenté, et corrigé dans cette story.
- [ ] Given `CHANGELOG.md`, when on le lit, then il couvre les versions 0.1.0 à 0.4.0 à partir de l'historique git réel, sans version inventée.
- [ ] Given une entrée du changelog, when on la compare aux commits de la version correspondante, then chaque ligne renvoie à un changement réellement présent dans l'historique.
- [ ] Given les six commentaires de code qui renvoient à `docs/plans`, when on suit chaque référence, then elle pointe vers un fichier existant qui traite bien le sujet nommé.
- [ ] Given un plan reconstitué, when une décision n'a pas pu être retrouvée dans le code ou l'historique, then elle est explicitement marquée comme hypothèse plutôt que présentée comme un fait.
- [ ] Given la suite de tests, when elle tourne après cette story, then aucun test existant n'a été modifié — cette story ne change aucun comportement.

## Notes

- Les plans se **reconstituent** depuis les commentaires de code, l'historique git et
  le README — jamais depuis l'imagination. Une décision non retrouvée est une
  hypothèse marquée comme telle : c'est la même règle anti-hallucination que
  `check.js#checkGeneratedSource` impose déjà aux sources de doc régénérées.
- Le skill `/changelog` du dépôt fait le premier jet du `CHANGELOG.md`. Le relire
  contre `git log` avant de le committer.
- La CI Windows peut révéler de vrais échecs préexistants. S'ils sortent : les
  corriger fait partie de cette story ; les masquer par un `continue-on-error` ne
  serait pas acceptable dans un projet dont l'argument est que les limites se
  documentent, jamais ne se cachent.
- Ordre recommandé : la CI d'abord (elle peut révéler du travail), le changelog
  ensuite, les plans en dernier (ils bénéficieront des décisions de l'epic 01).

## Commands

- Command: `npm test`
  - Expected: la suite complète passe, inchangée.
- Command: `git log --oneline` (relecture du changelog contre l'historique réel)
  - Expected: chaque entrée du changelog correspond à des commits existants.

## Result

_Rempli après exécution : résumé, fichiers modifiés, tests exécutés._

### Rollback Notes

-
