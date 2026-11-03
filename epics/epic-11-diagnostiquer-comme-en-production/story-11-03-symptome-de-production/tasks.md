# Tasks — Story 11.03

- [x] Relire `incident.js` (`chooseLevel`, `trial`, affichage) et `exec.js#runCommand` (délai, arrêt).
- [x] Tests rouges (voir plan).
- [x] `tutor.js` : deux champs validés.
- [x] `incident.js` : référence, double détectabilité, normalisation, affichage, état public sans phases.
- [x] `tracks/debug.js` : palier 5 optionnel ; `chooseLevel` étendu.
- [x] `next`/`status` : texte du niveau 4 ; usage CLI.
- [x] §3sexies, `commands/learn-break.md`, README (exemple de script de symptôme).
- [x] `npm test`, puis `/flow-review` (STRICT).

## Status: done

## Result

- `tutor.js` : `symptomCommand`/`symptomTimeoutMs` validés, `symptomSetting`.
- `incident.js` : `referenceSymptom`, `normalizeSymptom`, double détectabilité dans `keepDetectableSite`, affichage du seul symptôme, `failingPhases` vide, palier 5, `chooseLevel` étendu (dir, random).
- `tracks/debug.js` : palier 5 optionnel. Docs : README, AGENTS §3sexies, `learn-break.md`, usage CLI.
- Revue STRICT indépendante (sous-agent) : tour 1 fail (1 P1 référence non vérifiée stable, 5 P2) → corrigé : référence exécutée deux fois, repli `--auto` si la commande échoue, sortie nommant le fichier écartée, limites (chiffres, confiance du script, 4000 car.) documentées, tests ajoutés. Le tour 2 n'a pas été relancé : les correctifs sont vérifiés par leurs tests, pas par un second relecteur.
- Limite : un symptôme dont seul un nombre change est invisible (normalisation).

### Rollback Notes

`git revert` ; aucun ledger migré (palier 5 optionnel).
