# Plan — Story 11.03

## Implementation Context

Fichiers probables :

- bin/lib/tutor.js (validation `symptomCommand`, `symptomTimeoutMs`)
- bin/lib/incident.js (niveau 4 : référence, détectabilité double, affichage, `chooseLevel`)
- bin/lib/exec.js (réutiliser `runCommand` avec délai et arrêt du groupe de processus)
- bin/lib/tracks/debug.js (palier 5 optionnel)
- bin/lib/status.js, bin/lib/next.js (texte du niveau 4)
- bin/ai-learn.js (`--level 4` accepté, usage)
- templates/AGENTS-apprentissage.md (§3sexies), commands/learn-break.md, README.md
- test/incident.test.js, test/tutor.test.js, test/tracks-debug.test.js

Ancres : `chooseLevel`, `trial`, `runCheckpoints`, `outputOf`, `OUTPUT_LINES`, `incidentChance`, `REQUIRED_TIER_IDS`, `runCommand`

Mode : `STRICT` (écriture dans `src/**`, processus lancés par l'outil) · scout pre-step : `no`

À éviter : `incidents/env.js` (niveau 3), sauf pour réutiliser l'arrêt de processus.

## Decisions

- **Le projet déclare son symptôme, l'outil l'exécute.** L'outil reste généraliste ; le projet sait ce que montre son observabilité. Alternative écartée : générer un faux log ou un faux événement Sentry depuis la sortie du test, qui ne ressemblerait à rien de réel.
- **Observable prouvé** : la sortie doit changer par rapport à la référence ; un symptôme invisible n'est pas un incident.
- **Normalisation minimale avant comparaison** (nombres, identifiants hexadécimaux) : assez pour les horodatages et les `reqId`, sans prétendre comprendre la sortie.
- **Palier 5 et non 4** : le palier 4 est déjà la panne d'environnement (10.05).

## Test Plan

Fixtures avec un `symptomCommand` en `node -e` qui lit `src/a.js` et imprime un résultat : absent, stable, sensible à la panne, lent (délai court), en échec avant injection. Choix `--auto` avec générateur fixé. Ledger à 4 paliers valide.

## Acceptance Traceability

| Critère | Preuve |
|---|---|
| non déclarée | test/incident.test.js::level 4 needs a declared symptom command |
| invisible | test/incident.test.js::a fault the symptom does not show is not kept |
| symptôme seul | test/incident.test.js::level 4 shows the symptom output and hides checkpoint output |
| palier 5 | test/incident.test.js::resolving a level 4 incident reaches debug tier 5 |
| ledger ancien | test/tracks-debug.test.js::a ledger without tier 5 stays valid |
| délai | test/incident.test.js::a symptom command over its timeout is killed and the code restored |
| auto | test/incident.test.js::auto picks level 4 once tier 2 is reached and a symptom is declared |

## Commands

```
npm test
```
