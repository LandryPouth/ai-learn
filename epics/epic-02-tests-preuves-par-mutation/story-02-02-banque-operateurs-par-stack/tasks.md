# Tasks — Story 02.02

## Status: done

## Pre-Implementation

- [x] Lire `plan.md` (Implementation Context) de cette story et le `## Result`
      de story-02-01 (moteur existant à généraliser)
- [x] Relire `bin/lib/norm.js#resolveThresholds`/`ensureNormConfig`/`loadNormConfig`
      en entier (gabarit à reproduire pour la config mutation)
- [x] Relire les trois stack packs (`c.js`, `generic.js`, `javascript.js`) pour
      le style d'export du champ `norm` à reproduire pour `mutators`

## Implementation Tasks

- [x] Ajouter `mutators` aux trois stack packs (au moins booléen + comparaison
      pour `javascript.js`/`c.js`, booléen seul pour `generic.js`)
- [x] Généraliser la détection de `mutate.js` (`findFirstSite`) en
      `detectAllSites(source, mutators)` — conserver intact le filtre
      `ALL_SOURCE_EXTS` et l'exclusion `testRels` ajoutés en post-review de
      02-01, pas seulement le chemin du premier site
- [x] Boucler tous les fichiers/sites du périmètre, un mutant à la fois, avec
      restauration entre chaque
- [x] Écrire `mutateConfigPath`/`loadMutateConfig`/`ensureMutateConfig`
- [x] Câbler `ensureMutateConfig` dans `init.js` et `update.js`, à côté de
      `ensureNormConfig`
- [x] Implémenter le lock de récupération (`.ai-learn/mutate.lock.json`) :
      écriture avant mutation, suppression après restauration réussie,
      détection/réparation au démarrage de `mutateCommand`
- [x] Appliquer `maxMutantsPerRun` et le score de mutation dans le rapport

## Testing Tasks

- [x] Étendre `test/mutate.test.js` (tous les cas du Test Plan de `plan.md`)
- [x] Étendre `test/init.test.js` et `test/update.test.js`
      (cas `.ai-learn/mutate.json`)
- [x] Justifier dans le `## Result` toute modification d'un test existant

## Validation Tasks

- [x] `npm test`
- [x] `node bin/ai-learn.js init --dir <projet-temporaire>` puis inspecter
      `.ai-learn/mutate.json`
- [x] Simuler un lock orphelin à la main (créer le fichier `.ai-learn/mutate.lock.json`
      pointant vers un fichier réel) et vérifier la restauration au run suivant

## Result

**Résumé.** `ai-learn mutate --phase <id>` mute désormais **tous** les sites
mutables du périmètre, avec une banque d'opérateurs par stack pack au lieu de
l'inversion booléenne unique en dur de 02-01. `bin/lib/mutate.js` expose un
registre canonique `MUTATION_OPERATORS` (`boolean-literal`, `comparison-operator`)
dont chaque stack pack (`c.js`, `generic.js`, `javascript.js`) sélectionne un
sous-ensemble d'ids via un champ `mutators`, symétrique du champ `norm`
existant. `.ai-learn/mutate.json` est auto-créé une fois par `init`/`update`
(`ensureMutateConfig`, jamais réécrit), calqué fonction par fonction sur
`ensureNormConfig`/`loadNormConfig`. Un fichier `.ai-learn/mutate.lock.json`
remplace le backup en mémoire de 02-01 : écrit juste avant chaque mutation,
supprimé juste après une restauration réussie, il permet à `mutate` de
détecter et réparer un run interrompu (`kill -9`) au démarrage du run suivant,
avec un message rassurant plutôt qu'une erreur.

