# Tasks — Story 10.03

- [x] Tests rouges (ledger, verify, check, status, propose).
- [x] `tracks/platform.js` + branchement `verify` / `status` / `check` / `progress`.
- [x] Banque `propose` : `platformTiers` sur les projets existants, 6 projets plateforme, ressources ouvertes et vérifiées une par une.
- [x] `learn.md` + `references/propose.md`.
- [x] README, `docs/project-context.md`.
- [x] `npm test` ; `/flow-review` non lancé (STANDARD, opt-in).

## Status: done

## Result

- `bin/lib/tracks/platform.js` (nouveau) : ledger v1, 7 paliers, `syncPlatformTrack` (seul un `verify` vert d'une phase taguée marque un palier ; un ledger corrompu n'est jamais écrasé), `missingPlatformTiers`.
- `ledgers.js` : synchro à côté de git/domaine/tests, `--repair` (palier abaissé quand la preuve a disparu), `ledgerHealth` (illisible signalé ; absence normale).
- `progress.js` : `platformTier` hors 1-7 = erreur nommant la phase. `check.js` : ledger plateforme corrompu = erreur. `status.js` : « plateforme : n/7 » + paliers restants.
- `propose.js` : `platformTiers` sur les 10 projets existants, 6 nouveaux projets (task-queue, graceful-shutdown, observability, rate-limiter, reverse-proxy, ci-pipeline), classement par paliers manquants couverts (sans ledger ou ledger corrompu : ordre inchangé). Les projets d'infrastructure listent toutes les stacks de la banque plutôt que `null`, pour que `--stack inconnue` reste vide.
- Ressources : les 17 URLs des nouveaux projets ont été ouvertes (HTTP 200) pendant le run ; ancres de section uniquement sur des RFC (`#section-N`).
- `learn.md` (section paliers : 1-2 phases max, checkpoint qui exécute le thème), `references/propose.md`, README, `docs/project-context.md`.
- Tests : `test/tracks-platform.test.js` (nouveau), ajouts à `check`, `status`, `propose`, `commands`. `propose.test.js` isole `HOME` (le ledger réel de l'apprenant ne doit pas réordonner les tests) et les deux tests de filtre passent à `limit: 20` : la banque a grandi.
- Négatif démontré : retirer le test `ok` du sync, le tri par paliers ou la borne 7 fait échouer le test gardien.
- Placement : `ai-flow worktree place` a refusé l'arbre de dépendances (même cas que 10.01/10.02, ligne ajoutée à `docs/DOGFOODING.md`) ; exécuté dans le checkout principal.
- Pas de bump de version : `package.json` est déjà à 0.5.0 pour l'epic 10.

### Rollback Notes
