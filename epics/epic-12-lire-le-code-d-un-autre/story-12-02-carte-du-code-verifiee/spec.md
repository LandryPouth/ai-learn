# Spec — Story 12.02 — Une carte du code dont chaque citation existe

## User Value

La « carte du code » que l'apprenant rédige en lisant Node, Fastify, Nest, `pg-boss` ou Prometheus devient une preuve : chaque `fichier:ligne` qu'il cite est vérifié contre la source. Une carte recopiée d'une réponse d'IA, avec des lignes inventées, ne passe plus.

## Requirements

- Tout artefact de phase dont le nom correspond à `docs/carte-du-code*.md` est une carte.
- La carte déclare sa racine sur une ligne `Racine : <chemin>` (absolu, relatif au projet, ou `~/…`), éventuellement plusieurs lignes pour plusieurs sources ; chaque citation est résolue contre la première racine où le fichier existe.
- `check`, pour une carte d'une phase `done` :
  - erreur si aucune ligne `Racine :` ;
  - erreur si moins de 3 citations réelles (contrat présence + substance, comme `reviews.js`) ;
  - erreur par citation qui ne résout pas (fichier absent ou ligne au-delà de la fin), avec la citation nommée ;
  - avertissement, pas erreur, si la racine est absente de la machine (« citations non vérifiées ici ») : la carte reste valable sur une autre machine.
- Pour une phase pas encore `done` : avertissements seulement (le travail est en cours, cf. epic 01).
- `--json` de `check` porte le détail par carte (racine, citations valides, invalides).

## Acceptance Criteria

- [x] Given une phase `done` dont la carte cite `lib/route.js:12`, `lib/reply.js:40`, `lib/hooks.js:3`, tous réels sous la racine, when `check`, then aucune erreur pour cette carte.
- [x] Given la même carte avec `lib/route.js:99999`, when `check`, then une erreur nomme `lib/route.js:99999`.
- [x] Given une carte sans ligne `Racine :`, when `check`, then erreur « racine non déclarée ».
- [x] Given une carte avec 2 citations réelles seulement, when `check`, then erreur « au moins 3 citations ».
- [x] Given une racine absente de la machine, when `check`, then avertissement et aucune erreur pour cette carte.
- [x] Given une phase en cours avec une carte invalide, when `check`, then avertissement, pas d'erreur.
- [x] Given une citation qui sort de la racine (`../x.js:1` ou lien symbolique), when `check`, then elle est comptée invalide.

## Edge Cases

- Citations dans un bloc de code de la carte : comptées (une carte cite souvent dans des blocs).
- Même citation répétée : comptée une fois pour le minimum.
- Plusieurs cartes dans une phase : chacune vérifiée séparément.

## Out of Scope

- Juger si la citation est pertinente pour le mécanisme décrit.
- Télécharger la source manquante.
