# Plan — Story 02.01

## Implementation Context

Fichiers probables :

- `bin/lib/mutate.js` (nouveau) — moteur : détection du site mutable, application
  du mutant, isolation (backup/restore), exécution du test, rapport, commande CLI.
  Structure calquée sur `bin/lib/norm.js` : une passe de détection réutilisable,
  une commande CLI mince en bas de fichier (`mutateCommand`), `module.exports`
  qui expose les fonctions internes pour les tests unitaires.
- `bin/ai-learn.js` — enregistrement de la sous-commande `mutate`, même schéma
  que `verify`/`norm` (lookup de la phase, `--phase`/`--dir` via `args.js`).
- `bin/lib/args.js` — réutiliser `getFlagValue`/le parseur partagé posé par
  l'epic 01 (story 01-05) pour `--phase` et `--dir`, ne pas réimplémenter un
  parsing ad hoc.
- `test/mutate.test.js` (nouveau).

Ancres de recherche :

- `norm.js#stripStringsAndComments` — à réutiliser tel quel (import), jamais
  dupliqué ni réécrit.
- `verify.js#runCommand` — même signature `(command, cwd, { timeoutMs })`, à
  réutiliser directement pour exécuter `phase.checkpoint` contre le mutant.
- `verify.js#verifyCommand` (lignes ~77-96) — le message d'erreur exact pour
  « pas de checkpoint » à répliquer identiquement.
- `loadGuardConfig`, `matchesLearnerPath` (`guard.js`) — périmètre des fichiers
  mutables, identique à `norm.js#normProject`.
- `walkSources` (`scan.js`) — liste triée des fichiers candidats, déjà utilisée
  par `norm.js` pour un scope stable et portable.

Mode d'exécution :

- `STANDARD`

Scout pre-step :

- `no` — le moteur miroir (`norm.js`) et le point d'exécution (`verify.js#runCommand`)
  sont identifiés ; aucune découverte transverse nécessaire.

À éviter sauf nécessité :

- `scan.js` (consommer `walkSources`/`stripStringsAndComments` via `norm.js`,
  ne pas dupliquer leur logique dans `mutate.js`)
- `guard.js` (lire `loadGuardConfig`, ne jamais redéfinir `learnerFiles`)
- `check.js`, `status.js`, `verify.js` (aucune intégration dans ce squelette —
  stories 02-03/02-04)
- `bin/lib/stacks/*.js` (aucun champ `mutators` dans cette story — 02-02)

## Technical Notes

**Détection du site mutable.** Réutiliser `stripStringsAndComments(source)` de
`norm.js` (déjà exporté) pour obtenir une version « blanchie » où chaînes et
commentaires sont remplacés par des espaces de même longueur (lignes préservées).
Chercher ensuite le premier `\btrue\b` ou `\bfalse\b` dans cette version blanchie,
avec des limites de mot (`\b`) pour ne pas matcher `truely`/`falsey`. La position
(index, ligne) se calcule sur le texte blanchi, mais **l'écriture du mutant se
fait sur le texte original** (mêmes indices : `stripStringsAndComments` préserve
la longueur et les retours à la ligne).

**Balayage multi-fichiers.** Itérer les fichiers de `walkSources` filtrés par
`matchesLearnerPath(learnerFiles)`, triés par chemin normalisé (même ordre que
`norm.js#normProject` et `source-hash.js`) ; s'arrêter au premier fichier qui
contient un site mutable. La story ne mute qu'un seul site au total (voir Out of
Scope de `spec.md`).

**Isolation.** Séquence stricte :
1. `fs.readFileSync(file, "utf8")` → conserver le contenu original en mémoire.
2. Écrire le contenu muté avec `fs.writeFileSync`.
3. `runCommand(phase.checkpoint, dir)` (import direct de `verify.js`).
4. **Dans un `finally`** : ré-écrire le contenu original, quoi qu'il arrive
   (succès, échec, exception du `runCommand` lui-même). Ne jamais placer la
   restauration après un `return` ou dans le seul chemin de succès.

