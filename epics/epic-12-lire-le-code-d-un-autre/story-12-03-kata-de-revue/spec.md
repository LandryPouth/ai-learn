# Spec — Story 12.03 — Kata de revue : un diff piégé dont l'outil connaît les défauts

## User Value

L'apprenant relit un diff plausible, comme celui qu'une IA lui proposerait, et doit y trouver les défauts cachés parmi des changements inoffensifs. L'outil compte ce qu'il a trouvé, ce qu'il a manqué et ce qu'il a signalé à tort. C'est l'entraînement direct à la compétence n°1 avec l'IA : relire avant d'accepter.

## Requirements

- `ai-learn review [--defects K] [--decoys M]` (K défaut 3, borné 1-6 ; M défaut 4, borné 0-10). Préconditions : `progress.json`, au moins une phase `done`, aucun kata actif, aucun incident actif.
- Génération sur une **copie** des fichiers de l'apprenant des phases `done` (portée `learnerFiles` du guard) ; `src/**` n'est jamais modifié :
  - K défauts tirés de `faults` puis `mutators` du pack (11.02) ;
  - M changements neutres tirés de `NEUTRAL_TRANSFORMS` (11.04) ;
  - sites distincts, au plus un par ligne, mélangés.
- Sortie dans `katas/<id>/` : `kata.diff` (diff unifié avant → après, numéros de ligne de l'« après ») et `revue.md` (gabarit vide : une ligne `- fichier:ligne — raison` par défaut trouvé). Le kata ne dit ni K ni M.
- Secret (sites des défauts et des leurres, opérateurs) dans `~/.ai-learn/katas/<id-projet>-<id>.json`. État public `.ai-learn/kata.json` `{ active, id, startedAt }`.
- Guard : `katas/**` fait partie des fichiers de l'apprenant (l'IA n'y écrit pas) ; tant qu'un kata est actif, l'IA ne lit pas `katas/<id>/**` ni `~/.ai-learn/katas/**` (mur sous Claude Code, consigne ailleurs). L'apprenant ouvre le diff dans son éditeur.
- `ai-learn review --reveal` : refus si `revue.md` ne contient aucune citation. Sinon, chaque citation est rapprochée d'un défaut (même fichier, ligne ±1) ; score affiché : défauts trouvés / K, défauts manqués (avec site, nom et mécanisme), faux positifs (dont « leurre signalé » quand la citation tombe sur un changement neutre). Le kata est clos, lisible par l'IA ensuite.
- `ai-learn review --giveup` : révèle sans score ni palier.
- Ledger `~/.ai-learn/tracks/review.json` (calqué sur `tracks/debug.js`) : palier 1 = premier kata révélé avec une revue ; palier 2 = tous les défauts trouvés avec au plus 1 faux positif. Connu de `ledgers --repair/--sync`.
- `next` : une phase taguée `"kata": true` et prouvée rend un kata dû (`next --json` → `kata.due`), une fois par preuve ; l'IA lance alors `ai-learn review` sans demander. `status` : kata actif en tête, ligne « revue : n katas, taux moyen ».
- AGENTS : nouvelle section « kata de revue » : l'IA ne relit pas le kata, ne commente pas le diff avant `--reveal`, puis discute chaque défaut manqué.

## Acceptance Criteria

- [x] Given un projet avec une phase `done`, when `review --defects 2 --decoys 2` (générateur fixé), then `katas/<id>/kata.diff` montre exactement 4 lignes modifiées, `src/**` est identique octet par octet, et `.ai-learn/kata.json` ne contient aucun site.
- [x] Given un kata actif, when l'IA tente `Read` sur `katas/<id>/kata.diff` sous Claude Code, then le guard refuse ; when elle tente `Write` sur `katas/<id>/revue.md`, then le guard refuse.
- [x] Given une `revue.md` vide, when `review --reveal`, then exit 1 et le kata reste actif.
- [x] Given une revue qui cite les 2 défauts et un leurre, when `review --reveal`, then score 2/2, 1 faux positif marqué « leurre signalé », palier 2 atteint.
- [x] Given une revue qui cite 1 défaut sur 2, when `review --reveal`, then le défaut manqué est affiché avec son mécanisme, palier 1 atteint, pas le palier 2.
- [x] Given une phase taguée `kata` venant d'être prouvée, when `next --json`, then `kata.due` vaut `true`, puis `false` au second appel pour la même preuve.
- [x] Given un kata actif, when `review` à nouveau, then exit 1.
- [x] Given un `review.json` illisible, when `review --reveal`, then il n'est jamais écrasé (refus de `writeLedgerFile`).

## Edge Cases

- Moins de K+M sites disponibles : K est prioritaire ; refus si K ne peut pas être atteint.
- L'apprenant modifie `kata.diff` : sans effet, le secret fait foi.
- `katas/` doit être ignoré par git ou non : laissé au projet ; `init`/`update` ajoutent `katas/` au `.gitignore` du scaffold.

## Out of Scope

- Code d'autrui (12.04).
- Défauts de sécurité ou de concurrence au-delà de la banque `faults`.
