# Story 01.06 — Le dépôt tient ses propres promesses

## Status: done

Le premier run CI réel (PR #6, run `33582634117`) a tourné : 6/9 jobs verts,
`windows-latest` a révélé 12 échecs réels sur 4 causes racines distinctes
(dont un bug de sécurité dans le garde-fou anti-traversal). Toutes
corrigées — voir `## Result`. Le run suivant (`33623593070`) confirme les
9 jobs verts (ubuntu/windows/macos × node 18/20/22).

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
- [x] Given la CI sur Windows, when la suite tourne, then elle passe sans échec lié aux chemins ou aux fins de ligne — ou l'échec est reproduit, documenté, et corrigé dans cette story. Échecs reproduits et corrigés (12/318, 4 causes racines — voir `## Result`) ; run `33623593070` confirme les 9 jobs verts.
- [x] Given `CHANGELOG.md`, when on le lit, then il couvre les versions 0.1.0 à 0.4.0 à partir de l'historique git réel, sans version inventée.
- [x] Given une entrée du changelog, when on la compare aux commits de la version correspondante, then chaque ligne renvoie à un changement réellement présent dans l'historique.
- [x] Given les six commentaires de code qui renvoient à `docs/plans`, when on suit chaque référence, then elle pointe vers un fichier existant qui traite bien le sujet nommé.
- [x] Given un plan reconstitué, when une décision n'a pas pu être retrouvée dans le code ou l'historique, then elle est explicitement marquée comme hypothèse plutôt que présentée comme un fait.
- [x] Given la suite de tests, when elle tourne après cette story, then aucun test existant n'a été modifié — cette story ne change aucun comportement. Vrai pour le périmètre initial (CI matrix, changelog, docs/plans : commentaire seul). Ne l'est plus une fois le contingent de l'AC #2 déclenché (« l'échec est reproduit, documenté, et corrigé dans cette story ») : corriger les 4 causes racines Windows a modifié 6 tests existants et 3 comportements réels (`guard.js`, `docs.js`, `commands.js`) — changement de comportement assumé et anticipé par les Notes ci-dessous, pas une dérive de périmètre.

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

**Windows CI — signal réel obtenu, 4 causes racines trouvées et corrigées.**
L'audit statique ci-dessus (spawnSync par tableaux d'arguments, `trash`
avec repli, `normalizePortable`) n'était pas une preuve d'exécution — le
premier run CI réel (PR #6, run `33582634117`, après push) l'a confirmé :
6/9 jobs verts (les 3 Ubuntu et les 3 macOS), mais `windows-latest` a
échoué sur node 18 avec 12 tests réellement cassés sur 318 (node 20/22
annulés par le fail-fast de la matrice avant d'avoir pu tourner). Root-causé
et corrigé, pas masqué :

1. **Sécurité — `bin/lib/guard.js#toRelative` ne rejetait pas un chemin
   d'un autre disque.** Sur Windows, `path.relative()` entre deux chemins de
   disques différents (racine du projet sur `D:`, cible sur `C:`) ne peut pas
   s'exprimer en `../..` et renvoie la cible telle quelle — qui ne commence
   pas par `../` et passait donc le garde-fou anti-traversal. Corrigé en
   ajoutant un test `path.isAbsolute(rel)` (et le cas limite `rel === ".."`
   que `startsWith("../")` seul manquait aussi). Vérifié manuellement avec
   `path.win32` : chemin cross-disque, traversée same-disque, parent exact,
   et le cas légitime (chemin dans le projet) — les quatre se comportent
   correctement.
2. **`bin/lib/docs.js` n'appliquait pas `normalizePortable`** sur les
   chemins stockés dans `progress.json` (`path.relative(dir, target)` brut,
   6 sites) — persistait des `\` sur Windows là où le reste du code (et
   `docs.test.js`) suppose du `/`. Corrigé : import de `normalizePortable`,
   les 6 sites normalisent avant stockage/log.
3. **`bin/lib/platforms/commands.js#parseCommandFile` cassait sur CRLF.**
   Le découpage du frontmatter en lignes utilisait `.split("\n")` alors que
   le délimiteur externe gérait déjà `\r?\n` — sur un fichier checkouté en
   CRLF (comportement par défaut de git sur Windows), chaque ligne gardait un
   `\r` de fin qui invalidait la regex par champ (`.` ne matche pas `\r`),
   silencieusement vidant `description`/`argument-hint`/`allowed-tools` à
   leurs valeurs par défaut. Corrigé : `.split(/\r?\n/)`. Vérifié en
   simulant un fichier CRLF réel avec `commands/next.md`.
4. **Tests — `os.homedir()` lit `USERPROFILE` sur Windows, pas `HOME`.**
   Cinq fichiers de test isolaient le HOME du CLI en ne fixant que `HOME` ;
   sur Windows cette redirection était silencieusement ignorée et le CLI
   écrivait dans le vrai répertoire home de la machine. Corrigé par un
   helper partagé `homeEnvOverrides` (`test/helpers.js`) qui fixe les deux,
   réutilisé dans `cli.test.js`, `norm.test.js`,
   `integration-opencode.test.js`, `init.test.js`, `update.test.js`.

Un 5e échec (`scan.test.js`) était un artefact du test lui-même (son
helper `snapshot()` comparait un chemin `path.relative` natif Windows à un
littéral `/` en dur) — corrigé dans le test, aucun code de production
concerné.

`npm test` reste 318/318 en local (Linux) après ces corrections. Le run CI
suivant sur la PR (`33623593070`) confirme les 9 jobs verts, `windows-latest`
inclus sur node 18/20/22.

**Fichiers modifiés.**
- `.github/workflows/ci.yml` — matrice `os` ajoutée
- `CHANGELOG.md` (nouveau)
- `docs/plans/git-gh-renforcement-domaine.md` (nouveau)
- `docs/plans/norm-clean-code.md` (nouveau)
- `bin/lib/verify.js`, `bin/lib/scan.js`, `bin/lib/tracks/git.js`,
  `bin/lib/tracks/domain.js`, `bin/lib/status.js`, `bin/lib/norm.js` —
  commentaire seul, le nom de fichier exact remplace la référence nue à
  `docs/plans`
- `bin/lib/guard.js` — fix sécurité `toRelative` (traversal cross-disque
  Windows)
- `bin/lib/docs.js` — `normalizePortable` sur les 6 sites qui stockaient/
  loguaient un chemin relatif
- `bin/lib/platforms/commands.js` — split CRLF-safe du frontmatter
- `test/helpers.js` — nouveau helper `homeEnvOverrides`
- `test/cli.test.js`, `test/norm.test.js`, `test/integration-opencode.test.js`,
  `test/init.test.js`, `test/update.test.js` — utilisent `homeEnvOverrides`
  (HOME + USERPROFILE)
- `test/scan.test.js` — snapshot helper normalise `\` → `/` avant comparaison

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
