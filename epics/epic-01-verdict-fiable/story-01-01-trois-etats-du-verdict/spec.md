# Story 01.01 — Trois états du verdict

## Goal

Remplacer le croisement ad hoc « statut de phase × existe-t-il une évidence » par un
état calculé une seule fois et consommé par tous les lecteurs — et y ajouter
l'empreinte du code que l'évidence prouve, pour que « prouvé » puisse cesser d'être
vrai.

## User Value

L'apprenant peut travailler une phase sans que `ai-learn check` soit rouge, et une
phase marquée prouvée dont le code a disparu cesse de mentir. Le verdict devient
utilisable au quotidien au lieu d'être un bruit qu'on apprend à ignorer.

## Context

Deux défauts, tous deux reproduits le 2026-09-01 :

1. `check.js` (branche `phase.status !== "done"`) lève une **erreur bloquante** dès
   qu'un fichier de checkpoint existe sans évidence passante. Une phase
   `in_progress` — test écrit, code en cours — fait donc `exit 1` pendant tout le
   temps de travail. Reproduit :
   ```
   ✗ checkpoint/phase-0.test.mjs: checkpoint exists but no passing evidence
   ✗ check FAILED
   ```
2. `progress.js#latestEvidenceForPhase` accepte une évidence indéfiniment. Une phase
   `done` reste « prouvée » même après suppression complète de `src/**`.

Cette story est le squelette de bout en bout de l'epic : elle traverse l'écriture
d'évidence (`verify`), le calcul d'état (`progress`), et les trois lecteurs
(`check`, `status`, `next`).

## Requirements

- [x] Une fonction unique calcule le verdict d'une phase et est utilisée par
      `check`, `status` et `next` — aucun lecteur ne re-dérive l'état à sa façon.
- [x] `verify` écrit dans l'évidence l'empreinte des fichiers que la preuve couvre :
      les fichiers de l'apprenant (globs `learnerFiles` du guard) et le fichier de
      checkpoint quand la commande en désigne un.
- [x] L'empreinte est stable : indépendante de l'ordre de lecture du répertoire et
      du séparateur de chemin de l'OS.
- [x] Une évidence sans empreinte (écrite par une version antérieure) reste valable
      et n'est **jamais** classée périmée.
- [x] Une phase `in_progress` sans évidence passante n'est plus une erreur.
- [x] Une phase `pending` dont le fichier de checkpoint existe sans évidence reste
      une erreur — le filet « verify non-skippable par omission » est conservé.
- [x] `verify` garde le monopole de l'écriture de `done` : cette story n'ajoute
      aucun autre appelant de `setPhaseStatus`.

## Acceptance Criteria

- [x] Given une phase `in_progress` dont `checkpoint/phase-N.test.mjs` existe et sans évidence passante, when `ai-learn check` tourne, then aucune erreur n'est émise pour cette phase et le code de sortie est 0.
- [x] Given une phase `pending` dont le fichier de checkpoint existe et sans évidence passante, when `ai-learn check` tourne, then une erreur est émise et le code de sortie est 1.
- [x] Given une phase `done` prouvée par une évidence portant une empreinte, when un fichier de `src/**` est modifié puis `ai-learn check` tourne, then la phase est signalée comme périmée avec une erreur et le code de sortie est 1.
- [x] Given une phase `done` prouvée par une évidence portant une empreinte, when aucun fichier couvert n'a changé, then `ai-learn check` ne signale rien pour cette phase et le code de sortie est 0.
- [x] Given une évidence ancienne sans champ d'empreinte, when `ai-learn check` tourne, then la phase est traitée comme prouvée et n'est jamais signalée périmée.
- [x] Given un projet dont les fichiers sont lus dans un ordre différent, when `ai-learn verify` tourne deux fois sans modification, then les deux empreintes sont identiques.
- [x] Given une phase quelconque, when `ai-learn status` tourne, then l'état affiché pour cette phase est celui rendu par la fonction de verdict partagée.
- [x] Given une phase périmée, when `ai-learn next` tourne, then elle est présentée comme à re-prouver et non comme terminée.

## Edge Cases

- [x] Projet sans aucun fichier `src/**` (empreinte d'un ensemble vide).
- [x] `learnerFiles` personnalisé dans `.ai-learn/guard.json` (le scope est lu via
      `loadGuardConfig`, jamais un `src/**` en dur).
- [x] Commande de checkpoint ne désignant aucun fichier existant (`checkpoint: "true"`)
      — `checkpointFilePath` rend `null`, testé.
- [x] Fichier binaire dans le périmètre de l'empreinte — testé, ne fait pas échouer
      le calcul (les octets sont lus tels quels, `isBinaryFile` n'entre pas en jeu ici).
- [x] Fin de ligne CRLF vs LF : décidé — le hash porte sur les octets bruts (voir
      Decisions du plan). Non testable côté unitaire sur cet OS ; la CI Windows de
      la story 01.06 est ce qui rend ce choix observable en pratique.
- [x] Évidence illisible ou JSON corrompu dans `.ai-learn/runs/` — non régressé :
      `latestEvidenceForPhase` avale déjà l'erreur de parse (inchangé par cette story).
- [x] Phase `done` sans `checkpoint` déclaré (warning existant, inchangé — le nouveau
      calcul de verdict n'est atteint que dans la branche `else` qui suit ce warning).

## UX Notes

Le vocabulaire affiché doit être en français et distinguer sans ambiguïté « je n'ai
pas encore prouvé » de « ce que j'avais prouvé n'est plus vrai ». Un état périmé doit
dire quoi faire (`ai-learn verify <id>`), pas seulement constater.

## Dependencies

Aucune. Première story de l'epic.

## Out of Scope

- [ ] Faire redescendre automatiquement le `status` d'une phase périmée — story 01.02.
- [ ] La sortie `--json` — story 01.05.
- [ ] Toute prise en compte des prédictions — stories 01.03 / 01.04.
