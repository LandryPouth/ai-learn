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

- Renommage **additif d'abord** — l'ancien nom n'est retiré qu'à une version majeure ultérieure, hors de cette story (point du journal : « renommage cassant, à valider séparément »). Les alias sont **dérivés** du corps canonique dans `bin/lib/platforms/commands.js#listCommands` : une seule source sur disque, donc aucune dérive possible entre `/next` et `/learn-next`.
- `MARKER_FILE` pointe sur un nom nouveau (`learn-next.*`) ; une installation qui n'a que l'ancien marqueur lit donc comme « non installée » et déclenche la réinstallation additive déjà prévue par `ensure.js`. `LEGACY_MARKER_FILE` existe à part uniquement pour que `check` nomme l'état de migration (warning, jamais erreur).
- Sur Claude Code, les commandes canoniques restent des symlinks vers `commands/`, mais un alias est un **fichier généré** : un ancien symlink cassé est d'abord `unlink`é, jamais écrit au travers (écrire au travers recréerait `commands/next.md` dans le dépôt).

## Test Plan

- [ ] Unit : liste de commandes par plateforme.
- [ ] Intégration : `update` sur un projet pré-existant ne perd aucun ancien nom.

## Acceptance Traceability

| Acceptance criterion | Test proving it |
| --- | --- |
| Given une installation fraîche, when on liste les commandes de la plat… | `test/install.test.js::install codex writes one prompt file per command, no guard/hook wiring` (+ `test/platforms.test.js::install gemini writes one namespaced .toml per command`) |
| Given un projet déjà installé avec les anciens noms, when `ai-learn up… | `test/update.test.js::update --platform rewrites a pre-04.05 install with the new names, keeping old names as aliases` |
| Given le README, when on le lit, then le tableau de commandes donne le… | `test/install.test.js::README documents the /learn-* names and their legacy aliases` |
| Given `ai-learn check`, when seuls les anciens noms existent, then c'e… | `test/check.test.js::check reports a legacy-only command install as a migration warning, never an error` |

## Commands

- Command: `npm test`
  - Expected: la suite complète passe.

## Rollback

Revert du commit de la story ; aucune migration de données hors champs additifs.
