# Plan — Story 03.03

## Implementation Context

Fichiers probables :

- bin/lib/check.js (`citesRealPRUrl`)
- bin/lib/status.js
- templates/ (modèle de revue)
- test/check.test.js

Ancres de recherche : `citesRealPRUrl`

Mode d'exécution : `STANDARD`

Scout pre-step : `no` — les points d'intégration sont nommés ci-dessus.

À éviter sauf nécessité : bin/lib/guard.js

## Decisions

- Règle des trois tranchée : `citesRealPRUrl` (URL de PR) et la revue
  `file:line` sont le **même concept** — une citation qui doit résoudre +
  un minimum de substance autour. Le noyau commun vit dans
  `bin/lib/citation.js` (`hasSubstantialBody` / `citesWithSubstance`) ;
  `citesRealPRUrl` le consomme et `reviews.js` l'utilise pour le `file:line`,
  sans recopie. `docCitesOrigin` réutilise aussi `hasSubstantialBody` (le
  contenu hors citation est identique : filtre des lignes citantes + plancher
  de 200 caractères).
- Le nom de la revue est dérivé du nom de phase (`phase.name` slugifié :
  accents retirés, minuscules, non-alphanumériques → `-`), repli
  `phase-<id>` si le nom est vide. Une brique = une phase `done`.
- La citation est refusée hors de la racine du projet (pas de chemin absolu,
  pas de `..` échappé) : la revue porte sur le diff de **ce** projet.
- La citation doit en plus tomber dans le scope `implementationFiles` du guard
  (le code que le diff couvre), pas simplement exister dans le dépôt. Le scope
  est passé à `reviewState`/`reviewStates` ; `findRealFileLine` accepte un
  prédicat optionnel. Sans scope (appel unitaire), le contrôle reste
  racine-only.
- Le plancher de substance et le comptage de lignes ne comptent pas la ligne
  vide ouverte par un saut de ligne final : `text.replace(/\r?\n$/, "")`
  avant découpage, sinon `fichier:<dernière+1>` résout à tort.
- Les limites de mot de `DECISION_RE` sont Unicode (`\p{L}`) : `\b` est ASCII
  en JS et refusait les participes passés accentués (`accepté`, `rejeté`,
  `changement demandé`) que la liste énumère pourtant.
- Une citation accepte les séparateurs Windows (`src\index.js:3`) et les
  segments accentués ; un chemin absolu Windows reste refusé.
- Deux phases ne peuvent pas partager un nom : le fichier de revue étant
  dérivé du nom, une seule revue prouverait les deux. Le doublon est refusé
  (`ambiguous-name`) plutôt que résolu par un suffixe deviné.

## Test Plan

- [ ] Unit : citation valide/ligne inexistante/absente.
- [ ] Intégration : `check` en dirigeant.

## Acceptance Traceability

| Acceptance criterion | Test proving it |
| --- | --- |
| Given `docs/reviews/<brique>.md` citant `src/x.ts:12` existant et une décision, when `check` tourne, then la revue est valide. | `test/check.test.js::dirigeant: a done phase with a sourced review (real file:line + decision) passes` |
| Given une revue sans citation, ou citant une ligne inexistante, when `check` tourne, then erreur (presence + substance, comme `citesRealPRUrl`). | `test/check.test.js::dirigeant: a review with no citation is an error (presence, not only substance)` et `...::dirigeant: a review citing a line that does not exist is an error`, `...::dirigeant: citing the line right after the last real line is an error (trailing newline)`, `...::dirigeant: a citation outside implementationFiles is an error`, `...::dirigeant: a citation escaping the project root is an error` (plus `...::dirigeant: a review citing a real line but stating no decision is an error` et `...::dirigeant: a review with a bare citation and no substance is an error (degenerate case)`) |
| Given le mode `apprenti`, when `check` tourne, then les revues ne sont jamais exigées. | `test/check.test.js::apprenti never requires the dirigeant reviews (non-regression)` |
| Given `ai-learn status`, when des revues manquent en dirigeant, then le résumé les compte. | `test/status.test.js::status counts the missing dirigeant reviews of done phases` |
| Given la primitive de vérification, when on lit le code, then elle réutilise `citesRealPRUrl` (ou en extrait un noyau commun) sans le recopier. | `bin/lib/citation.js` (`hasSubstantialBody`/`citesWithSubstance`) consommé par `citesRealPRUrl` et par `bin/lib/reviews.js` — vérifié par les tests de citation (`test/citation.test.js`) et les tests tier-6 existants (`test/check.test.js::gitTier 6 …`) |

## Commands

- Command: `npm test`
  - Expected: la suite complète passe.

## Rollback

Revert du commit de la story ; aucune migration de données hors champs additifs.
