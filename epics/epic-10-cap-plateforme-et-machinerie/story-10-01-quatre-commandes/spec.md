# Spec — Story 10.01 — Quatre commandes, le reste en machinerie

## User Value

L'apprenant ne retient que `/learn`, `/learn-next`, `/learn-status` (et `/learn-break`, ajouté en 10.04). Analyse d'un projet existant, proposition de projet, contrôle de cohérence et gestion des docs se font sans qu'il ait à les connaître.

## Requirements

- `commands/` ne contient plus que `learn.md`, `learn-next.md`, `learn-status.md`.
- Le contenu de `learn-scan.md`, `learn-propose.md`, `learn-check.md`, `learn-docs.md` devient `commands/references/{scan,propose,check,docs}.md`, installé dans le dossier du skill `learn` (`learn/references/*.md`) sur chaque plateforme.
- `/learn` route seul : pas de projet → profil (10.02) puis proposition si l'apprenant n'a pas d'idée ; projet existant sans `progress.json` → scan ; parcours existant → reprise. Il appelle `ai-learn check` et `ai-learn docs` lui-même quand il en a besoin.
- `/learn-next` lance `ai-learn check` en silence et ne parle à l'apprenant que s'il y a une erreur.
- Plus aucun alias (`/status`, `/next`, `/scan`, `/propose`, `/check`, `/docs`) ni skill `learn-scan|learn-propose|learn-check|learn-docs` n'est installé.
- `ai-learn install`/`update` retirent ces skills déjà installés **seulement** si leur contenu est byte-identique à une version qu'`ai-learn` a publiée ; sinon conservés et nommés dans la sortie.
- Le CLI garde toutes ses sous-commandes (`scan`, `propose`, `check`, `docs`) : seule la surface `/…` change.

## Acceptance Criteria

- [x] Given `ai-learn install claude` sur un home vierge, when on liste `~/.claude/skills/`, then seuls `learn`, `learn-next`, `learn-status` existent, et `learn/references/` contient `scan.md`, `propose.md`, `check.md`, `docs.md`.
- [x] Given un home où une install précédente a posé `learn-scan`, `scan`, `check`… non modifiés, when `ai-learn install claude` tourne, then ils sont retirés et listés sous « retirés ».
- [x] Given un de ces skills modifié par l'utilisateur, when `install` tourne, then il est conservé et nommé « conservé (modifié) » ; rien n'est supprimé en silence.
- [x] Given un skill utilisateur sans rapport portant le nom `check`, when `install` tourne, then il n'est pas touché.
- [x] Given `--dry-run`, when `install` tourne, then la sortie liste les retraits prévus et le disque est inchangé.
- [~] Given les 5 plateformes, when chacune est installée, then chacune reçoit les trois skills et le dossier `references/` à l'emplacement de lecture déjà prouvé en 08.03.
- [x] Given `commands/learn.md`, when on le lit, then il renvoie vers `references/<flux>.md` pour scan/propose/check/docs et ne demande jamais à l'apprenant de taper une commande `ai-learn`.
- [x] Given le README et `templates/AGENTS-apprentissage.md` (section Commandes), when on les lit, then seules les commandes visibles y sont listées comme commandes de l'apprenant.

## Edge Cases

- Retrait : symlink utilisateur jamais traversé ni supprimé (contrat 08.03) ; dossier de skill vide supprimé seulement s'il ne contient plus rien.
- Plateforme qui ne lit pas les fichiers à côté de `SKILL.md` : repli décidé dans le plan (références inlinées).
- Projets déjà scaffoldés : leur `AGENTS.md` cite d'anciennes commandes ; `ai-learn update` le régénère (comportement existant).

## Deferred Criteria

- « 5 plateformes » : lecture de `references/` prouvée pour Gemini et OpenCode seulement. Codex et Antigravity restent à prouver (suivi : preuve de lecture, ou repli références inlinées si elle échoue).

## Out of Scope

- Ajouter `/learn-break` (10.04).
- Renommer ou supprimer une sous-commande du CLI.
