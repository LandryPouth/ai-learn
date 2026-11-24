# Spec — Story 13.01 — Une phase prouvée laisse une trace dans la mémoire

## User Value

Quand l'apprenant prouve une phase, ce qu'il a fait rejoint une mémoire qui survit au projet : le vault Obsidian montre, par projet, les phases prouvées et le bilan des prédictions, et l'agent du prochain projet peut relire une fiche courte au lieu de repartir de zéro.

## Requirements

- `ai-learn memory export [--dir <projet>] [--vault <chemin>]` (machinerie, jamais tapée par l'apprenant) :
  1. calcule les **faits** du projet depuis `progress.json`, `.ai-learn/predictions.json` et `.ai-learn/runs/` : alias, phases prouvées / total, dernière preuve, nombre de prédictions révélées, note moyenne, écarts moyens ;
  2. les écrit dans `~/.ai-learn/memory/projects/<alias>.json` (source machine, `version: 1`, écriture via `tracks/store.js#writeLedgerFile`) ;
  3. rend `<vault>/ai-learn/projects/<alias>.md` et `<vault>/ai-learn/learner/card.md` à partir de **toutes** les sources `~/.ai-learn/memory/projects/*.json`.
- Résolution du vault : `--vault` > variable `AI_LEARN_VAULT` > `~/dev/.ai-memory-vault` s'il existe. Aucun : la source machine est écrite, le rendu est sauté avec une ligne « vault introuvable », exit 0.
- Fichiers rendus : frontmatter du contrat du vault (`type: insight`, `project: ai-learn`, `status: accepted`, `source: ai-learn memory export`, `created`, `updated`, `tags`) plus `generated: ai-learn`. Un fichier existant **sans** ce marqueur n'est jamais réécrit (avertissement nommant le fichier).
- `ai-learn memory card [--json]` : imprime la fiche (10 lignes au plus) depuis la source machine, sans lire le vault. Rien à dire : sortie vide, exit 0.
- `verify` appelle l'export après une clôture de phase réussie, dans son propre `try/catch` : un échec devient un avertissement, jamais un échec de `verify`.
- Rien dans le vault ne contient de chemin absolu, de texte de prédiction, de code ni de sortie de commande.

## Acceptance Criteria

- [ ] Given un projet avec 2 phases prouvées et 3 prédictions révélées, when `memory export --vault <tmp>`, then `<tmp>/ai-learn/projects/<alias>.md` affiche « 2/N phases » et la note moyenne, et `~/.ai-learn/memory/projects/<alias>.json` existe (home injecté).
- [ ] Given deux projets exportés, when `memory export` sur l'un, then `card.md` agrège les deux.
- [ ] Given aucun vault (ni flag, ni variable, ni dossier par défaut), when `memory export`, then exit 0, source machine écrite, message « vault introuvable ».
- [ ] Given `<vault>/ai-learn/learner/card.md` sans `generated: ai-learn`, when `memory export`, then le fichier est inchangé et un avertissement le nomme.
- [ ] Given `node --test` et le vrai vault par défaut, when un test appelle l'export sans vault injecté, then l'écriture est refusée.
- [ ] Given une phase qui passe `verify`, when le vault est en lecture seule, then `verify` réussit et affiche un avertissement « mémoire non exportée ».
- [ ] Given un export, when on cherche `/home/` ou le texte d'une prédiction dans `<vault>/ai-learn/`, then rien n'est trouvé.
- [ ] Given un export, when `memory card`, then au plus 10 lignes, dont une par projet actif.

## Edge Cases

- Deux projets au même nom de dossier : alias `<parent>-<nom>` pour le second, stable d'un export à l'autre (l'alias est stocké dans la source machine avec la clé de projet).
- `predictions.json` invalide : faits de prédiction omis, avertissement, export du reste.
- Projet sans `progress.json` : refus clair (`missingProgressMessage`).

## Out of Scope

- Import des prédictions `.md` (13.02), hook de session (13.03), faiblesses (13.04), propositions (13.05).
