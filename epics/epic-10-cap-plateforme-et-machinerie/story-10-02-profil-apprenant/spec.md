# Spec — Story 10.02 — Profil apprenant global

## User Value

L'apprenant décrit une seule fois ce qu'il vise (objectifs, temps disponible, technos à privilégier ou à différer, projets réels). Chaque parcours, proposition et exercice de transfert en tient compte, sans qu'il le redise et sans que rien de personnel n'entre dans un dépôt.

## Requirements

- `~/.ai-learn/profile.json` (v1) : `goals[]` (texte), `dailyMinutes` (entier > 0), `focus.now[]`, `focus.later[]`, `focus.avoid[]` (technos), `projects[]` (`{ name, summary }`, pour les exercices de transfert), `updatedAt`.
- Trois états comme `tutor.json` : absent (aucun blocage), invalide (erreur `check`), valide.
- Écrit uniquement par le CLI : `ai-learn profile set --json '<objet>'` (valide puis écrit) ; lu par `ai-learn profile --json`. Le guard bloque déjà l'écriture directe de `~/.ai-learn/**` par l'IA : rien à changer.
- `/learn` : profil absent → 3-5 questions, une à la fois, puis `profile set` ; profil présent → lu, jamais redemandé (l'apprenant peut dire « mets à jour mon profil »).
- `/learn-next` : lit le profil pour calibrer la taille de la session (`dailyMinutes`) et choisir l'exemple de transfert dans `projects[]`.
- `ai-learn status` affiche une ligne de profil (objectif principal, minutes/jour) ; `check` signale un profil invalide.

## Acceptance Criteria

- [x] Given aucun profil, when `ai-learn profile --json`, then la sortie vaut `{ "exists": false }` et l'exit est 0.
- [x] Given `profile set` avec un objet valide, when on relit le fichier, then il contient les champs, `version: 1` et `updatedAt`.
- [x] Given `profile set` avec `dailyMinutes: 0` ou un champ inconnu, when la commande tourne, then exit 1, message nommant le champ, fichier inchangé.
- [x] Given un profil JSON corrompu, when `ai-learn check`, then une erreur nomme `~/.ai-learn/profile.json` et sa raison.
- [x] Given un profil valide, when `ai-learn status`, then une ligne « profil : <goal[0]> · <dailyMinutes> min/jour » apparaît.
- [x] Given `commands/learn.md`, when on le lit, then il décrit la création au premier lancement (questions une à une) et l'interdiction de redemander un profil existant.
- [x] Given le dépôt, when on cherche un profil d'exemple, then il ne contient aucune donnée personnelle (exemple neutre uniquement, dans la doc du flux).

## Edge Cases

- `HOME` injectable (tests) comme `tracks/*`.
- Listes vides acceptées ; chaînes vides refusées.
- Taille raisonnable : refuser au-delà de 20 entrées par liste.

## Out of Scope

- Utiliser le profil pour choisir les paliers (10.03) ou l'analyse de pertinence (10.06).
