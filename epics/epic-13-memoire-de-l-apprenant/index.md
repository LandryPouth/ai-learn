# Epic 13 — Une mémoire de l'apprenant qui ne ment pas

## Goal

Donner à `ai-learn` une mémoire inter-projets de l'apprenant, rendue dans le vault Obsidian (`~/dev/.ai-memory-vault`, zone `ai-learn/`) : des **faits** exportés par le CLI seul (prédictions, preuves, incidents, katas), une **fiche courte** relue en début de session, des **faiblesses prouvées** qui orientent `break` et `review`, des **propositions** d'interprétation qui citent leurs preuves et que seul l'humain accepte, et des **expériences** pédagogiques mesurées.

## Business Value

Aujourd'hui chaque parcours repart de zéro : rien ne relie l'`EADDRINUSE` non anticipé de `fastify-traducteur-api` (phase 0) à la panne qu'un projet Go devrait servir. Les 13 `.ai-learn/dogfood.md` (environ 60 entrées) ne sont jamais agrégés. Le profil (`~/.ai-learn/profile.json`) dit les objectifs, pas ce que l'apprenant sait.

Constat du 2026-11-24 qui fixe l'ordre : `predictions.json` est vide dans les 13 projets alors que 33 prédictions réelles dorment dans `fastify-traducteur-api/docs/plans/predictions.md` (format d'avant 01.03, entrée du `dogfood.md` « les prédictions existantes ne comptent plus ») ; `tracks/git.json` liste 1 290 projets `/tmp/ai-learn-test-*` sur 1 291, et les paliers 1 et 2 de `tracks/tests.json` ne sont atteints que par eux. Une mémoire bâtie là-dessus serait fausse : capturer et assainir avant d'interpréter.

Origine : conversation du 2026-11-24 (analyse de LearnHarness, vault Coding Flow existant).

## Scope

Inclus :

