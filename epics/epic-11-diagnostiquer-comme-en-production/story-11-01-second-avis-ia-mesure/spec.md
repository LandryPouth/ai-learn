# Spec — Story 11.01 — Second avis IA, mesuré contre le site réel

## User Value

Pendant un incident, l'apprenant pose son hypothèse, puis l'IA donne la sienne avec les mêmes preuves. À la réparation, l'outil compare les deux au site réel qu'il est seul à connaître. Au fil des incidents, l'apprenant voit combien de fois l'IA avait tort de façon plausible, et combien de fois il l'a battue : c'est la mesure de « savoir juger l'IA ».

## Requirements

- `ai-learn predict --type debug --by ia` (avec `--file`/`--line`, ou `--cause` au niveau 3) enregistre l'hypothèse de l'IA. Champ `by` : `apprenant` (défaut, entrées existantes sans champ = apprenant) ou `ia`.
- Ordre imposé : refus (exit 1) d'une prédiction `--by ia` sans incident actif, ou sans prédiction `debug` de l'apprenant enregistrée depuis `startedAt`. Une seule prédiction IA par incident (la seconde est refusée).
- Les prédictions `by: ia` ne comptent pas dans `predictionsRequired` et ne sont jamais retenues comme « dernière prédiction de l'apprenant » par `--resolve`.
- `break --resolve` (vert) et `break --giveup` affichent deux comparaisons : apprenant et IA, chacune `exact` / `fichier` / `manqué` (niveau 3 : bonne cause ou non). Sans prédiction IA : une ligne « pas de second avis ».
- `~/.ai-learn/tracks/debug.json` gagne un champ optionnel `secondOpinion` : nombre d'incidents comparés, verdicts apprenant, verdicts IA, et le cas « l'apprenant exact, l'IA manquée ». Un ledger sans ce champ reste valide. Idempotent par `incidentId`.
- `status` : ligne « second avis : toi n/N exacts · IA m/N » dès qu'un incident a été comparé.
- `templates/AGENTS-apprentissage.md` §3sexies : étape « second avis » entre la prédiction et l'expérience ; l'IA ne propose rien avant la prédiction de l'apprenant, n'utilise que le symptôme et ce que l'apprenant a ouvert, et enregistre son hypothèse avec `--by ia`. `commands/learn-break.md` aligné.
- `docs/plans/predictions.md` régénéré marque les entrées IA « (IA) ».

## Acceptance Criteria

- [x] Given aucun incident actif, when `predict --type debug --by ia --file src/a.js --line 3`, then exit 1 et rien n'est écrit.
- [x] Given un incident actif sans prédiction de l'apprenant, when `predict --by ia`, then exit 1 « l'hypothèse de l'apprenant d'abord ».
- [x] Given une prédiction IA déjà enregistrée pour l'incident, when une seconde `--by ia`, then exit 1.
- [x] Given une prédiction apprenant `src/a.js:12`, une prédiction IA `src/b.js:4` et un site réel `src/a.js:13`, when `break --resolve` réussit, then la sortie montre apprenant `exact` et IA `manqué`, et `debug.json.secondOpinion` compte 1 incident, 1 cas « apprenant exact, IA manquée ».
- [x] Given la même prédiction IA rejouée par un second `--resolve` impossible (incident clos), when on relit `debug.json`, then le compteur n'a pas doublé.
- [x] Given une phase `predictionsRequired: {debug: 1}` et seulement une prédiction `--by ia`, when `verify`, then la phase reste bloquée pour prédiction manquante.
- [x] Given un `debug.json` écrit avant cette story, when `check` et `status`, then aucune erreur et aucune ligne « second avis ».
- [x] Given un incident comparé, when `status`, then la ligne « second avis » apparaît avec les bons compteurs.

## Edge Cases

- L'IA prédit au niveau 3 avec `--file` : refus, même règle que pour l'apprenant (`--cause` exigé).
- `--giveup` : comparaisons affichées, mais rien n'entre dans `secondOpinion` (pas de réparation prouvée), cohérent avec l'absence de palier.
- Incident automatique (`--auto`) : même flux.
- Plateformes sans mur de lecture (Codex, Gemini) : l'IA pourrait avoir lu le secret ; limite déjà assumée par 10.04, rappelée au README.

## Out of Scope

- Second avis hors incident (une stack trace en phase normale) : la vérité n'y est pas connue de l'outil, le protocole reste écrit dans les plans.
- Un verdict « plausible mais faux » déclaré à la main : remplacé par la comparaison mécanique.
