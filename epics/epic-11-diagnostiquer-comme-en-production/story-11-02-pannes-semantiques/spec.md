# Spec — Story 11.02 — Pannes sémantiques

## User Value

L'incident ressemble à un vrai bug : un `await` oublié, une erreur avalée, une connexion de pool jamais rendue, un `&&` pris pour un `||`, un `??` remplacé par `||`. Au moment de la révélation, l'apprenant apprend le nom du mécanisme, pas seulement la ligne.

## Requirements

- Banque canonique `FAULT_OPERATORS` (nouveau module `bin/lib/faults.js`), même forme qu'un opérateur de `MUTATION_OPERATORS` (`id`, `pattern`, `mutate`) plus `label` (nom lisible en français) et `mechanism` (une phrase). Opérateurs JS livrés :
  - `await-removal` : retire un `await` (`await x` → `x`) ;
  - `throw-to-return` : `throw <expr>` → `return` (l'erreur disparaît) ;
  - `release-removal` : supprime un appel `<x>.release()` (client de pool jamais rendu) ;
  - `logical-operator` : `&&` ↔ `||` ;
  - `nullish-to-or` : `??` → `||` (un `0` ou `""` légitime remplacé par la valeur par défaut).
- Champ de pack `faults` dans `bin/lib/stacks/javascript.js` ; absent ailleurs (`c.js`, `generic.js`).
- `break` tire parmi les sites des `faults` et des `mutators` du pack. Les sites `faults` passent en premier dans le tirage ; repli sur `mutators` si aucun site sémantique n'est détectable en 20 essais. Les niveaux 1, 2, 3 gardent leur sens.
- Le record secret garde l'id de l'opérateur. `--resolve` et `--giveup` affichent `label` et `mechanism` avec le site.
- `mutate` n'utilise jamais `faults` : ses verdicts sur un projet existant sont inchangés.
- Mêmes protections que 10.04 : chaînes et commentaires exclus (`stripStringsAndComments`), verrou, restauration octet par octet, détectabilité prouvée par un checkpoint qui tombe.

## Acceptance Criteria

- [ ] Given un fichier `src/a.js` contenant `const r = await f();` couvert par un checkpoint, when `break --level 1` (générateur fixé sur ce site), then la ligne devient `const r = f();` et l'incident est actif.
- [ ] Given chacun des cinq opérateurs et une ligne d'exemple, when on applique `mutate` de l'opérateur, then le texte produit est celui attendu (table de cas, y compris un cas qui ne doit pas matcher par opérateur, par exemple `await` dans une chaîne).
- [ ] Given un projet sans site sémantique détectable mais avec un site `comparison-operator` détectable, when `break`, then l'incident porte sur le site `comparison-operator`.
- [ ] Given un incident `await-removal` réparé, when `break --resolve`, then la sortie contient « await oublié » et la phrase de mécanisme.
- [ ] Given un projet de test dont `mutate` donne N mutants avant la story, when `mutate` après la story, then il donne les mêmes N mutants, mêmes ids d'opérateurs.
- [ ] Given un pack sans champ `faults`, when `break`, then le comportement est celui de 10.04 (aucune erreur).

## Edge Cases

- `release-removal` sur une ligne qui ne contient que l'appel : la ligne devient vide, pas supprimée (les numéros de ligne restent stables pour la comparaison `exact`).
- `throw-to-return` dans une fonction fléchée à expression : non matché si la ligne n'est pas une instruction (`throw` en début d'instruction seulement).
- `logical-operator` sur `&&=`/`||=` : exclus.
- Fichiers `.tsx`/`.jsx` : mêmes exclusions que `comparison-operator` si un opérateur ne peut pas distinguer le balisage.

## Out of Scope

- Pannes multi-lignes (un `catch` vide, un `finally` retiré) : pas sûres en remplacement ligne à ligne, différées.
- Opérateurs C et Go.
- Fuseau horaire, clé de cache incomplète, retry sans backoff : demandent une connaissance du domaine, pas un motif.
