# Spec — Story 15.01 — Le projet a un diagramme que l'apprenant fait évoluer

## User Value

Dès `init`, le projet contient `docs/systeme.drawio` et un mode d'emploi qui dit, en une page, comment le diagramme marche : qui dessine quoi, dans quel calque, à quel moment. Sur une phase qui change la structure, l'apprenant ne peut pas prouver la phase sans avoir fait évoluer son dessin, et `next` le lui rappelle avant de commencer.

## Requirements

- `init` (et `update` s'il manque) écrit `docs/systeme.drawio` : XML non compressé, une page `contexte`, deux calques dont `apprenant` (défaut, vide) ; jamais réécrit s'il existe (invariant 8).
- `init`/`update` écrivent `docs/diagramme.md` depuis `templates/diagramme.md` (régénéré tant qu'il n'est pas personnalisé, même convention que `predictions.md`). Contenu minimal de cette story :
  - **Les calques** : `apprenant` = toi seul ; `ia-phase-N` = corrections de l'IA, une couleur, masquables (draw.io : panneau Calques, Ctrl+Maj+L) ;
  - **Le cycle d'une phase** : 1. tu dessines avant la phase, 2. la phase est prouvée, 3. l'IA corrige dans son calque, 4. tu compares en masquant/affichant, 5. tu reportes toi-même ;
  - **Ouvrir le fichier** : draw.io bureau, ou extension VS Code « Draw.io Integration » depuis WSL ; format non compressé obligatoire (comment le régler) ;
  - **Ce que l'outil vérifie** ; section « Commandes » vide que les stories suivantes complètent.
- `bin/lib/drawio.js` : lit les pages, calques et cellules (`mxCell` : id, parent, valeur sans HTML, sommet ou arête, source, cible) ; refuse un fichier compressé avec le message de réglage ; empreinte stable du calque `apprenant` (cellules triées, positions exclues : déplacer une boîte n'est pas un changement de contenu).
- Phase `diagram: true` dans `progress.json` : `verify` bloque si l'empreinte du calque `apprenant` est identique à celle enregistrée par la phase `diagram: true` prouvée précédente (ou si le calque est vide pour la première). L'empreinte est stockée dans l'évidence du run.
- `next` affiche, pour une phase `diagram: true` pas encore commencée : « Diagramme : mets à jour ton calque `apprenant` avant de commencer (docs/diagramme.md) ». `status` : ligne « diagramme : n boîtes, n flèches, dernière mise à jour phase N ».
- Docs : README (section Diagramme), `project-context.md` (ligne du tableau des mécanismes), `architecture.md` (`drawio.js`), §Diagramme d'AGENTS (l'IA ne dessine jamais avant l'apprenant).

## Acceptance Criteria

- [ ] Given un projet neuf, when `init`, then `docs/systeme.drawio` a un calque `apprenant` et `docs/diagramme.md` décrit calques, cycle et ouverture.
- [ ] Given un `systeme.drawio` existant, when `update`, then il est inchangé.
- [ ] Given un `.drawio` compressé, when `status`, then un message dit comment le décompresser et rien ne plante.
- [ ] Given une phase `diagram: true` et un calque `apprenant` vide, when `verify`, then la phase est bloquée avec la raison « diagramme ».
- [ ] Given une boîte ajoutée au calque `apprenant`, when `verify`, then la phase passe et l'évidence contient l'empreinte.
- [ ] Given une boîte seulement déplacée depuis la preuve précédente, when `verify` d'une nouvelle phase `diagram: true`, then bloquée (contenu inchangé).
- [ ] Given une phase `diagram: true` non commencée, when `next`, then le rappel du diagramme apparaît.
- [ ] Given `docs/diagramme.md` personnalisé, when `update`, then il n'est pas réécrit.

## Edge Cases

- Fichier XML invalide : warning `check`, `verify` bloque une phase `diagram: true` avec le chemin et la raison.
- Calque `apprenant` renommé : introuvable = bloqué avec un message qui nomme les calques présents.
- Phases sans `diagram` : comportement actuel, aucune lecture du fichier.

## Out of Scope

- Calque de l'IA et mur (15.02), écarts et revisite (15.03), grille (15.04).