**Décision non prévue au plan — sémantique de l'opérateur de comparaison.**
`spec.md` (Requirements) et `plan.md` (Technical Notes/Decisions), tels
qu'écrits par `/flow-plan`, se contredisaient : le premier demandait une
mutation de frontière (`<` ↔ `<=`, `>` ↔ `>=`, un bug classique de condition
limite), le second une inversion de direction (`<` ↔ `>`) au nom d'une
préservation de longueur censée éviter un décalage d'index entre sites. Cette
justification s'est révélée fausse : chaque site est précalculé une seule fois
contre le contenu pristine du fichier, et le cycle backup → mute → test →
restore de chaque site restaure ce fichier à l'identique avant de passer au
suivant — aucun index n'est donc jamais décalé par une mutation déjà traitée,
quelle que soit la longueur du texte muté. Implémenté la mutation de frontière
(`spec.md`, plus proche du bug réel ciblé par l'epic) et corrigé `plan.md` en
conséquence (Technical Notes, Decisions, Test Plan, Acceptance Traceability)
avant d'écrire le code, pour que le plan et le code racontent la même chose.

**Décision non prévue au plan — exclusion de `=>` (fonction fléchée).** Le
pattern de `comparison-operator` (`<=|>=|<|(?<!=)>`) exclut explicitement un
`>` précédé de `=` : sans cela, chaque fonction fléchée JS/TS du périmètre
serait un « site mutable », produisant un mutant qui casse la syntaxe
(`x =< y`) au lieu d'une vraie mutation de comparaison — un faux site qui
aurait pollué le rapport sur pratiquement tout code JS moderne. Non demandé
explicitement par `spec.md`/`plan.md`, mais nécessaire pour que l'opérateur
soit utilisable sur du code réel plutôt qu'un gadget de démo (voir User Value
de `spec.md`).

**Fichiers modifiés.**
- `bin/lib/mutate.js` (réécrit) — `MUTATION_OPERATORS` (banque canonique),
  `detectAllSites`, `findAllSites` (remplace `findFirstSite`),
  `mutateConfigPath`/`loadMutateConfig`/`ensureMutateConfig`,
  `resolveMutators`, `mutateLockPath`/`recoverOrphanLock`, `formatScore`,
  `mutateCommand` réécrit pour le multi-sites/plafond/score/lock.
  `applyMutant`/`restoreOriginal`/`testMutant`/`formatSiteResult` conservés,
  `testMutant` étendu pour écrire/supprimer le lock.
- `bin/lib/stacks/{c,generic,javascript}.js` — champ `mutators` ajouté
  (`["boolean-literal", "comparison-operator"]` pour `c`/`javascript`,
  `["boolean-literal"]` pour `generic`).
- `bin/lib/init.js`, `bin/lib/update.js` — `ensureMutateConfig` câblé à côté
  de `ensureNormConfig`, même contrat (créé une fois, jamais réécrit),
  `update.js` gagne une ligne de log symétrique à celle de `norm.json`.
- `test/mutate.test.js` (réécrit, 18 → 32 tests), `test/init.test.js` (+2
  assertions), `test/update.test.js` (+1 test) — voir Testing Tasks.
- `epics/epic-02-tests-preuves-par-mutation/story-02-02-banque-operateurs-par-stack/{spec,plan}.md` —
  incohérence spec/plan corrigée avant l'implémentation (voir ci-dessus),
  cases d'acceptation cochées.

**Tests existants modifiés.** `test/mutate.test.js` a été réécrit en entier
plutôt qu'étendu en place, parce que l'API publique change structurellement
(`findFirstSite` → `findAllSites`, une fonction qui renvoie 0..N sites au lieu
de 0..1) — chaque test de détection de 02-01 est repris à l'identique dans son
intention (mêmes fixtures, mêmes assertions de fond) mais adapté à la nouvelle
signature. Aucune régression de comportement : les 18 tests de 02-01 ont tous
un équivalent direct dans les 32 nouveaux, plus les cas ajoutés par cette
story (opérateur de comparaison, multi-sites, plafond, lock, config).
`test/init.test.js`/`test/update.test.js` : ajouts uniquement, aucune
assertion existante modifiée.

**Tests exécutés.**
- `node --test test/mutate.test.js` → 32/32, 0 échec.
- `npm test` → 436/436, 0 échec (aucune régression sur la suite existante,
  420 avant cette story).
- `ai-flow verify --story <dir>` → vert. `Coverage: evidence` (3 fichiers de
  test renforcés aux côtés de 6 fichiers de comportement modifiés ; aucun
  rapport de couverture — `lcov.info`/`coverage-final.json` — n'est émis par
  `npm test` dans ce projet, donc `verify` ne peut pas mesurer directement les
  lignes ajoutées).
