# Plan — Story 01.05

## Implementation Context

Fichiers probables :

- `bin/ai-learn.js` — `getFlagValue`, le `switch`, l'extraction des positionnels de
  `verify`, `install`, `propose`, `docs`.
- `bin/lib/args.js` (nouveau) — parseur partagé : `{ flags, positionals }`.
- `bin/lib/docs.js` — remplacer `stripDir` par le parseur partagé.
- `bin/lib/check.js`, `bin/lib/status.js`, `bin/lib/next.js` — séparer *calculer* de
  *afficher* : une fonction qui rend l'état, deux rendus (texte, JSON).
- `test/args.test.js` (nouveau), `test/cli.test.js`, `test/check.test.js`,
  `test/status.test.js`, `test/next.test.js`, `test/docs.test.js`.

Ancres de recherche :

- `getFlagValue`
- `commandArgs.find((arg) => !arg.startsWith("--"))`
- `stripDir`
- `printProjectReport`
- `printStatus`

Mode d'exécution :

- `STANDARD`

Scout pre-step :

- `no`

À éviter sauf nécessité :

- `verify.js`, `progress.js`, `predictions.js`, `norm.js`, `guard.js` — cette story
  ne change aucun comportement métier, seulement l'entrée et la sortie.

## Technical Notes

**Parseur.** Le seul point délicat est de savoir quels flags prennent une valeur. Une
liste explicite par commande est plus sûre qu'une heuristique « le token suivant ne
commence pas par `-` » : c'est cette heuristique qui a produit le bug d'origine.
Déclarer, pour chaque commande, ses flags à valeur (`--dir`, `--root`, `--home`,
`--technology`, `--project`, `--doc-source`, `--phases`, `--platform`, `--stack`,
`--level`, `--limit`, `--validate`, `--path`, `--input`) et ses flags booléens
(`--no-mark`, `--online`, `--regen`, `--json`, `--version`, `-v`).

**Non-régression prioritaire.** Ce parseur touche l'entrée de toutes les commandes,
donc tous les tests. La séquence sûre : écrire `test/args.test.js` d'abord, brancher
`verify` seul, faire tourner la suite entière, puis étendre commande par commande —
jamais un remplacement global en une passe.

**Séparer calcul et rendu.** `check.js#printProjectReport` mélange les deux
aujourd'hui. Extraire d'abord la construction de l'objet de rapport, puis brancher
les deux rendus dessus. Le rendu texte doit produire **exactement** les mêmes octets
qu'avant — un test de non-régression sur la sortie capturée (`test/helpers.js#capture`)
est le filet à poser avant de refactorer.

**Contrat JSON.** Un objet racine `{ version: 1, ... }`. Les chemins passent par
`normalizePortable`. Rien n'est écrit sur stdout en dehors de cet objet ; les
diagnostics éventuels vont sur stderr.

## Decisions

- Décision : liste explicite des flags à valeur, pas d'heuristique.
  - Raison : l'heuristique est la cause racine du bug d'origine, et elle a déjà été
    contournée localement une fois (`stripDir`) sans être corrigée.
  - Conséquence : ajouter un flag demande de le déclarer. C'est le prix, et c'est
    aussi une documentation exécutable des flags de chaque commande.
- Décision : `--json` seulement sur `check`, `status`, `next`.
  - Raison : ce sont les trois lecteurs du modèle d'états ; les autres commandes
    n'ont pas d'état stable à exposer et figeraient un format prématurément.
  - Conséquence : un agent qui veut l'état d'un `verify` lit son fichier d'évidence,
    qui est déjà du JSON.
- Décision : la sortie texte doit être identique octet pour octet.
  - Raison : c'est un refactor ; toute différence est une régression déguisée.
  - Conséquence : poser les tests de sortie capturée **avant** d'extraire le calcul.

## Test Plan

Unitaire (`test/args.test.js`) :

- [ ] `--dir <valeur> <positionnel>` → positionnel correct
- [ ] `<positionnel> --dir <valeur>` → même résultat
- [ ] `--dir=<valeur>` (forme collée)
- [ ] Flag booléen suivi d'un positionnel (`--no-mark 0`)
- [ ] Flag inconnu ignoré sans planter
- [ ] Valeur commençant par `-`
- [ ] Valeur contenant espaces et accolades (`--phases`)

`test/cli.test.js` :

- [ ] `verify --dir <chemin> <id>` fonctionne
- [ ] `install --home <chemin> claude` retient `claude`
- [ ] `propose --limit 3` retient 3 et non un positionnel

`test/check.test.js` / `test/status.test.js` / `test/next.test.js` :

- [ ] Sortie texte identique à la référence capturée (non-régression, posé en premier)
- [ ] `--json` produit un JSON valide et unique
- [ ] `--json` : même code de sortie qu'en texte, en succès comme en échec
- [ ] `--json` : chaque phase porte son verdict
- [ ] `--json` : `next` sans phase restante rend un champ dédié
- [ ] `--json` : `progress.json` absent → objet d'erreur, pas une stack
- [ ] `--json` : chemins normalisés

`test/docs.test.js` :

- [ ] Les cas de `stripDir` déjà couverts passent avec le parseur partagé

## Acceptance Traceability

| Acceptance criterion | Test proving it (`file::test`) |
| --- | --- |
| `verify --dir X <id>` fonctionne | `test/cli.test.js::verify accepte --dir avant l'id` |
| Les deux ordres équivalents | `test/args.test.js::l'ordre des flags n'affecte pas les positionnels` |
| `install --home X claude` | `test/cli.test.js::install retient la plateforme` |
| `check --json` valide | `test/check.test.js::check --json produit un JSON unique` |
| Codes de sortie identiques | `test/check.test.js::check --json garde le code de sortie` |
| Verdicts en JSON | `test/status.test.js::status --json expose le verdict par phase` |
| `next --json` sans phase | `test/next.test.js::next --json parcours terminé` |
| Texte inchangé | `test/check.test.js::la sortie texte est inchangée` |

## Commands

- Command: `npm test`
  - Expected: la suite complète passe, y compris les tests de non-régression de sortie.
- Command: `node bin/ai-learn.js check --root . --json`
  - Expected: un JSON unique et valide, exit 0.

## Rollback

Rétablir `getFlagValue` et les extractions positionnelles d'origine ; retirer le flag
`--json` et les rendus JSON. Aucune donnée n'est touchée par cette story.
