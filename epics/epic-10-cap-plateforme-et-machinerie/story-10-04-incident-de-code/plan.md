# Plan — Story 10.04

## Implementation Context

Fichiers probables :

- bin/lib/incident.js (nouveau : `breakCommand`, `resolve`, `giveup`, sélection du site)
- bin/lib/mutate.js (exporter ce qui manque, sans changer son comportement)
- bin/lib/tracks/debug.js (nouveau, calqué sur `tracks/git.js`)
- bin/lib/predictions.js (`PREDICTION_TYPES` + `debug`, champs `file`/`line`)
- bin/lib/guard.js (chemin protégé `~/.ai-learn/incidents/**` ; matcher du hook étendu à `Read|Grep|Glob` pour ce seul chemin)
- bin/lib/next.js, bin/lib/status.js, bin/lib/check.js (incident actif, ledger)
- bin/ai-learn.js (sous-commande `break`)
- commands/learn-break.md (nouveau), commands/learn-next.md
- templates/AGENTS-apprentissage.md (§3sexies)
- README.md (mécanisme + limite `git diff`), docs/project-context.md, docs/plans/pistes-non-mesurees.md (Partie A : promue, renvoi vers l'epic 10)
- test/incident.test.js, test/tracks-debug.test.js (nouveaux), test/guard.test.js, test/predictions.test.js

Ancres : `findAllSites`, `applyMutant`, `restoreOriginal`, `mutateLockPath`, `recoverOrphanLock`, `PROTECTED_DIRS`, `PREDICTION_TYPES`, `uncommittedCount`, `ensureGuardHook`

Mode : `STRICT` (écriture dans `src/**` de l'apprenant, restauration, extension du guard) · scout pre-step : `no`

À éviter : la grammaire shell de `guard.js` (on ajoute un chemin, pas une règle de parsing) ; `scan.js`.

## Decisions

- **Réutiliser `mutate`, ne pas réécrire** : même backup, même verrou, même réparation au démarrage. Une seule façon de toucher `src/**` côté outil.
- **Détectabilité prouvée, pas supposée** : le site est gardé seulement si un checkpoint tombe réellement après injection.
- **Niveau 2 vérifié mécaniquement** : absence du chemin du fichier dans la sortie capturée du checkpoint.
- **Secret hors projet** : le record vit dans `~/.ai-learn/incidents/`, jamais commité, jamais dans le dépôt de l'apprenant. Le guard ferme `Read`/`Grep`/`Glob` (mur) ; Bash reste une haie, écrit au README.
- **Prédiction `debug` = nouveau type**, compté comme les autres ; la comparaison se fait sur la **dernière** prédiction `debug` enregistrée après `startedAt` et avant `--resolve`.
- **Promotion de la Partie A sans les trois entrées de friction** : décision utilisateur (voir index de l'epic). Ajouter une ligne `docs/DOGFOODING.md` si un palier n'est jamais atteint après trois incidents réels.

## Test Plan

Rouge d'abord, sur projets temporaires avec `git init` et checkpoints `node --test` : préconditions (arbre sale, pas de phase done, dirigeant, incident actif) ; injection avec générateur fixé ; aucun site détectable → restauration octet par octet ; niveau 2 ; resolve vert/rouge ; comparaison exact/fichier/manqué ; giveup ; verrou orphelin ; guard Read refusé ; `next --json` ; ledger corrompu jamais écrasé.

## Acceptance Traceability

| Critère | Preuve |
|---|---|
| arbre sale | test/incident.test.js::break refuses a dirty git tree |
| injection | test/incident.test.js::break injects one detectable fault and keeps the site secret |
| aucun site | test/incident.test.js::no detectable site restores every file byte for byte |
| niveau 2 | test/incident.test.js::level 2 fault file is absent from the failing output |
| resolve | test/incident.test.js::resolve closes a repaired incident and reaches tier 1 |
| exact | test/incident.test.js::a debug prediction within two lines is exact and reaches tier 3 |
| giveup | test/incident.test.js::giveup restores the original and saves the learner version |
| guard | test/guard.test.js::Read on the incidents store is denied |
| verrou | test/incident.test.js::an orphan lock is repaired on the next command |
| next | test/incident.test.js::next reports an active incident before the next phase |

## Commands

```
npm test
```
