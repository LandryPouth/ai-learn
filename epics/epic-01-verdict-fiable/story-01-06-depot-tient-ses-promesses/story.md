# Story 01.06 — Le dépôt tient ses propres promesses

## Status: in-progress

Bloqué sur un seul point : la CI Windows n'a pas pu être observée en exécution
réelle depuis ce sandbox (pas de runner Windows disponible ici). Tout le reste
est vert et prouvé — voir `## Result`. Passera à `done` une fois le premier
run CI réel confirmé (ou un échec réel corrigé) après push/PR.

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

- [x] Given le workflow CI, when il est déclenché, then la suite tourne sur Ubuntu, Windows et macOS.
- [ ] Given la CI sur Windows, when la suite tourne, then elle passe sans échec lié aux chemins ou aux fins de ligne — ou l'échec est reproduit, documenté, et corrigé dans cette story. **Non vérifiable dans cet environnement** (sandbox Linux, pas de runner Windows) — voir `## Result`.
- [x] Given `CHANGELOG.md`, when on le lit, then il couvre les versions 0.1.0 à 0.4.0 à partir de l'historique git réel, sans version inventée.
- [x] Given une entrée du changelog, when on la compare aux commits de la version correspondante, then chaque ligne renvoie à un changement réellement présent dans l'historique.
- [x] Given les six commentaires de code qui renvoient à `docs/plans`, when on suit chaque référence, then elle pointe vers un fichier existant qui traite bien le sujet nommé.
- [x] Given un plan reconstitué, when une décision n'a pas pu être retrouvée dans le code ou l'historique, then elle est explicitement marquée comme hypothèse plutôt que présentée comme un fait.
- [x] Given la suite de tests, when elle tourne après cette story, then aucun test existant n'a été modifié — cette story ne change aucun comportement.

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

**Résumé.** Les trois lacunes de l'audit sont fermées.

1. **CI multi-OS.** `.github/workflows/ci.yml` fait tourner la matrice
   `[ubuntu-latest, windows-latest, macos-latest] × node [18, 20, 22]` (9 jobs)
   au lieu d'Ubuntu seul.
2. **`CHANGELOG.md`** créé à la racine, groupé par la valeur réelle de
   `version` dans `package.json` au moment de chaque commit (0.1.0 → 0.4.0),
   chaque ligne citant son hash court. Reconstruit et vérifié à la main contre
   `git log` (voir méthode ci-dessous) — le script du skill `/changelog`
   (mode compact, groupé par date) n'a pas été utilisé tel quel : la story
   demande un regroupement par version, pas par date de commit.
3. **`docs/plans/` reconstitué**, deux fichiers :
   - `docs/plans/git-gh-renforcement-domaine.md` (Parties A/B/C — module
     git/gh à 6 tiers, banque de renforcement « 10x », ledger de maîtrise de
     domaine) — les trois viennent du même commit `98fc7ff`, documentées
     ensemble pour cette raison.
   - `docs/plans/norm-clean-code.md` — rejet d'une Norminette hébergée au
     profit d'un vérificateur heuristique local, et la décision « toujours
     revérifier, jamais en cache » de `status.js`.
   Les 6 commentaires de code qui renvoyaient à `docs/plans` (répertoire nu)
   citent maintenant le fichier exact.

**Méthode de reconstruction (changelog et plans).** Uniquement depuis
l'historique git réel et les commentaires de code — jamais depuis la mémoire.
Pour le changelog : les 3 commits `chore(release): bump version X -> Y`
(`f2eee54`, `ff35f6e`, `5a69921`) donnent les frontières exactes ;
`git log <bump-précédent>..<bump-suivant> --no-merges` donne le contenu de
chaque version, vérifié une seconde fois contre `git log --follow -p --
package.json` pour confirmer que `0.1.0` est bien la toute première valeur du
champ (aucun bump `0.0.x → 0.1.0` n'existe). Pour les plans : les commits
`98fc7ff` et `985806a` (messages complets, pas seulement le sujet) plus le
code actuel de `bin/lib/tracks/git.js`, `bin/lib/tracks/domain.js`,
`bin/lib/scan.js` et `bin/lib/norm.js`. Aucune décision documentée n'a dû être
marquée hypothèse — tout ce qui est écrit trace vers un commit ou un bout de
code réel.

**Windows CI — limite assumée, pas cachée.** Cet environnement d'exécution
est un sandbox Linux sans runner Windows disponible : je n'ai pas pu
déclencher la CI réelle ni observer un passage effectif sur
`windows-latest`. À la place : audit statique des points de risque
Windows-spécifiques identifiés dans le contexte de la story — tous les appels
`spawnSync` du code source (hors `verify.js`, qui exécute la commande de
checkpoint de l'apprenant) passent des tableaux d'arguments (`git`, `gh`),
jamais de chaîne shell POSIX-only ; `docs.js#removePath` sonde `trash
--version` et retombe sur `fs.rmSync` s'il est absent (trash-cli n'est pas
garanti sur les runners Windows) ; la gestion des chemins passe par
`path.join`/`normalizePortable` (story 01.01) plutôt que des `/` en dur.
Aucun bloqueur évident trouvé, mais **ce n'est pas une preuve d'exécution** —
le premier signal réel viendra du premier run CI après la fusion de cette
story. Risque non résolu, consigné ici plutôt que masqué par une case cochée
sans preuve.

**Fichiers modifiés.**
- `.github/workflows/ci.yml` — matrice `os` ajoutée
- `CHANGELOG.md` (nouveau)
- `docs/plans/git-gh-renforcement-domaine.md` (nouveau)
- `docs/plans/norm-clean-code.md` (nouveau)
- `bin/lib/verify.js`, `bin/lib/scan.js`, `bin/lib/tracks/git.js`,
  `bin/lib/tracks/domain.js`, `bin/lib/status.js`, `bin/lib/norm.js` —
  commentaire seul, le nom de fichier exact remplace la référence nue à
  `docs/plans`

**Tests exécutés.**
- `npm test` → 318/318, 0 échec, aucun test existant modifié (comparé au
  318/318 obtenu avant cette story).
- `ai-flow verify --story epics/epic-01-verdict-fiable/story-01-06-depot-tient-ses-promesses`
  → `npm test` vert (1 commande déclarée).

**Revue.** `/flow-review` a relevé un P3 non bloquant : la section `0.4.0`
(ouverte) du changelog omettait `e85cd94` (`chore(coding-flow): commit
epic-01 planning scaffold and setup upgrade`), déjà sur `main` avant le
point de branche de cette story. Corrigé — la ligne est ajoutée.

### Rollback Notes

`git revert` du commit de cette story suffit : `CHANGELOG.md` et `docs/plans/`
sont de nouveaux fichiers (suppression propre), les 6 changements dans
`bin/lib/**` sont des commentaires seuls (aucune donnée à migrer), et le
changement CI n'affecte que le nombre de jobs exécutés, pas leur contenu.