- [ ] `ai-learn memory export` : source machine `~/.ai-learn/memory/`, rendu Markdown déterministe dans `<vault>/ai-learn/`, appelé en fin de `verify` (best-effort).
- [ ] Import des prédictions `.md` d'avant 01.03 dans `predictions.json`.
- [ ] Fiche apprenant (10 lignes au plus) : `ai-learn memory card`, hook `SessionStart` câblé par `init`/`update` sous Claude Code, champ `memory.card` de `next --json` ailleurs.
- [ ] Faiblesses prouvées (catégories d'écart au reveal, mécanismes manqués en kata et incident) qui pondèrent les tirages de `break` et `review`.
- [ ] Propositions (`idee-fausse`, `pedagogie`, `outil`) écrites dans le vault en `proposed`, chaque preuve citée vérifiée ; agrégat des journaux de friction.
- [ ] Expériences pédagogiques : variantes alternées par phase, métrique non gonflable, seuil d'échantillon avant conclusion.

Exclus :

- [ ] Toute interprétation écrite par l'IA en statut `accepted` : l'humain accepte dans Obsidian.
- [ ] Commit ou push du vault : `ai-learn` écrit des fichiers, l'humain (ou son hook `post-commit`) commite.
- [ ] Texte brut des prédictions, code, transcriptions, chemins absolus dans le vault (contrat `AGENTS.md` du vault).
- [ ] Graphe de connaissances extrait par un modèle (LearnHarness) : les notes par concept liées `[[…]]` suffisent, la vue graphe d'Obsidian le dessine.
- [ ] Le nettoyage des ledgers : `ai-learn ledgers --repair` existe déjà (voir « Après livraison »).

## Décisions de l'epic

- **Source machine dans `~/.ai-learn/memory/`, vault = rendu.** Même principe que `predictions.json` → `predictions.md` : le JSON fait foi, le Markdown est régénéré. Le vault peut être absent, déplacé ou sur une autre machine sans perte.
- **Le CLI seul écrit les faits.** Une interprétation (idée fausse, « ce format t'aide ») n'est qu'une proposition qui cite des ids de preuve vérifiés. Raison : un profil écrit par l'IA devient une étiquette qui s'auto-réalise (avertissement de LearnHarness, `skills/learnharness/SKILL.md`).
- **Vault résolu par `--vault` > `AI_LEARN_VAULT` > `~/dev/.ai-memory-vault`.** Absent : export sauté avec un message, jamais d'échec (invariant 5). Le vrai vault est refusé sous `node --test`, comme le vrai home (`tracks/store.js#assertWritable`).
- **Fichiers générés marqués** (`generated: ai-learn` en frontmatter) : un fichier sans marqueur n'est jamais réécrit (invariant 8).
- **Projets nommés par alias** (nom du dossier, parent ajouté en cas de collision), jamais par chemin absolu.

## Backbone

Backbone: capturer les faits → les exporter dans le vault → les relire en début de session → cibler les exercices sur les faiblesses prouvées → proposer des interprétations prouvées → mesurer ce qui marche

```text
s1
├── s2
├── s3
├── s4 ── s6
└── s5
```

| Story | Bâtit sur | Pourquoi |
|---|---|---|
| `s1` | — | Racine : résolution du vault, source `~/.ai-learn/memory/`, rendu, appel depuis `verify`, `memory card` minimale. |
| `s2` | — (racine conceptuelle) | Ne touche que `predictions.js`/`check.js` ; sans `s1` elle rend déjà les 33 prédictions comptables. Rangée sous `s1` pour l'ordre de lecture. |
| `s3` | `s1` | Câble l'affichage de `memory card` en session. |
| `s4` | `s1` | Ajoute la section faiblesses à la source et à la fiche. |
| `s5` | `s1` | Écrit dans la zone `proposals/` du vault créée par `s1`. |
| `s6` | `s4` | Partage `predictions.js` et `next.js` avec `s4` : séquentiel. |

`s2`, `s3` et `s5` touchent des fichiers disjoints (`predictions.js`+`check.js` / `guard.js`+`init.js`+`update.js` / nouveau `memory-proposals.js`) : parallélisables après `s1`. Partagés : README, `templates/AGENTS-apprentissage.md`, `docs/project-context.md`, fusion manuelle assumée.

Lien avec l'epic 14 : la fiche (`s3`) et les expériences (`s6`) affichent la calibration dès que `14.01` est livrée ; sans elle, la ligne est omise.

## Stories

1. **[story-13-01-memoire-de-bout-en-bout](story-13-01-memoire-de-bout-en-bout/spec.md)** — walking skeleton : `verify` → `~/.ai-learn/memory/` → `<vault>/ai-learn/` → `memory card`.
2. **[story-13-02-predictions-d-avant-comptent](story-13-02-predictions-d-avant-comptent/spec.md)**
3. **[story-13-03-fiche-en-debut-de-session](story-13-03-fiche-en-debut-de-session/spec.md)**
4. **[story-13-04-faiblesses-prouvees-et-ciblage](story-13-04-faiblesses-prouvees-et-ciblage/spec.md)**
5. **[story-13-05-propositions-avec-preuves](story-13-05-propositions-avec-preuves/spec.md)**
6. **[story-13-06-experiences-mesurees](story-13-06-experiences-mesurees/spec.md)**

## Context Strategy

- Mode : `s1`, `s4` `STANDARD` ; `s2` `STANDARD` (donnée de l'apprenant réécrite) ; `s3` `STRICT` (hook câblé dans `.claude/settings.json`, comme le guard) ; `s5`, `s6` `STANDARD`.
- Scout pre-step : aucun.
- Modèles à calquer : `tracks/store.js` (écriture unique, refus du vrai home sous test), `predictions.js#syncJournalRender` (rendu généré sauf s'il est personnalisé), `bilan.js` (généré, jamais écrasé), `ledgers.js#syncEvidence` (best-effort isolé).
- À ne pas toucher sans décision : la grammaire shell de `guard.js`, le monopole du `done` (`verify.js`).

## Après livraison (hors dépôt)

1. `ai-learn ledgers --repair --dry-run` puis `--repair` : retire les 1 290 projets `/tmp/` et recalcule les paliers de tests.
2. Dans `fastify-traducteur-api` : `ai-learn predict --import-md` (13.02), puis `ai-learn memory export`.
3. Vault : ajouter la ligne `ai-learn/` au tableau « Comment écrire » de `AGENTS.md` et un lien dans `Home.md` (zones en lecture seule pour l'agent : à faire par l'humain).

## Clarification Readiness

ready — hypothèses étiquetées dans les `plan.md` : vault par défaut `~/dev/.ai-memory-vault` ; export sans texte brut de prédiction ; alias de projet par nom de dossier ; seuil d'expérience 6 phases par variante.
