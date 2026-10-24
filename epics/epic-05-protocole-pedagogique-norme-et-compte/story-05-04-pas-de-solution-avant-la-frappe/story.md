# Story 05.04 — Pas de solution concrète avant la frappe ; révélation dans le chat par défaut

## Status: done

## Goal

Clarifier le moment où un exemple peut être montré (jamais une forme de solution avant que l'apprenant ait tapé quelque chose) et passer la révélation `docs/solutions/` de défaut à option.

## Acceptance Criteria

- [x] Given §1, when on la lit, then elle interdit tout extrait de la forme de la solution (y compris un exemple de la doc officielle) tant que l'apprenant n'a rien tapé ni expliqué.
- [x] Given §3, when on la lit, then la révélation se fait par défaut dans le chat, et `docs/solutions/<brique>.md` est décrit comme option à la demande.
- [x] Given `ai-learn init`, when il scaffolde, then `docs/solutions/` n'est plus créé d'office (créé à la première révélation écrite).
- [x] Given un projet existant avec `docs/solutions/`, when `update` tourne, then rien n'y est supprimé.
- [x] Given la suite de tests, when elle tourne, then elle passe, les assertions sur le scaffold étant mises à jour et justifiées dans `## Result`.

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

- **Changed**: `templates/AGENTS-apprentissage.md` — §1 interdit tout extrait de la forme
  de la solution (bloc de code, signature, structure de handler, exemple « officiel »
  recopié de la doc) tant que l'apprenant n'a rien tapé ni expliqué ; §3 passe la
  révélation au chat par défaut et rend `docs/solutions/<brique>.md` optionnel à la
  demande. `bin/lib/init.js` câble le guard avec `createSolutionsReadme: false` :
  `init` ne crée plus `docs/solutions/`, qui apparaît à la première révélation écrite.
  `update`/`mode` gardent leur comportement (aucune suppression, README rafraîchi).
- **Tests**: `node --test test/init.test.js test/update.test.js` — 45/45 ; ajout d'un
  test « init ne crée pas docs/solutions/ », d'un test des deux règles de template, et
  d'un test « update ne supprime pas une révélation existante ». Les assertions de
  scaffold qui exigeaient `docs/solutions/` venaient de `update` (inchangé), pas d'`init`.
- **Review fixes**: `ensureGuardHook` ne crée plus jamais `docs/solutions/` (init, update et
  mode) : le README n'est rafraîchi que si le dossier existe déjà. Le message de refus du guard
  et le README généré annoncent la révélation dans le chat par défaut. Tests ajoutés/adaptés :
  `update` ne crée pas `docs/solutions/` ; les tests de rafraîchissement du README pré-créent le
  dossier. `npm test` : 682/682.
- **Risks**: code exécutable modifié (`bin/lib/guard.js`, `bin/lib/init.js`), couvert par les
  tests ; `install.js`/`check.js` mentionnent `docs/solutions/` comme garde-fou quand il est
  utilisé, ce qui reste exact.