- Vérification manuelle via un script driver dans le scratchpad (supprimé
  après usage), invoquant le vrai binaire CLI :
  - `node bin/ai-learn.js init --dir <tmp>` sur un projet avec un seul
    `src/index.js` → `.ai-learn/mutate.json` créé avec
    `["boolean-literal", "comparison-operator"]` (stack JavaScript détectée
    par extension dominante, sans `package.json`).
  - `node bin/ai-learn.js mutate --phase 0 --dir <tmp>` sur un fichier à 2
    sites (1 booléen, 1 comparaison) avec un checkpoint fort testant les deux
    frontières → 2 lignes de rapport, les deux `TUÉ`, score 100 %, exit 0.
  - Lock orphelin simulé à la main (fichier muté sur disque + `mutate.lock.json`
    pointant vers le contenu original) → run suivant restaure le fichier
    avant de continuer, message de réassurance affiché, run se termine
    normalement, fichier final identique à l'original (`diff` vide).

**Fix pass post-`/flow-review` (P1).** La revue a trouvé, avec repro à l'appui,
que le pattern `comparison-operator` (`/<=|>=|<|(?<!=)>/`) n'excluait que le
`>` d'une fonction fléchée JS (`=>`), pas celui d'un accès pointeur/struct C
(`->`) — activé par défaut sur `c.js` — ni les chevrons de balise JSX
(`<div>`, activés via `javascript.js` sur `.jsx`/`.tsx`) ni les génériques
TypeScript (`Array<string>`). Sur du code réel (pas seulement les fixtures du
test), une bonne partie des sites détectés par cet opérateur étaient donc de
faux sites produisant un mutant syntaxiquement invalide, gonflant le score de
mutation avec de faux « TUÉ » sans rapport avec la qualité des tests.

Corrections apportées (voir Decisions de `plan.md` pour le détail) :
- Lookbehind étendu à `(?<![=-])>` — exclut `->` en plus de `=>`.
- Fichiers `.jsx`/`.tsx` exclus de `comparison-operator` dans leur intégralité
  (`JSX_EXTS`, filtré par fichier dans `findAllSites`) ; `boolean-literal`
  reste actif sur ces fichiers.
- Risque résiduel accepté et documenté (pas fermé) : un générique TypeScript
  sur un `.ts` non-JSX reste mal détecté — fermer ce cas précisément
  nécessiterait un vrai analyseur, hors de portée de cet outil
  zéro-dépendance. Épinglé par un test dédié plutôt que laissé silencieux.

4 tests ajoutés à `test/mutate.test.js` (32 → 36) : `->` jamais confondu,
vraie comparaison toujours détectée à côté d'un `->` sur la même ligne, JSX
exclu en bloc, générique TS épinglé comme résiduel accepté. `spec.md` (Edge
Cases) mis à jour et coché en conséquence ; `plan.md` (Decisions, Test Plan)
complété avant le fix, même discipline que la correction spec/plan de
l'implémentation initiale.

**Tests exécutés (fix pass).**
- `node --test test/mutate.test.js` → 36/36, 0 échec.
- `npm test` → 440/440, 0 échec (aucune régression).

**Amélioration post-`/flow-review` (P3, non bloquant).** La revue a relevé que
`spec.md` (Requirements) couvre deux cas distincts sous une même phrase
(« aucun opérateur configuré *ou* aucun site mutable trouvé ») mais qu'un seul
des deux avait un test dédié — le second (bank de la stack sans site trouvé)
était testé, pas le premier (`.ai-learn/mutate.json#mutators` explicitement
réduit à `[]`). Le chemin de code est prouvé identique (`resolveMutators`
renvoie `[]` → `findAllSites` renvoie `[]` → succès explicite), donc aucun
risque comportemental, mais un test dédié ferme la traçabilité vis-à-vis de
`spec.md`. Ajouté à `test/mutate.test.js` :
`mutate reports success, exit 0 when .ai-learn/mutate.json explicitly
configures zero operators`.

**Tests exécutés (amélioration).**
- `npm test` → 441/441, 0 échec.

### Rollback Notes

Revenir au moteur mono-opérateur/mono-site de 02-01 : retirer `mutators` des
trois stack packs, `ensureMutateConfig`/`loadMutateConfig`/`resolveMutators`/
`MUTATION_OPERATORS`/le lock de récupération de `mutate.js`, et leurs appels
dans `init.js`/`update.js`. `.ai-learn/mutate.json` et `.ai-learn/mutate.lock.json`
déjà créés chez un apprenant restent des fichiers inoffensifs non lus par le
code revenu en arrière — aucune migration nécessaire. Aucun changement de
schéma persistant ailleurs (`progress.json`, `.ai-learn/norm.json`,
`.ai-learn/guard.json` non touchés).
