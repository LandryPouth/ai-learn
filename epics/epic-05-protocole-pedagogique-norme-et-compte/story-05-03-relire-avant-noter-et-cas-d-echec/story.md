# Story 05.03 — Relire `src/**` avant noter/révéler, cas d'échec dans chaque question

## Status: done

## Goal

Imposer par le protocole (§1-§3) la relecture de l'état réel de `src/**` avant toute notation et toute révélation, et un cas d'échec explicite dans chaque question de prédiction.

## Acceptance Criteria

- [x] Given §2, when on la lit, then elle exige de relire `src/**` avant de noter et de citer `fichier:ligne` dans le feedback.
- [x] Given §3, when on la lit, then la révélation part du code déjà tapé par l'apprenant (jamais d'une structure générique).
- [x] Given §1, when on la lit, then chaque question de prédiction doit inclure explicitement un cas d'échec (entrée invalide, ressource absente…).
- [x] Given un projet scaffoldé, when `AGENTS.md` est généré, then ces trois règles y figurent.
- [x] Given le test de structure du template (story 02), when il tourne, then il passe toujours.

## Implementation Context

Mode : `FAST` · scout pre-step : `no`

Fichiers probables :

- templates/AGENTS-apprentissage.md (§1, §2, §3)
- commands/learn.md (rappel)

Ancres de recherche : `### 1.`, `### 2.`, `### 3.`

À éviter : bin/lib/** (hors test)

## Decisions

- Décision à prendre : règles formulées comme obligations vérifiables (« citer `fichier:ligne` ») plutôt que comme conseils.

## Tests

- Le test de structure existant suffit ; aucun nouveau test comportemental.

## Commands

- Command: `npm test`
  - Expected: la suite complète passe.

## Result

- **Changed**: `templates/AGENTS-apprentissage.md` — §1 gagne l'obligation « cas d'échec
  obligatoire dans chaque question de prédiction » (cas nominal insuffisant, relance) ;
  §2 gagne « relire `src/**` avant de noter » avec citation `fichier:ligne` obligatoire
  dans le feedback ; §3 gagne « la révélation part du code déjà tapé » (jamais une
  structure générique). `init` copie le template tel quel, donc les trois règles
  arrivent dans `AGENTS.md` scaffoldé.
- **Tests**: `node --test test/init.test.js` — 19/19 ; 2 tests de structure ajoutés
  (présence des obligations dans le template, copie intégrale dans `AGENTS.md`).
  Suite complète : voir verify.
- **Risks**: aucun — template uniquement, aucun code exécutable modifié.
