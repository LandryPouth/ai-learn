# Tasks — Story 12.03

- [x] Relire `incident.js` (secret, état public, tirage une fois par preuve), `guard.js` (`PROTECTED_DIRS`), `tracks/debug.js`.
- [x] Tests rouges (voir plan).
- [x] `faults.js` : tirage en mémoire de K défauts et M leurres.
- [x] `review.js` : génération, diff unifié, secret, reveal, giveup.
- [x] `tracks/review.js` + `ledgers.js` ; `.gitignore` du scaffold.
- [x] Guard : écriture interdite sur `katas/**`, lecture fermée pendant un kata actif.
- [x] `next`/`status`/`progress` (tag `kata`), CLI.
- [x] AGENTS (section kata), README, `docs/project-context.md`.
- [x] `npm test`.
- [x] `/flow-review` (STRICT, sous-agent indépendant) : findings corrigés.

## Status: done

## Result

- `review.js` (nouveau) : génération sur copie, diff unifié, secret `~/.ai-learn/katas/`, état public `.ai-learn/kata.json`, `--reveal` (rapprochement ±1, leurres signalés), `--giveup`, `kataDue` (une fois par preuve, marqueur `~/.ai-learn/kata-offers/`). `tracks/review.js` (nouveau) : ledger 2 paliers + `katas` idempotent par id. Guard : `katas` en dossier protégé (écriture), lecture fermée tant que `kata.json` est actif (dossier `katas/` projet sans la racine, secret du home avec ses ancêtres), Bash qui nomme `katas/` ou lance `review --reveal|--giveup` refusé. `next`/`status` (`kata`, ligne « revue »), tag de phase `kata` validé, `.gitignore` du scaffold, `break` refusé pendant un kata. Version 0.6.12 (scaffold : AGENTS, .gitignore).
- Revue indépendante (sous-agent, STRICT) : P0 `kata.json` non protégé (corrigé, `PROTECTED_FILES`) ; P1 contournements Bash/Grep (regex `\bkatas\b` insensible à la casse, `kat*`, `lib/review`, `glob`, Grep sans chemin ou sur la racine refusés), appariement des leurres (deux passes, exact d'abord, préfixe `a/` `b/`), sortie imprimée avant le refus du ledger (ordre : ledger, clôture, `corrige.md`, affichage), palier 2 exigeant ≥ 2 leurres, `--giveup` sans secret, `kata.due` refusé en dirigeant et derrière un incident dû, diff sans retour à la ligne final, K et M tirés dans une plage par défaut (2-4, 3-6), `ledgers --repair` branché. Écart de spec : plages par défaut au lieu de 3 et 4 ; `--sync` sans objet (un kata ne se rejoue pas). Limites assumées : `trash`/`rm` sur `kata.json` hors grammaire du guard (comme `incident.json`) ; mur par projet ; défauts tirés de tous les fichiers d'implémentation.
- Écarts assumés : le tirage vit dans `review.js` (pas `faults.js`) ; le test « kata dû » s'appuie sur une preuve écrite à la main dans `.ai-learn/runs`.

### Rollback Notes
