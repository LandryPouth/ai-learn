# Story 08.03 — Commandes `/learn-*` en skills `SKILL.md`

## Goal

`ai-learn install <plateforme>` livre les commandes sous forme de skills `<nom>/SKILL.md` pour toutes les plateformes qui les lisent, avec une seule source, et retire proprement les anciens fichiers de commande qu'il avait écrits.

## Risk

Écrit dans le répertoire personnel de l'utilisateur (`~/.claude`, `~/.config/opencode`, `~/.codex`) et retire d'anciens fichiers : ne supprimer que ce qu'`ai-learn` a écrit et que l'utilisateur n'a pas modifié.

## Acceptance Criteria

- [x] Given `commands/*.md`, when `install claude` et `install opencode` tournent, then chaque commande existe en `<dir>/<nom>/SKILL.md` avec un frontmatter `name` et `description` valide ; un test parse tous les frontmatters avec un parseur strict.
- [x] Given OpenCode 1.19.x présent, when `opencode debug skill` est lancé après l'install, then chaque skill `learn-*` est listé (test d'intégration qui s'ignore sans `opencode`).
- [x] Given d'anciens fichiers de commande écrits par `ai-learn` (non modifiés), when l'install tourne, then ils sont retirés et le résultat le dit ; un fichier modifié par l'utilisateur est conservé et nommé.
- [x] Given les alias historiques (`/next`, `/status`…), when l'install tourne, then chaque ancien nom a une équivalence ou une dépréciation explicite ; aucun nom n'est supprimé en silence.
- [x] Given Codex, Gemini CLI et Antigravity, when la story se termine, then chaque plateforme est soit migrée vers `SKILL.md` avec la preuve de son emplacement de lecture, soit laissée à son format actuel avec la raison écrite dans le README.
- [x] Given l'installation faite deux fois, when elle tourne la seconde, then rien ne change (idempotence).
- [x] Given Windows sans Developer Mode, when un lien symbolique est refusé (`EPERM`), then la copie de repli continue de fonctionner.

## Edge Cases

- [x] Un skill et une ancienne commande de même nom dans le même répertoire : le skill gagne, l'ancienne commande est traitée selon la règle de retrait.
- [x] `--dry-run` n'écrit ni ne supprime rien.
- [x] Frontmatter avec deux-points dans la description : quoté (un bug identique a déjà cassé Antigravity).

## Out of Scope

- Modifier le contenu pédagogique des commandes.
- Garde, hook, `norm`.
