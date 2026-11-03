# Spec — Story 12.04 — Le kata sur du code d'autrui

## User Value

Relire son propre code piégé est plus facile : on se souvient de ce qu'on a écrit. Ici le diff piégé porte sur du code que l'apprenant n'a pas écrit (un module de `pg-boss`, de Fastify, une source Node téléchargée), comme le code qu'une IA ou un collègue lui soumettrait.

## Requirements

- `ai-learn review --from <chemin>` : fichier ou dossier, absolu, relatif au projet ou `~/…` ; lu, jamais modifié.
- Fichiers retenus : extensions du pack détecté pour ces fichiers (JS/TS pour cette story), au plus 20 fichiers et 2 000 lignes par fichier ; `node_modules` imbriqués, fichiers minifiés (ligne > 500 caractères) et fichiers de test exclus.
- Même génération que 12.03 (défauts + leurres sur une copie) ; le diff porte des chemins relatifs à `--from`. `kata.diff` et `revue.md` dans `katas/<id>/`, avec une ligne d'en-tête « Source : <chemin> ».
- Même secret, même guard, même reveal. Le secret note `from`.
- Palier 3 de `tracks/review.json` : un kata sur code d'autrui révélé avec au moins la moitié des défauts trouvés (arrondi supérieur) et au plus 1 faux positif.
- `next` : une phase taguée `"kata": "<chemin>"` déclenche un kata dû sur ce chemin.
- README : exemples (`node_modules/pg-boss/src`, une source Node téléchargée).

## Acceptance Criteria

- [ ] Given un dossier extérieur au projet avec deux fichiers JS, when `review --from <dossier>` (générateur fixé), then `kata.diff` porte des chemins relatifs au dossier, et les fichiers du dossier sont identiques octet par octet.
- [ ] Given un dossier contenant un fichier minifié et un `node_modules` imbriqué, when `review --from`, then aucun site n'est tiré dans ces fichiers.
- [ ] Given un chemin inexistant, when `review --from /nope`, then exit 1 et rien n'est créé.
- [ ] Given un kata sur code d'autrui, 3 défauts, une revue en trouvant 2 sans faux positif, when `review --reveal`, then palier 3 atteint.
- [ ] Given une phase taguée `"kata": "node_modules/x/lib"` venant d'être prouvée, when `next --json`, then `kata.due` vaut `true` avec ce chemin.

## Edge Cases

- `--from` vers un fichier de l'apprenant (`src/**`) : accepté, mais pas de palier 3 (ce n'est pas du code d'autrui).
- Pack non détecté pour ces fichiers : refus avec la liste des extensions prises en charge.
- Gros dossier : la limite de 20 fichiers prend les fichiers les plus longs sous la limite de lignes, dans un ordre stable.

## Out of Scope

- Télécharger la source (l'apprenant la fournit, cf. « Outils à installer » des projets).
- Langages sans pack `faults` (C, Go).
