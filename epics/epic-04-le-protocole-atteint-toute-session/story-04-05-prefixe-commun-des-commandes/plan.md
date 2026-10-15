# Plan — Story 04.05

## Implementation Context

Fichiers probables :

- bin/lib/platforms/commands.js
- bin/lib/platforms/ensure.js (`MARKER_FILE`)
- bin/lib/install.js
- commands/*.md
- README.md
- test/install.test.js
- test/platforms.test.js

Ancres de recherche : `INSTALLERS`, `MARKER_FILE`, `commands/`

Mode d'exécution : `STANDARD`

Scout pre-step : `no` — les points d'intégration sont nommés ci-dessus.

À éviter sauf nécessité : bin/lib/guard.js, templates/AGENTS-apprentissage.md hors tableau des commandes

## Decisions

- Décision à prendre : renommage **additif d'abord** — l'ancien nom n'est retiré qu'à une version majeure ultérieure, hors de cette story (point du journal : « renommage cassant, à valider séparément »).
- Décision à prendre : le marqueur d'installation devient un des nouveaux noms ; un ancien marqueur seul déclenche la réinstallation silencieuse déjà prévue par `ensure.js`.

## Test Plan

- [ ] Unit : liste de commandes par plateforme.
- [ ] Intégration : `update` sur un projet pré-existant ne perd aucun ancien nom.

## Acceptance Traceability

| Acceptance criterion | Test proving it |
| --- | --- |
| Given une installation fraîche, when on liste les commandes de la plat… | `Unit : liste de commandes par plateforme.` (à nommer `file::test` au `/flow-run`) |
| Given un projet déjà installé avec les anciens noms, when `ai-learn up… | `Intégration : `update` sur un projet pré-existant ne perd au` (à nommer `file::test` au `/flow-run`) |
| Given le README, when on le lit, then le tableau de commandes donne le… | `Intégration : `update` sur un projet pré-existant ne perd au` (à nommer `file::test` au `/flow-run`) |
| Given `ai-learn check`, when seuls les anciens noms existent, then c'e… | `Intégration : `update` sur un projet pré-existant ne perd au` (à nommer `file::test` au `/flow-run`) |

## Commands

- Command: `npm test`
  - Expected: la suite complète passe.

## Rollback

Revert du commit de la story ; aucune migration de données hors champs additifs.
