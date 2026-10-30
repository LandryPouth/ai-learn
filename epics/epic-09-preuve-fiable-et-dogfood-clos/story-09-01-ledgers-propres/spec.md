# Spec — Story 09.01 — Ledgers cross-projet propres

## User Value

`~/.ai-learn/` raconte la vraie progression de l'apprenant, projet après projet : ses phases prouvées y figurent, aucun projet de test n'y entre, et une synchronisation ratée se voit au lieu de disparaître. Le mode `dirigeant` n'est plus déverrouillable par la suite de tests du mainteneur.

## Requirements

- **Isolation des tests** : aucun test de la suite n'écrit dans le home réel. Toute écriture de ledger (`tracks/git.js`, `tracks/tests.js`, `tracks/domain.js`, futur `tracks/*`) passe par un point unique qui, si `process.env.NODE_TEST_CONTEXT` est défini et que le home cible est `os.userInfo().homedir`, **lève une erreur** nommant le fichier.
- **Échec de synchronisation visible** : `verify` remplace ses `catch {}` par un avertissement : « ledger <nom> non mis à jour : <code> (<chemin>) — relancer `ai-learn ledgers --sync` hors bac à sable ». La phase reste `done` (la synchronisation ne conditionne pas la preuve).
- **`ai-learn ledgers --repair [--dry-run]`** (machinerie) : retire des ledgers les projets dont le dossier n'existe plus ; recalcule chaque tier à partir des preuves restantes (un tier sans preuve redevient non atteint) ; sauvegarde chaque fichier modifié en `<fichier>.bak-<horodatage>` avant écriture ; affiche le décompte retiré par fichier.
- **`ai-learn ledgers --sync [--dir]`** (machinerie) : rejoue les preuves passantes d'un projet (`.ai-learn/runs/*-verify.json`, ordre chronologique) dans les trois synchronisations ; idempotent.
- `ai-learn update` lance `--sync` sur le projet courant.
- `check` : un projet avec au moins une phase `done` prouvée mais absent de `tracks/git.json`, `tracks/tests.json` et du ledger de domaine → avertissement « progression absente des ledgers — `ai-learn ledgers --sync` ».

## Acceptance Criteria

- [ ] Given `NODE_TEST_CONTEXT` défini et un home égal à `os.userInfo().homedir`, when un ledger est écrit, then une erreur nomme le fichier et rien n'est écrit.
- [ ] Given la suite complète, when `npm test` tourne, then aucun fichier sous le vrai `~/.ai-learn/` n'a changé (empreintes avant/après comparées par un test sentinelle qui s'exécute en dernier, ou par la vérification manuelle consignée dans le Result).
- [ ] Given un ledger dont la synchronisation lève `EACCES`, when `verify` passe, then la phase est `done` et la sortie contient « ledger … non mis à jour » avec le code d'erreur.
- [ ] Given un `tests.json` dont les tiers 1, 2, 6 ne reposent que sur des projets disparus, when `ledgers --repair`, then ces tiers redeviennent non atteints, un `.bak-*` existe, et le décompte des projets retirés est affiché.
- [ ] Given `--dry-run`, when `ledgers --repair`, then aucun fichier n'est modifié et la sortie liste ce qui serait retiré.
- [ ] Given un projet avec 3 phases prouvées absent des ledgers, when `ledgers --sync`, then il apparaît dans les trois ledgers ; relancé, rien ne change (idempotent).
- [ ] Given ce même projet avant `--sync`, when `check`, then l'avertissement « progression absente des ledgers » apparaît ; après, il disparaît.
- [ ] Given `mode dirigeant` après `--repair` sur un ledger sans preuve réelle, when il tourne, then il refuse (tiers non atteints).

## Edge Cases

- Ledger corrompu : `--repair` refuse de le réécrire et le nomme (pas d'écrasement d'un fichier qu'on ne sait pas lire).
- Projet dont le dossier existe mais sans `.ai-learn/runs` : gardé (on ne retire que ce qui a disparu).
- Windows : `os.userInfo().homedir` et `USERPROFILE` — même règle.
- Un apprenant qui travaille vraiment sous `/tmp` : rien ne l'exclut ; seul le dossier disparu est retiré.

## Out of Scope

- Lancer `--repair` sur la machine de l'utilisateur : l'apprenant le fait (consigné au Result avec la sortie `--dry-run` d'abord).
- Le ledger plateforme/debug de l'epic 10 : il héritera du point d'écriture unique.
