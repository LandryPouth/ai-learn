# Story 14.02 — Une théorie pédagogique canonique, dont AGENTS est la version courte, et un budget de friction

Mode : `QUICK` · fichiers : `docs/pedagogie.md` (nouveau), `templates/AGENTS-apprentissage.md` (commentaire HTML en tête), `RULES.md` (deux règles), README (lien), `bin/lib/check.js` (un avertissement), `test/check.test.js`.

Public : qui **modifie** le protocole (mainteneur, agents Coding Flow de ce dépôt), pas l'agent tuteur d'un projet d'apprentissage. `docs/` n'est pas publié dans le paquet : le doc n'est donc jamais chargé chez l'apprenant, et ne coûte rien en contexte.

`docs/pedagogie.md` explique **pourquoi** le protocole est ce qu'il est, en sections courtes : prédire avant de révéler (récupération active), anti-vague et cas d'échec, taper soi-même (mémoire procédurale), preuve exécutée plutôt que parole, confiance et calibration (14.01), sondage et arbre minimal (14.03), revisite en plusieurs formats et alternance (14.04), budget de friction, faiblesses prouvées et propositions (epic 13). Chaque section finit par « ce que ça exige de l'outil » et nomme la règle d'AGENTS qui l'applique. Les idées venues de LearnHarness sont reformulées et citées (dépôt, fichier), jamais copiées (AGPL).

Règle ajoutée à `RULES.md` (Project constraints) : toute story qui change le protocole d'AGENTS met à jour la section correspondante de `docs/pedagogie.md` ; en cas de conflit, le doc fait foi et AGENTS est corrigé. Le template AGENTS porte un commentaire HTML `<!-- version condensée de docs/pedagogie.md (dépôt ai-learn) -->`.

**Budget de friction** (décision du mainteneur, 2026-11-24) : une phase impose au plus **3 gestes bloquants**. Compte comme geste bloquant : chaque type listé dans `predictionsRequired`, `diagram: true` (15.01), toute exigence future qu'une story ajoute à `verify`. Tout le reste (sonde, revisite, lint, examen) est proposé par `next`, jamais exigé. Écrit dans `docs/pedagogie.md` (section « Budget de friction », avec la raison : au-delà, l'apprenant contourne l'outil) et dans `RULES.md` : une story qui ajoute un geste bloquant met à jour la liste des gestes comptés dans `check.js` et, si le budget est atteint, dit lequel elle remplace ou rend facultatif. `ai-learn check` avertit (jamais bloquant, invariant 6) quand une phase du plan dépasse 3.

## Acceptance Criteria

- [ ] Given `docs/pedagogie.md`, when on cherche chaque section d'AGENTS (§1 à §5bis), then chacune est nommée dans au moins une section « ce que ça exige ».
- [ ] Given le dépôt, when `grep -ri learnharness docs/pedagogie.md`, then la source est citée, et aucun paragraphe n'est une traduction littérale d'un prompt LearnHarness (relecture humaine).
- [ ] Given `templates/AGENTS-apprentissage.md`, when on lit ses premières lignes, then le commentaire de renvoi à `docs/pedagogie.md` y est.
- [ ] Given `RULES.md`, when on cherche `pedagogie.md`, then la règle de mise à jour conjointe y est.
- [ ] Given `RULES.md`, when on cherche « budget de friction », then la règle des 3 gestes bloquants y est.
- [ ] Given une phase avec `predictionsRequired: { code: 1, casse: 1, debug: 1, lecture: 1 }`, when `ai-learn check`, then un avertissement nomme la phase et « 4 gestes bloquants sur 3 » ; avec 3 types, aucun avertissement ; le code de sortie reste 0 dans les deux cas.
- [ ] Given `npm test`, when les tests de scaffold tournent, then ils restent verts.

## Commands

```
npm test
```

## Result
