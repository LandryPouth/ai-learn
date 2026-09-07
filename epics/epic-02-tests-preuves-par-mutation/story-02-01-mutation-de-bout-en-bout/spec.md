# Story 02.01 — Mutation de bout en bout

## Goal

Faire exister `ai-learn mutate --phase <id>` de bout en bout avec **un seul
opérateur, en dur** : casser une ligne du code de l'apprenant, lancer le
checkpoint de la phase, constater si le test le remarque, et **toujours**
restaurer le fichier original — que le mutant ait survécu ou non.

## User Value

L'apprenant voit, pour la première fois, la différence mécanique entre « mon test
est passé » et « mon test protège vraiment ce code ». C'est le squelette qui
traverse toute la chaîne (détection → mutation → exécution → restauration →
rapport) sur lequel chaque story suivante s'appuie ; sans lui, la banque
d'opérateurs (02-02) ou le blocage `verify` (02-03) n'auraient rien à généraliser.

## Context

Rien n'existe encore : ni `bin/lib/mutate.js`, ni commande `mutate` dans
`bin/ai-learn.js`. Le modèle à suivre est `bin/lib/norm.js` (moteur heuristique
zéro-dépendance, scope `learnerFiles`, commande CLI autonome) et
`bin/lib/verify.js#runCommand` (exécution d'une commande shell avec capture de
sortie et code de sortie — le même mécanisme sert de « test tueur » ici).

L'opérateur choisi pour ce squelette doit être : détectable sans parseur réel
(comme `norm.js` le fait pour les fonctions), présent dans la plupart des petits
projets JS/TS dès la phase 0, et sans ambiguïté à restaurer. Un bon candidat :
l'inversion d'un littéral booléen (`true` → `false` et inversement) hors chaîne
et commentaire — un seul type de site, une seule transformation, une réversibilité
triviale (ré-écrire l'octet original).

## Requirements

- [x] `ai-learn mutate --phase <id>` détecte, dans le périmètre `learnerFiles`
      (via `loadGuardConfig`, jamais un glob en dur), la première occurrence
      mutable d'un littéral booléen hors chaîne/commentaire
      (`norm.js#stripStringsAndComments` réutilisé, pas réécrit).
- [x] La commande sauvegarde le fichier original avant toute écriture, applique
      la mutation, lance `phase.checkpoint` (même mécanisme que
      `verify.js#runCommand`), puis restaure **inconditionnellement** le fichier
      original — succès, échec ou exception pendant l'exécution du test.
- [x] Le rapport affiche `fichier:ligne — opérateur — SURVÉCU` (le test est passé
      malgré la mutation, donc n'a rien détecté) ou `fichier:ligne — opérateur —
      TUÉ` (le test a échoué face au mutant, donc l'a détecté).
- [x] Code de sortie 1 si le mutant a survécu, 0 s'il a été tué.
- [x] Aucun site mutable trouvé dans le périmètre → succès explicite (« aucun
      mutant à tester »), exit 0 — jamais un échec silencieux ni une erreur.
- [x] Une commande de checkpoint absente sur la phase ciblée produit la même
      erreur que `verify` (« Phase N a no checkpoint command »).
- [x] Une exécution interrompue par une erreur inattendue restaure quand même le
      fichier avant de faire remonter l'erreur (aucun `catch` qui avale la
      restauration).

## Acceptance Criteria

- [x] Given une phase avec un checkpoint dont le test ne couvre pas un littéral
      booléen du code, when `ai-learn mutate --phase <id>` tourne, then le
      rapport affiche `SURVÉCU` pour ce site et le code de sortie est 1.
- [x] Given une phase avec un checkpoint dont le test couvre ce littéral (le test
      échoue si on l'inverse), when `ai-learn mutate --phase <id>` tourne, then
      le rapport affiche `TUÉ` et le code de sortie est 0.
- [x] Given une mutation appliquée puis testée, when la commande se termine
      (succès ou échec du mutant), then le fichier sur disque est bit-à-bit
      identique à son état avant la commande.
- [x] Given une commande de test qui lève une exception ou dépasse le timeout,
      when `ai-learn mutate --phase <id>` tourne, then le fichier est quand même
      restauré avant que la commande ne se termine.
- [x] Given une phase dont le périmètre `learnerFiles` ne contient aucun littéral
      booléen hors chaîne/commentaire, when `ai-learn mutate --phase <id>` tourne,
      then la commande annonce l'absence de site mutable et sort en 0.
- [x] Given une phase sans `checkpoint` déclaré, when `ai-learn mutate --phase <id>`
      tourne, then la commande échoue avec le même message que `verify` pour ce cas.
- [x] Given un littéral booléen à l'intérieur d'une chaîne ou d'un commentaire,
      when `ai-learn mutate --phase <id>` tourne, then ce site n'est jamais
      choisi comme mutant.

## Edge Cases

- [x] Fichier binaire dans le périmètre `learnerFiles` — jamais candidat à la
      mutation, ignoré comme `norm.js` le fait déjà pour ses propres candidats.
- [x] Fichier vide ou sans aucun `true`/`false` — traité comme « aucun site »,
      pas une erreur.
- [x] `learnerFiles` personnalisé dans `.ai-learn/guard.json` — le périmètre est
      lu via `loadGuardConfig`, jamais un `src/**` en dur.
- [x] Le checkpoint lui-même échoue déjà (sans mutation) — signaler clairement
      que le test était déjà rouge avant mutation, ne pas le compter comme
      « mutant tué » (un test déjà cassé ne prouve rien).
- [x] Deux occurrences `true`/`false` dans le même fichier — ce squelette n'en
      mute qu'une (la première rencontrée dans l'ordre `walkSources`, trié), les
      stories suivantes généraliseront à plusieurs mutants.
- [x] Le process est tué (`kill -9`) pendant la fenêtre mutée — hors scope
      testable en unitaire, documenté comme risque résiduel assumé (voir
      `index.md` Risks) ; un backup orphelin détecté par un `mutate` suivant sera
      traité en 02-02, pas ici.

## UX Notes

Le vocabulaire du rapport doit être immédiatement lisible sans jargon de
mutation-testing : « SURVÉCU » doit se lire comme un problème (le test ne
protège pas ce code), « TUÉ » comme un succès (le test protège ce code) — à
l'inverse du réflexe naturel où « survivre » sonnerait positif. Une ligne
d'explication courte sous le rapport doit lever cette ambiguïté la première
fois.

## Dependencies

Aucune dans cet epic — première story, squelette de bout en bout. Dépend
implicitement de l'epic 01 (le modèle `phase.checkpoint`/`runCommand` déjà en
place, aucune modification requise ici).

## Out of Scope

- [ ] Plusieurs opérateurs / banque par stack — story 02-02.
- [ ] Muter plusieurs sites en une seule commande — story 02-02.
- [ ] Blocage dans `verify` — story 02-03.
- [ ] Détection et réparation d'un backup orphelin laissé par un crash — story 02-02.
- [ ] Toute sortie `--json`.
