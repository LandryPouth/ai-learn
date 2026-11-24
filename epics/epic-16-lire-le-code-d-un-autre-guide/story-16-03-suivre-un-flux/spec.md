# Spec — Story 16.03 — Suivre une requête de bout en bout

## User Value

Le moment où un dépôt « clique », c'est quand on a suivi une requête (ou une commande) de l'entrée jusqu'à la réponse. L'apprenant enchaîne des arrêts en un flux ordonné, prédit chaque saut avant de l'ouvrir, et obtient une carte du code dont chaque ligne citée existe, plus une page `flux` dans son diagramme.

## Requirements

- `ai-learn tour flow add --alias <a> --name "<…>" --stops <id,id,…>` : un flux = suite ordonnée d'arrêts existants (2 au moins) ; `tour next` les parcourt dans l'ordre et, pour chaque saut, attend une prédiction `lecture` « où va l'exécution ensuite ? ».
- À la fin d'un flux, l'outil (ré)écrit `carte-du-code.md` dans le dossier de lecture : `Racine : <dépôt>`, une section par flux, chaque étape `fichier:ligne — rôle`, plus les arrêts hors flux ; marqueur généré (régénérée tant que non personnalisée). `codemap.js` la vérifie (3 citations réelles au minimum, comme 12.02).
- Le diagramme gagne une page `flux-<nom>` (ajoutée vide par l'outil) que l'apprenant dessine ; la règle « calque modifié » (16.02) s'applique à cette page pour fermer le flux.
- `tour status` : flux et pourcentage de sauts prédits au bon fichier.
- `LISEZ-MOI.md` : « Suivre un flux » ; `references/lecture.md` : choisir le flux le plus représentatif (une requête HTTP typique, la commande principale d'un CLI).
- Docs : README, `project-context.md`.

## Acceptance Criteria

- [ ] Given un flux d'un seul arrêt, when `tour flow add`, then exit 1.
- [ ] Given un flux de 3 arrêts, when `tour next --json` après le premier, then `expected` vaut `predict` avec la question du saut.
- [ ] Given un flux terminé, when on lit `carte-du-code.md`, then la section du flux liste les 3 `fichier:ligne` et `Racine :` pointe le dépôt.
- [ ] Given une carte personnalisée, when un flux se termine, then elle n'est pas réécrite.
- [ ] Given la carte générée, when `codemap` la vérifie, then toutes les citations se résolvent.
- [ ] Given un flux créé, when on lit `systeme.drawio`, then une page `flux-<nom>` vide existe.

## Edge Cases

- Un arrêt dont la ligne a bougé (dépôt mis à jour) : la carte le signale introuvable, sans bloquer.

## Out of Scope

- Tracer automatiquement l'exécution (débogueur, instrumentation) : le flux est construit par la lecture.
