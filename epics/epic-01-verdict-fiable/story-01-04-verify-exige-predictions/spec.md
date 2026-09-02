# Story 01.04 — `verify` exige les prédictions de la phase

## Goal

Traiter les prédictions comme la norme et les artefacts : un blocage dur au moment de
la preuve, par phase, avec l'antériorité prédiction < révélation vérifiée
mécaniquement — et sa limite écrite noir sur blanc.

## User Value

Une phase peut aujourd'hui être marquée `done` avec zéro prédiction : `verify` bloque
sur la norme et sur les artefacts manquants, mais pas sur le protocole qui est la
raison d'être pédagogique de l'outil. Le résultat est une incohérence visible — le
mécanisme le plus important est le seul qui ne soit qu'un warning.

## Context

`verify.js` calcule `ok` à partir de quatre facteurs : le checkpoint, le
`stressCheckpoint`, la norme, les artefacts manquants. Les prédictions n'y sont pas ;
`check` se contente d'un warning global (et faux, corrigé en 01.03).

La story 01.03 a rendu deux choses possibles : le comptage par phase, et
l'horodatage. Cette story les met au service du verdict.

## Requirements

- [ ] `verify` refuse de marquer `done` une phase dont le nombre de prédictions
      enregistrées est inférieur à son `predictionsRequired`.
- [ ] Le manque est affiché comme les violations de norme : précis, actionnable,
      avec le compte réel et le compte attendu.
- [ ] L'évidence porte une section prédictions, symétrique de la section norme.
- [ ] L'antériorité est vérifiée : une prédiction enregistrée **après** la révélation
      qu'elle prédit est signalée.
- [ ] Une phase avec `predictionsRequired` absent ou à 0 n'est jamais bloquée.
- [ ] Un projet hérité, sans données de prédictions, n'est jamais bloqué par ce
      mécanisme — le comptage `.md` reste informatif (warning de `check`), pas bloquant.
- [ ] La limite est documentée : ce qui est prouvé est **l'ordre d'écriture**, pas
      l'honnêteté de la prédiction.

## Acceptance Criteria

- [ ] Given une phase exigeant 2 prédictions et n'en ayant qu'une enregistrée, when `ai-learn verify <id>` tourne avec un checkpoint qui passe, then la phase n'est pas marquée `done` et le code de sortie est 1.
- [ ] Given une phase exigeant 2 prédictions et en ayant 2 enregistrées, when `ai-learn verify <id>` tourne avec un checkpoint qui passe, then la phase est marquée `done`.
- [ ] Given une phase sans `predictionsRequired`, when `ai-learn verify <id>` tourne avec un checkpoint qui passe, then la phase est marquée `done`.
- [ ] Given une phase bloquée par des prédictions manquantes, when `ai-learn verify <id>` tourne, then le message indique le compte réel et le compte attendu pour cette phase.
- [ ] Given une prédiction dont l'horodatage d'écriture est postérieur à sa révélation, when `ai-learn verify <id>` tourne, then l'anomalie d'antériorité est signalée dans la sortie et dans l'évidence.
- [ ] Given un projet sans `.ai-learn/predictions.json`, when `ai-learn verify <id>` tourne avec un checkpoint qui passe, then la phase est marquée `done` sans blocage.
- [ ] Given un `verify` réussi, when l'évidence est relue, then elle contient une section prédictions avec le compte et le résultat du contrôle d'antériorité.

## Edge Cases

- [ ] `predictionsRequired` supérieur au nombre de prédictions possibles (valeur
      absurde saisie par un agent) — bloquer, mais avec un message qui aide.
- [ ] Prédiction sans `revealedAt` (révélation pas encore faite) — ne compte pas
      comme anomalie d'antériorité.
- [ ] Horodatages égaux à la milliseconde près.
- [ ] Horloge système reculée entre deux écritures.
- [ ] Phase avec `stressCheckpoint` : les deux blocages doivent coexister sans que
      l'un masque l'autre dans la sortie.
- [ ] `verify --no-mark` : le contrôle s'exécute et s'affiche, mais ne modifie rien.

## UX Notes

Le message de blocage est le premier endroit où l'apprenant peut avoir l'impression
que l'outil l'empêche d'avancer. Il doit nommer la phase, le compte, et rappeler que
la prédiction fait l'apprentissage — sans sermon, en une ligne.

L'anomalie d'antériorité est **signalée**, pas nécessairement bloquante : décider
explicitement dans le plan et écrire la raison.

## Dependencies

- Dépendance : story 01.03 (les données de prédictions et leur horodatage).

## Out of Scope

- [ ] Juger le contenu, la précision ou l'honnêteté d'une prédiction.
- [ ] Modifier le protocole de notation (écarts, note /10, 3 points) — il reste
      entièrement du ressort de l'agent.
- [ ] Bloquer sur les projets hérités sans données.