**Verdict.** Le mutant est **tué** si `runCommand` renvoie `ok: false` (le
checkpoint échoue face au mutant — le test a détecté le problème). Il **survit**
si `runCommand` renvoie `ok: true` (le checkpoint passe malgré la mutation — rien
ne l'a détecté). Avant de muter quoi que ce soit, lancer une fois le checkpoint
sur le code non muté : s'il échoue déjà, sortir immédiatement avec un message
explicite (« le test était déjà rouge avant toute mutation ») plutôt que de
produire un verdict trompeur.

**Code de sortie.** `1` si le mutant a survécu, `0` s'il a été tué ou si aucun
site mutable n'a été trouvé, `1` si le checkpoint était déjà rouge avant
mutation (même sémantique que « verify non-skippable par omission » de l'epic 01
— un checkpoint rouge n'est jamais un succès silencieux).

## Decisions

- Décision : la mutation choisie pour ce squelette est l'inversion d'un littéral
  booléen (`true`/`false`), pas un opérateur arithmétique ou de comparaison.
  - Raison : détection triviale par expression régulière sur texte blanchi (pas
    besoin du parseur brace de `norm.js`), réversibilité garantie sans ambiguïté
    de longueur de texte, présent dès les phases les plus simples.
  - Conséquence : la story 02-02 devra choisir une stratégie de détection plus
    riche (probablement calquée sur `detectFunctionsBrace`) pour les opérateurs
    arithmétiques/de comparaison — assumé, hors scope ici.
- Décision : le test tueur est directement `phase.checkpoint`, exécuté via le
  `runCommand` déjà écrit par `verify.js` (import, pas duplication).
  - Raison : verrouillé dans `index.md` — deux implémentations de « lancer une
    commande shell et capturer son résultat » divergeraient inévitablement.
  - Conséquence : `mutate.js` a une dépendance directe sur `verify.js`
    (`require("./verify")`) — à vérifier qu'elle ne recrée pas de cycle
    (`verify.js` n'importe pas `mutate.js`, donc aucun risque).
- Décision : un mutant à la fois, jamais un balayage complet du fichier en une
  commande.
  - Raison : la story doit rester un squelette minimal ; muter plusieurs sites
    d'affilée introduit la question de l'ordre et du cumul d'échecs, hors scope
    avant la banque d'opérateurs (02-02).
  - Conséquence : le rapport de cette story a toujours 0 ou 1 ligne — normal,
    pas un bug.

## Test Plan

Unitaire (`test/mutate.test.js`), fonctions pures/quasi-pures :

- [ ] Détection : un `true` hors chaîne/commentaire est repéré, position et ligne
      correctes.
- [ ] Détection : un `true` à l'intérieur d'une chaîne (`"true"`) n'est jamais
      choisi.
- [ ] Détection : un `false` à l'intérieur d'un commentaire (`// false`) n'est
      jamais choisi.
- [ ] Détection : `truely`/`falsey` ne matchent jamais (limites de mot).
- [ ] Détection : aucun littéral booléen dans le fichier → aucun site.
- [ ] Application : le mutant appliqué inverse exactement l'octet ciblé, rien
      d'autre dans le fichier ne change.
- [ ] Restauration : après application + restauration, le fichier est identique
      (comparaison de buffer, pas seulement de texte) à l'original.
- [ ] Restauration : si la fonction qui exécute le test lève une exception, le
      fichier est quand même restauré (simuler un `runCommand` qui throw).

Intégration (`test/mutate.test.js`, `test/helpers.js#tmpProject`) :

- [ ] Projet temporaire avec un test qui NE couvre PAS le littéral muté → rapport
      `SURVÉCU`, exit 1.
- [ ] Projet temporaire avec un test qui couvre le littéral muté (échoue si
      inversé) → rapport `TUÉ`, exit 0.
- [ ] Projet temporaire sans aucun littéral booléen dans le périmètre →
      « aucun site mutable », exit 0.
- [ ] Projet temporaire dont le checkpoint échoue déjà avant mutation → message
      explicite, exit 1, aucune mutation appliquée.
- [ ] Phase sans `checkpoint` déclaré → même message d'erreur que `verify`.
- [ ] `learnerFiles` personnalisé (`.ai-learn/guard.json`) → seul ce périmètre
      est balayé.

## Acceptance Traceability

| Acceptance criterion | Test proving it (`file::test`) |
| --- | --- |
| Test qui ne couvre pas le mutant → SURVÉCU, exit 1 | `test/mutate.test.js::rapporte SURVÉCU quand le test ne détecte pas le mutant` |
| Test qui couvre le mutant → TUÉ, exit 0 | `test/mutate.test.js::rapporte TUÉ quand le test détecte le mutant` |
| Fichier restauré bit-à-bit après la commande | `test/mutate.test.js::restaure le fichier original après un mutant survécu` et `::…tué` |
| Restauration garantie même sur exception du test | `test/mutate.test.js::restaure le fichier même si runCommand lève une exception` |
| Aucun site mutable → succès explicite | `test/mutate.test.js::signale l'absence de site mutable sans erreur` |
| Pas de checkpoint → même erreur que verify | `test/mutate.test.js::échoue avec le message de verify quand la phase n'a pas de checkpoint` |
| Littéral en chaîne/commentaire jamais choisi | `test/mutate.test.js::ignore un littéral booléen dans une chaîne` et `::…un commentaire` |

## Commands

- Command: `npm test`
  - Expected: la suite complète passe (tests existants + nouveaux `mutate.test.js`).
- Command: `node bin/ai-learn.js mutate --phase 0 --dir <projet-temporaire>`
  - Expected: rapport `TUÉ`/`SURVÉCU` cohérent avec le test du projet, fichier
    restauré après coup (vérifiable par `git status`/`diff` sur le projet
    temporaire).

## Rollback

Retirer `bin/lib/mutate.js`, l'enregistrement de la sous-commande `mutate` dans
`bin/ai-learn.js`, et `test/mutate.test.js`. Aucune donnée persistante n'est
créée par cette story (pas de config, pas d'évidence) — un `git revert` du commit
suffit.
