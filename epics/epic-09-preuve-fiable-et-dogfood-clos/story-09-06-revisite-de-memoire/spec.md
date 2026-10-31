# Spec — Story 09.06 — Une revisite qui prouve la mémoire

## User Value

Quand une phase revient en revisite, l'outil retire de `src/**` exactement ce que la phase avait ajouté, et l'apprenant le retape de mémoire. Le checkpoint vert prouve alors qu'il sait encore le faire, pas que le fichier est toujours là. Les revisites s'espacent quand elles réussissent.

## Requirements

- **Constat** : `verify --revisit` relance aujourd'hui le checkpoint sur le code inchangé, donc toujours vert ; et `/learn` ne pose jamais `reviewAfterDays`.
- **`ai-learn revisit <id>`** (machinerie, lancé par `/learn-next` quand une revisite est due ; aussi `--giveup`) :
  - Préconditions, refus nommés sinon : phase `done` ; dépôt git ; arbre propre ; aucune revisite ni mutation active (verrou) ; au moins un commit dont le message contient `(phase-<id>)`.
  - Calcule le diff cumulé des commits de la phase restreint aux fichiers de l'apprenant (`learnerFiles`) et l'applique **à l'envers** sur l'arbre courant. Si l'application inverse échoue (code retravaillé depuis), refus « la phase a été retravaillée depuis — revisite impossible par retrait » sans rien modifier.
  - Sauvegarde les fichiers touchés (`.ai-learn/revisit/<id>/backup/`) et pose un verrou `.ai-learn/revisit.lock.json` (`phaseId`, `startedAt`, fichiers), calqué sur `mutate.lock.json`.
  - Affiche ce qui a été retiré **par fichier et nombre de lignes**, jamais le contenu.
- **`verify <id> --revisit`** : refuse sans revisite active pour cette phase (« une revisite sans retrait ne prouve rien — `ai-learn revisit <id>` ») ; vert → lève le verrou, garde le code retapé, supprime la sauvegarde, rafraîchit `lastProvenAt`, double `reviewAfterDays` (plafond 60) ; rouge → verrou conservé, l'apprenant continue.
- **`revisit <id> --giveup`** : restaure la sauvegarde, lève le verrou, trace l'abandon dans l'évidence (`revisit: "abandon"`) ; `reviewAfterDays` revient à sa valeur initiale.
- **Récupération** : un verrou orphelin (processus mort, sauvegarde présente) est signalé par `status`/`next` en premier ; `revisit --giveup` le résout.
- **`/learn`** pose `reviewAfterDays: 7` sur chaque phase hors phase 0 ; `update` ne modifie pas les phases existantes.
- `status` et `next` placent une revisite active avant tout le reste.

## Acceptance Criteria

- [x] Given une phase 2 `done` dont le commit `feat(phase-2): …` a ajouté 12 lignes dans `src/app.ts`, when `revisit 2`, then ces 12 lignes sont retirées, la sortie dit « src/app.ts : 12 lignes retirées », la sauvegarde et le verrou existent.
- [x] Given cette revisite, when `verify 2 --revisit` sans rien retaper, then rouge, verrou conservé, phase toujours `done`.
- [x] Given l'apprenant a retapé, when `verify 2 --revisit` passe, then verrou levé, code retapé conservé, `reviewAfterDays` doublé, `lastProvenAt` rafraîchi.
- [x] Given `verify 2 --revisit` sans revisite active, when il tourne, then exit 1 avec le message « une revisite sans retrait ne prouve rien ».
- [x] Given `revisit 2 --giveup`, when il tourne, then les fichiers sont identiques à l'état d'avant la revisite (octet pour octet) et l'évidence trace l'abandon.
- [x] Given un arbre git modifié, when `revisit 2`, then refus nommant les fichiers non commités, rien n'est modifié.
- [x] Given du code de la phase 2 retravaillé par la phase 3 de façon incompatible, when `revisit 2`, then refus « retravaillée depuis », rien n'est modifié.
- [x] Given un verrou orphelin, when `next`, then la première ligne le signale avec la commande de résolution.
- [x] Given `commands/learn.md`, when on le lit, then les phases générées portent `reviewAfterDays: 7` (sauf phase 0).

## Edge Cases

- Plusieurs commits pour une phase (Fastify phase 3 en a 2) : diff cumulé, dans l'ordre.
- Fichier créé par la phase : l'inverse le supprime ; la sauvegarde le garde.
- Fichiers hors `learnerFiles` touchés par le commit (checkpoint, docs) : jamais retirés.
- Windows / CRLF : comparer en octets pour `--giveup`.

## Out of Scope

- Revisite sans git ou sans convention de commit : refusée avec une explication ; pas de mode alternatif dans cette story.
- Le moteur d'incident de l'epic 10 : il réutilisera la sauvegarde/verrou de cette story.
