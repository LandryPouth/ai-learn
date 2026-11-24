# Spec — Story 15.04 — Découper un système en boîtes et l'expliquer

## User Value

L'apprenant apprend à découper : une responsabilité par boîte, des flèches qui disent ce qui circule, des frontières visibles, un chemin d'erreur, sept boîtes au plus par vue et un niveau de zoom de plus quand il en faut davantage. Puis il explique son diagramme comme à un junior, noté sur cette même grille. C'est la compétence qui sert pour concevoir et pour transmettre.

## Requirements

- `ai-learn diagram lint [--json]` (lecture seule, aussi lancé par `status` et `check` en warnings) sur le calque `apprenant` :
  - plus de 7 boîtes sur une page → « ajoute un niveau de zoom (page) » ;
  - flèche sans libellé → « dis ce qui circule » ;
  - pages attendues par niveau C4 dès qu'il y en a plus d'une : `contexte`, `conteneurs`, `composants` (noms libres acceptés, l'ordre suggéré) ;
  - aucune flèche marquée erreur (libellé ou style contenant `erreur`, `error`, `4xx`, `5xx`, `échec`) → « dessine le chemin d'erreur ».
  - **écart avec le code** : les fichiers sources (`walkSources` de `scan.js`) les plus requis par les autres (compte des `require`/`import` relatifs qui les visent, heuristique par regex, JS/TS seulement) ; si un fichier requis par 5 autres ou plus n'a aucune boîte dont le libellé normalisé contient son nom de base (sans extension) ou celui de son dossier, avertissement « ton schéma ne montre pas `store.js`, que 9 fichiers importent ». 3 avertissements de ce type au plus, les plus importés d'abord.
  Jamais bloquant (invariant 6).
- Type de prédiction `explication` : l'apprenant explique son diagramme (texte, 10 phrases au plus) ; au reveal, l'IA note la grille en 5 critères booléens (`--rubric responsabilite,fleches,frontieres,erreur,zoom` = les critères remplis) en plus de la note ; `predictionsRequired: { explication: 1 }` possible.
- `status` : ligne « découpage : avertissements du lint » ; bilan : grille de la dernière explication.
- **Mode d'emploi** complété : « La grille de découpage » (les 5 critères, avec un exemple neutre hors sujet), « Les niveaux de zoom » (une page par niveau), « Expliquer ton diagramme ».
- Docs : README, `project-context.md`, AGENTS (§Diagramme : poser l'exercice d'explication après un reveal, noter sur la grille), `docs/pedagogie.md` si présent.

## Acceptance Criteria

- [ ] Given une page de 9 boîtes, when `diagram lint`, then un avertissement « niveau de zoom » nomme la page.
- [ ] Given une flèche sans libellé, when `diagram lint`, then un avertissement la nomme par ses extrémités.
- [ ] Given aucune flèche d'erreur, when `diagram lint`, then l'avertissement « chemin d'erreur ».
- [ ] Given un fichier `src/store.js` importé par 6 fichiers et aucune boîte « store », when `diagram lint`, then un avertissement nomme `store.js` et « 6 fichiers » ; given une boîte « Store (persistance) », then plus d'avertissement.
- [ ] Given des avertissements de lint, when `verify` d'une phase `diagram: true` au calque modifié, then la phase passe.
- [ ] Given `--rubric responsabilite,inconnu`, when `predict --reveal` d'une `explication`, then exit 1.
- [ ] Given une explication révélée avec 4 critères, when `status`, then la grille apparaît.
- [ ] Given `init`, when on lit `docs/diagramme.md`, then la grille et les niveaux de zoom y sont.

## Edge Cases

- Conteneur draw.io (groupe, swimlane) : compte pour une boîte, ses enfants comptent sur la page.
- Texte libre sans bordure : ignoré par le compte de boîtes.
- Projet sans fichier JS/TS ou sans import relatif : pas d'avertissement « écart avec le code », jamais d'erreur.

## Out of Scope

- Juger automatiquement la qualité d'une responsabilité : critère noté par l'IA, visible, non prouvé.
