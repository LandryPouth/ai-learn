# Tasks — Story 09.01

- [x] Relever l'empreinte du vrai `~/.ai-learn/` (sha256 de chaque fichier) avant tout travail.
- [x] Tests rouges : filet `store.js`, `repair`, `sync`, avertissement `verify`, `check`.
- [x] `tracks/store.js` ; brancher les trois ledgers dessus.
- [x] `npm test` : corriger chaque test que le filet fait tomber (passer `home`).
- [x] `ledgers.js` + sous-commande `ledgers --repair|--sync`, branchement `update`.
- [x] Avertissement de synchronisation dans `verify` ; avertissement `check`.
- [x] `npm test`, puis comparer l'empreinte du vrai `~/.ai-learn/` : identique.
- [~] Donner à l'apprenant la commande `ai-learn ledgers --repair --dry-run`, puis `--repair`, puis `ai-learn ledgers --sync --dir <fastify>` ; consigner les sorties.
- [x] README (mécanismes), `docs/project-context.md`.
- [x] `/flow-review`.

## Status: done

## Result

**Changé**

- `bin/lib/tracks/store.js` (nouveau) : point d'écriture unique des ledgers ; sous `node --test`, refuse toute écriture sous `~/.ai-learn` du compte réel (`os.userInfo().homedir`, symlinks résolus) avec `ELEDGER_REAL_HOME` ; n'écrit pas quand seuls les horodatages changeraient.
- `tracks/git.js`, `tracks/tests.js`, `tracks/domain.js` : écrivent via `store.js` ; git dédoublonne ses évidences par (projet, phase, type).
- `bin/lib/ledgers.js` (nouveau) : `repairLedgers` (projets disparus retirés, tiers recalculés à la baisse, `.bak-*`, `--dry-run`, ledger illisible jamais réécrit), `syncProjectLedgers`, `missingFromLedgers`, `projectKey`, `ledgersCommand`.
- `verify.js` : les trois `catch {}` deviennent « ⚠ ledger <nom> non mis à jour : <code> (<chemin>) — relancer `ai-learn ledgers --sync` hors bac à sable » ; la phase reste `done`.
- `check.js` : avertissement « progression absente des ledgers » pour un projet prouvé inconnu d'un ledger.
- `update.js` : synchronise les projets absents des ledgers, sans interrompre les autres projets en cas d'erreur.
- `bin/ai-learn.js` : sous-commande `ledgers` (machinerie), arguments inconnus refusés.
- `test/helpers.js` : `HOME`/`USERPROFILE` jetables par processus de test. Tests : `test/ledgers.test.js` (nouveau), `verify.test.js`, `mode.test.js`, `check.test.js` (2 tests passent un home isolé).
- README, `docs/project-context.md`, `docs/DOGFOODING.md` (récidive du verrou périmé de la 08.03).

**Validation**

- `npm test` : 828/828.
- Home réel intact (critère 2, vérification manuelle) : empreinte sha256 de chaque fichier de `~/.ai-learn` relevée avant le travail, comparée après chaque `npm test` complet : identique. Un traçage temporaire (`--require`, hors dépôt) a compté 318 refus `ELEDGER_REAL_HOME` avant l'isolation de `helpers.js`, 0 après.
- Rouge→vert démontré : filet coupé → test du filet rouge ; avertissement supprimé → test `verify` rouge ; recalcul supprimé → tests repair et dirigeant rouges ; écriture conditionnée aux seuls projets retirés → test « tier sans preuve » rouge.
- Incident pendant la démonstration : filet coupé, la première version du test du filet a écrit `~/.ai-learn/tracks/store-guard-probe.json` (19 octets) ; fichier mis à la corbeille, empreinte revérifiée identique, test réécrit pour ne viser qu'un home de substitution.
- Revue indépendante (sous-agent, STRICT) : 1 bloquant (repair n'écrivait pas un tier remis à zéro sans projet disparu), 3 majeurs (clé de projet non normalisée, rejeu trop permissif, coût d'`update`) et 8 mineurs ; tous corrigés sauf ceux listés en risques.

**Simulation sur la machine de l'apprenant** (`ledgersCommand({ repair: true, dryRun: true })`, lecture seule) : `tracks/git.json` 1196 projets disparus, `tracks/tests.json` 30, `domains/generic.json` 370, `domains/javascript.json` 33 — aucun projet réel. Tiers 1, 2 et 6 de `tests.json` restent atteints : ils reposent sur 10 dossiers `/tmp/ai-learn-test-*` encore présents (5 262 dossiers `/tmp/ai-learn-*` laissés par les tests).

**À faire par l'apprenant** (non lancé, hors périmètre) : vider `/tmp/ai-learn-*` (ou redémarrer WSL), puis `ai-learn ledgers --repair --dry-run`, `ai-learn ledgers --repair`, `ai-learn ledgers --sync --dir ~/dev/learning/tech-experiments/fastify-traducteur-api`.

**Après `/flow-review` (2026-10-30, pass, 2 P2 + 2 P3, tous corrigés)**

- Ledger illisible jamais écrasé : `writeLedgerFile` reçoit le validateur du ledger et refuse (`ELEDGER_UNREADABLE`) d'écrire par-dessus un fichier existant illisible — `verify`, `--sync` et `update` le signalent au lieu d'effacer la progression. `check` et `update` distinguent « ledger illisible » de « projet absent » (`ledgerHealth`).
- Orthographes fusionnées : `projectKey` passe dans `store.js` ; `canonicalizeProjects` réécrit chaque projet d'un ledger à sa clé et fusionne les doublons (casse Windows, lien symbolique) à chaque sync et avant `repair`, qui affiche le nombre de fusions. Un même projet ne compte plus deux fois pour le tier 6.
- `check` n'avertit que si `--sync` a quelque chose à rejouer (`hasReplayableEvidence`).
- Tests : `ledgers.test.js` (+4), `update.test.js` (+2) ; chaque correctif retiré fait tomber son test (vérifié).

**Risques restants**

- Les tests ne suppriment pas leurs dossiers temporaires (`mkdtemp`) : tant qu'ils existent, `repair` garde les entrées qui y pointent.
- Une évidence écrite à la main dans `.ai-learn/runs/` est lue par `--sync` comme par `verify` (guard actif = protégé).
- `check` ne distingue pas un `~/.ai-learn` illisible d'un absent (avertissement en bac à sable) ; `detectDomainKey` parcourt les sources des projets prouvés à chaque `check`.
- Pas de test sentinelle automatisé du home réel (ordre des fichiers non garanti par `node --test`) : la preuve est le filet + l'empreinte consignée.

### Rollback Notes

`git revert` du commit de la story. Aucune migration : format des ledgers inchangé (v1). Les `.bak-*` créés par un `--repair` restaurent un ledger (`cp <fichier>.bak-<horodatage> <fichier>`).
