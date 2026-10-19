# Story 02.06 — Protocole de mutation pour l'agent IA

## Goal

Apprendre à l'IA pédagogique un nouveau geste de prédiction — *quel test doit
tomber, et pourquoi* — avant de lancer `ai-learn mutate`/`ai-learn verify` sur
une phase à mutation exigée, et documenter la distinction entre `checkpoint/`
(la preuve exécutée de l'outil) et un éventuel `test/**` du projet (le travail
de l'apprenant qui n'est pas nécessairement la preuve elle-même).

## Context

`templates/AGENTS-apprentissage.md` numérote déjà ses sections en ordinaux
latins pour chaque variante du protocole de prédiction : §3 (le code), §3bis
(git/gh), §3ter (la casse d'un stress test), §3quater (la norme clean-code).
Le roadmap (`docs/roadmap.md`, epic 02 story 6) nomme explicitement
« §3quinquies » pour la mutation.

`commands/learn.md` (la commande `/learn`) doit mentionner la mutation dans
son flux, au même niveau que les mentions déjà présentes de la norme et des
prédictions (epic 01). `templates/checkpoint-readme.md` explique déjà que
`checkpoint/` est scaffoldé vide et écrit par l'apprenant lui-même — il manque
la distinction avec `test/**` pour éviter la confusion « `mutate` va-t-il me
juger sur mes propres tests, ou sur ceux de l'outil ? » (réponse : `mutate`
mute `src/**` contre la commande que `phase.checkpoint` désigne — souvent dans
`checkpoint/`, jamais sur `test/**` en tant que tel). `README.md` doit
mentionner `ai-learn mutate` au même niveau de détail que `ai-learn norm` y est
déjà décrit.

Purement documentaire : aucun fichier de `bin/lib/**` n'est touché, aucun test
existant ne change.

## Acceptance Criteria

- [x] Given `templates/AGENTS-apprentissage.md`, when on cherche `3quinquies`,
      then la section existe, suit immédiatement `3quater`, et décrit un
      protocole de prédiction (quel site va survivre/être tué, et pourquoi) —
      pas un simple rappel du mécanisme déjà documenté ailleurs.
- [x] Given un projet fraîchement scaffoldé par `ai-learn init`, when
      `AGENTS.md` est généré, then il contient la nouvelle section (vérifier
      que la génération copie le template intégralement, sans filtrer les
      sections nouvelles).
- [x] Given `commands/learn.md`, when on le lit, then la mutation apparaît dans
      le flux décrit, avec le même vocabulaire que `AGENTS-apprentissage.md`
      (« mutant survécu/tué », pas un synonyme inventé).
- [x] Given `templates/checkpoint-readme.md`, when on le lit, then la
      distinction `checkpoint/` vs `test/**` est explicite et actionnable.
- [x] Given `README.md`, when on cherche `mutate`, then une mention existe,
      cohérente en ton et en longueur avec la mention existante de `ai-learn norm`.
- [x] Given la suite de tests du dépôt, when elle tourne après cette story,
      then aucun test n'est modifié ni cassé.

## Notes

- Le protocole doit couvrir explicitement le cas « aucun site mutable trouvé »
  comme une prédiction valide (une stack pauvre en opérateurs, comme
  `generic.js`, ne doit jamais rendre la section 3quinquies inapplicable).
- Vocabulaire à définir en une phrase à sa première occurrence, comme
  `stressCheckpoint` l'est déjà en §3ter : « mutant », « opérateur de
  mutation », « survécu »/« tué ».
- Cette story ne rétro-modifie aucun `AGENTS.md` déjà généré chez un
  apprenant — seul `ai-learn update` (existant, hors scope ici) régénère ce
  fichier selon son propre contrat.
- Dépend de **story-02-02** au minimum pour que le vocabulaire documenté
  (opérateurs, score de mutation, rapport) corresponde à ce qui existe
  réellement. Fichiers strictement disjoints des autres stories de l'epic
  (`templates/**`, `commands/learn.md`, `README.md` ici, contre `bin/lib/**`
  ailleurs) — exécutable dans son propre worktree en parallèle de
  story-02-03/02-04/02-05.

## Commands

- Command: `npm test`
  - Expected: la suite complète passe, inchangée.
- Command: `node bin/ai-learn.js init --dir <projet-temporaire>` puis inspecter
  `AGENTS.md`
  - Expected: la section `3quinquies` est présente dans le fichier généré.

## Status: done

## Result

Documentation seule : §3quinquies ajoutée à `templates/AGENTS-apprentissage.md`
(vocabulaire mutant/opérateur/tué/survécu défini à la première occurrence, cas
« aucun site mutable » couvert, tier « rouge d'abord » lu depuis les évidences) ;
champ de phase `mutation` ajouté à `commands/learn.md` ; distinction
`checkpoint/` vs `test/**` dans `templates/checkpoint-readme.md` ; ligne
`ai-learn mutate` dans le tableau du `README.md`. `init` copie le template
intégralement : `AGENTS.md` généré contient la section (vérifié sur un projet
temporaire). Aucun fichier `bin/lib/**` ni test touché ; `npm test` inchangé.
