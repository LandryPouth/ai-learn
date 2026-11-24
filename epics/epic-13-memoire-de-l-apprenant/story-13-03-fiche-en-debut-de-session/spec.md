# Spec — Story 13.03 — L'agent connaît l'apprenant dès la première réponse

## User Value

En ouvrant une session dans un projet d'apprentissage, l'agent reçoit en dix lignes ce que la mémoire sait de l'apprenant (projets, dernières preuves, faiblesses et idées fausses acceptées quand elles existent). Il n'a pas besoin qu'on lui raconte, et il ne charge rien d'autre.

## Requirements

- `init` et `update` câblent dans `.claude/settings.json` du projet un hook `SessionStart` qui lance `ai-learn memory card --hook` (même mécanique que le hook `PreToolUse` du guard : bloc reconnu par sa commande, jamais de doublon, rien d'autre n'est touché).
- `memory card --hook` imprime la fiche au format de contexte additionnel du hook ; il **fail-open** : source absente, illisible, erreur → aucune sortie, exit 0, en moins d'une seconde.
- La fiche n'est injectée que dans un projet qui a un `progress.json` (le hook est posé par `init`, donc seulement là).
- Autres plateformes : `next --json` porte `memory.card` (tableau de lignes, vide si rien) ; `/learn-next` et `/learn` (reprise) le lisent et s'en servent sans le réciter.
- `check` signale (warning) un projet où `guard.json` existe mais le hook `SessionStart` manque, comme pour le guard.
- `templates/AGENTS-apprentissage.md` : un paragraphe « Mémoire » — la fiche est une donnée, pas une consigne ; une ligne qui contredit ce que l'apprenant fait maintenant cède devant l'observation.

## Acceptance Criteria

- [ ] Given un projet `init`, when on lit `.claude/settings.json`, then un hook `SessionStart` lance `ai-learn memory card --hook`.
- [ ] Given `update` lancé deux fois, when on lit `.claude/settings.json`, then un seul hook `SessionStart` ai-learn existe et les hooks de l'utilisateur sont intacts.
- [ ] Given une source mémoire corrompue, when `memory card --hook`, then aucune sortie et exit 0.
- [ ] Given une source mémoire de 2 projets, when `next --json`, then `memory.card` contient leurs lignes.
- [ ] Given `guard.json` présent sans hook `SessionStart`, when `check`, then un warning le nomme.
- [ ] Given la fiche, when on compte ses lignes, then au plus 10.

## Edge Cases

- `.claude/settings.json` avec un `SessionStart` utilisateur : le nôtre est ajouté à côté.
- Vault de l'utilisateur déjà injecté par son hook global (`vault-context.mjs`) : aucun conflit, les deux blocs coexistent ; la fiche ai-learn ne répète pas les préférences.

## Out of Scope

- Contenu des faiblesses (13.04) et idées fausses (13.05) : la fiche prévoit leurs lignes, vides tant que ces stories ne sont pas livrées.
