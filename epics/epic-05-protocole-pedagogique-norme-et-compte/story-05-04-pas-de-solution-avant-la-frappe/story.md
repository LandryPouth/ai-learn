# Story 05.04 — Pas de solution concrète avant la frappe ; révélation dans le chat par défaut

## Goal

Clarifier le moment où un exemple peut être montré (jamais une forme de solution avant que l'apprenant ait tapé quelque chose) et passer la révélation `docs/solutions/` de défaut à option.

## Acceptance Criteria

- [ ] Given §1, when on la lit, then elle interdit tout extrait de la forme de la solution (y compris un exemple de la doc officielle) tant que l'apprenant n'a rien tapé ni expliqué.
- [ ] Given §3, when on la lit, then la révélation se fait par défaut dans le chat, et `docs/solutions/<brique>.md` est décrit comme option à la demande.
- [ ] Given `ai-learn init`, when il scaffolde, then `docs/solutions/` n'est plus créé d'office (créé à la première révélation écrite).
- [ ] Given un projet existant avec `docs/solutions/`, when `update` tourne, then rien n'y est supprimé.
- [ ] Given la suite de tests, when elle tourne, then elle passe, les assertions sur le scaffold étant mises à jour et justifiées dans `## Result`.

## Implementation Context

Mode : `FAST` · scout pre-step : `no`

Fichiers probables :

- templates/AGENTS-apprentissage.md (§1, §3)
- bin/lib/init.js (scaffold)
- test/init.test.js

Ancres de recherche : `solutions`, `mkdirp`

À éviter : bin/lib/update.js (aucune suppression)

## Decisions

- Décision à prendre : la règle est une préférence apprenant observée une fois — on la rend **réglable** plutôt que universelle (`docs/solutions` reste possible), conformément à la mention « pas forcément généralisable » du journal.

## Tests

- Test d'`init` : pas de `docs/solutions/` vide ; test d'`update` : conservation.

## Commands

- Command: `npm test`
  - Expected: la suite complète passe.

## Result
