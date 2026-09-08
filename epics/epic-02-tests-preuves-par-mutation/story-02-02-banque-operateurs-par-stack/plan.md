# Plan — Story 02.02

## Implementation Context

Fichiers probables :

- `bin/lib/mutate.js` — généraliser `findFirstSite` (02-01, corrigée en
  post-review pour filtrer sur `ALL_SOURCE_EXTS` et exclure `testRels` via
  `detectTests` — voir `## Result` de 02-01) en `detectAllSites(source,
  mutators)` : mêmes deux filtres à conserver telles quelles, itérer tous les
  fichiers (pas de premier fichier qui gagne) et tous les opérateurs de la
  banque (pas un seul en dur), boucler mutant par mutant avec restauration
  entre chaque. Ajouter la détection/réparation de backup orphelin au début de
  `mutateCommand`.
- `bin/lib/stacks/c.js`, `bin/lib/stacks/generic.js`, `bin/lib/stacks/javascript.js`
  — ajout du champ `mutators`, à côté du champ `norm` existant, même style
  d'export (voir `javascript.js:141-146` pour le gabarit `norm`).
- `bin/lib/mutate.js` (config) — `mutateConfigPath`, `loadMutateConfig`,
  `ensureMutateConfig`, calqués fonction par fonction sur
  `norm.js#normConfigPath`/`loadNormConfig`/`ensureNormConfig`.
- `bin/lib/init.js` (≈ ligne 120-135, section norm config) — appel symétrique à
  `ensureMutateConfig` juste après `ensureNormConfig`.
- `bin/lib/update.js` (≈ ligne 200-213, section norm config) — même symétrie.
- `test/mutate.test.js` (étendu), `test/init.test.js`, `test/update.test.js`
  (cas `.ai-learn/mutate.json`).

Ancres de recherche :

- `resolveThresholds` (`norm.js`) — gabarit exact du merge stack → override →
  fallback à reproduire pour les opérateurs actifs.
- `ensureNormConfig`, `loadNormConfig` (`norm.js`) — à dupliquer en
  `ensureMutateConfig`/`loadMutateConfig`, jamais réutiliser directement (le
  schéma diffère : opérateurs actifs + `maxMutantsPerRun`, pas des seuils).
- `stackKey`, `loadStack`, `detectStack` (`scan.js`) — déjà utilisés par
  `norm.js`, même mécanisme pour résoudre la stack de `mutate.js`.
- Le squelette écrit en 02-01 (`findFirstSite`, `applyMutant`,
  `restoreOriginal`, `runCommand`) — étendre, ne pas réécrire.
- `findFirstSite` (`mutate.js:58-`) — lire en entier avant de généraliser :
  le filtre `ALL_SOURCE_EXTS` et l'exclusion `testRels`/`detectTests`
  (ajoutés en post-review de 02-01) doivent survivre tels quels dans
  `detectAllSites`, pas seulement le chemin heureux du premier site trouvé.

Mode d'exécution :

- `STANDARD`

Scout pre-step :

- `no` — les trois stack packs et les deux points de câblage (`init.js`,
  `update.js`) sont nommés avec leurs numéros de ligne approximatifs.

À éviter sauf nécessité :

- `scan.js` (consommer `detectStack`/`loadStack`, ne pas y ajouter la notion de
  mutation)
- `norm.js` (lire son gabarit pour le reproduire, ne pas le modifier — les deux
  mécanismes restent indépendants bien que symétriques)
- `verify.js`, `check.js`, `status.js` (aucune intégration ici — 02-03/02-04)

## Technical Notes

**Forme d'un opérateur.** Chaque entrée de `mutators` est
`{ id, pattern, mutate(matchText) → mutatedText }` : `pattern` une regex globale
appliquée au texte blanchi (`stripStringsAndComments`), `mutate` une fonction
pure qui transforme le texte matché en son mutant. Un changement de longueur
n'a pas besoin de recalcul d'index : tous les sites d'un fichier sont
précalculés une seule fois contre son contenu pristine, et le cycle
backup → mute → test → restore de chaque site restaure ce fichier à
l'identique avant de passer au site suivant — aucune mutation n'est jamais
active en même temps qu'une autre, donc aucun index ultérieur ne peut être
décalé par un site déjà traité. L'opérateur de comparaison suit donc la
mutation de frontière (« boundary condition ») demandée par `spec.md` :
`<` ↔ `<=`, `>` ↔ `>=` — la mutation classique qui révèle une erreur de
condition limite (`for (i = 0; i <= n; …)` vs `< n`), plutôt qu'une simple
inversion de direction (`<` ↔ `>`), moins représentative des bugs réels
qu'un apprenant écrit.

**Ordre de traitement.** Fichiers dans l'ordre de `walkSources` (trié,
portable), sites dans l'ordre de première occurrence dans le fichier blanchi.
Chaque site suit exactement le cycle de 02-01 : backup → mute → test → restore
→ verdict, avant de passer au site suivant. Jamais deux mutations actives en
même temps, même sur des fichiers différents (simplicité avant tout — la
mutation d'un projet d'apprentissage reste petite).

**Backup orphelin.** Le backup de 02-01 est conservé en mémoire (pas de fichier
`.bak` sur disque) tant que le process vit — un `kill -9` ne laisse donc
*aucune trace de backup à relire*, seulement le fichier muté lui-même resté en
place. Pour permettre une réparation au run suivant sans backup externe, cette
story change de stratégie : écrire un fichier `.ai-learn/mutate.lock.json`
`{ file: <chemin relatif>, original: <contenu> }` juste avant l'étape "mute" et
le supprimer juste après la restauration réussie. Un `mutate` qui démarre et
trouve ce fichier restaure `original` dans `file`, logue le message de
réassurance (UX Notes de `spec.md`), supprime le lock, puis continue son propre
run normalement.

**Score de mutation.** `tués / total`, arrondi à l'entier le plus proche pour
l'affichage, gardé en flottant dans un usage interne futur (evidence de 02-03).
`total = 0` (aucun mutant) est un cas spécial affiché comme « aucun site
mutable — rien à mesurer », jamais « 0 % » ou « 100 % », qui seraient tous deux
trompeurs.

**Config `.ai-learn/mutate.json`.**
```json
{
  "version": 1,
  "mutators": ["boolean-literal", "comparison-operator"],
  "maxMutantsPerRun": 50,
  "ignore": []
}
```
`ignore` suit le même glob que `norm.json#ignore` (`matchesLearnerPath`).

## Decisions

- Décision : le lock de récupération (`.ai-learn/mutate.lock.json`) remplace un
  fichier `.bak` sur disque à côté du fichier muté.
  - Raison : un `.bak` à côté du fichier source serait lui-même dans le
    périmètre `learnerFiles` selon l'extension, risquant d'être lui-même
    candidat à un futur balayage ; un fichier dédié sous `.ai-learn/` reste
    hors du périmètre d'apprentissage par construction (même répertoire que
    `norm.json`, `guard.json`, `predictions.json`).
  - Conséquence : la restauration après crash dépend de la présence du
    répertoire `.ai-learn/` — déjà garanti par `init`, aucune régression.
- Décision : l'opérateur de comparaison mute par frontière (`<` ↔ `<=`,
  `>` ↔ `>=`), pas par inversion de direction (`<` ↔ `>`), malgré le
  changement de longueur que cela introduit.
  - Raison : `spec.md` (Requirements) demande explicitement cette paire — une
    mutation de frontière est le mutateur classique qui révèle une erreur de
    condition limite, exactement le type de bug que l'epic cible (voir Goal).
    Le changement de longueur ne pose aucun problème d'index : chaque site est
    précalculé contre le contenu pristine du fichier, et le fichier est
    restauré à l'identique avant de traiter le site suivant (voir Technical
    Notes), donc aucun index ultérieur n'est jamais décalé par une mutation en
    cours.
  - Conséquence : un futur opérateur à longueur variable (ex. `!=` ↔ `===`)
    n'a besoin d'aucune précaution supplémentaire — le cycle un-mutant-à-la-fois
    rend la longueur du texte muté non pertinente pour la correction des index.
- Décision : `maxMutantsPerRun` est un plafond dur avec message explicite, pas
  un échantillonnage aléatoire.
  - Raison : un plafond déterministe (les N premiers sites dans l'ordre trié)
    garde le comportement reproductible entre deux runs sur le même code — un
    échantillonnage aléatoire ferait varier le score de mutation sans que le
    code ait changé.
  - Conséquence : deux fichiers volumineux mutés dans le même run peuvent voir
    le second jamais atteint — signalé clairement, jamais silencieux.
- Décision (revue post-implémentation) : le lock de récupération reste un
  fichier unique désignant un seul `{ file, original }`, jamais une liste.
  - Raison : le cycle un-mutant-à-la-fois (voir Technical Notes) garantit
    qu'un seul fichier est jamais muté à un instant donné, dans n'importe quel
    run — donc deux fichiers mutés-puis-abandonnés ne peuvent jamais coexister
    au moment d'un crash. L'edge case « deux backups orphelins simultanés »
    de `spec.md` est structurellement impossible sous ce design, pas seulement
    non géré.
  - Conséquence : un lock file singleton suffit ; aucune migration vers une
    liste n'est jamais nécessaire tant que la contrainte un-mutant-à-la-fois
    tient.
- Décision (revue post-implémentation) : l'exclusion du `>` d'un opérateur
  composé est étendue de `=>` (fonction fléchée JS) à `->` (pointeur/struct C)
  via le même lookbehind négatif (`(?<![=-])>`) ; les fichiers `.jsx`/`.tsx`
  sont exclus de `comparison-operator` dans leur intégralité (le
  `boolean-literal` reste actif) plutôt que de tenter d'exclure un `<`/`>` de
  balise JSX au cas par cas.
  - Raison : une revue (`/flow-review`) a montré par un test manuel que
    `ptr->value` (C) était détecté comme site de comparaison — `->` n'était
    pas dans le lookbehind d'origine, qui n'excluait que `=>`. Un projet C
    utilisant `mutators: ["boolean-literal", "comparison-operator"]` (le
    défaut de `c.js`) produisait donc un mutant syntaxiquement invalide sur
    quasiment tout accès à un champ de structure. De même, `<div>`/`</div>`
    (JSX, activé pour `.jsx`/`.tsx` via le pack `javascript.js`) n'a aucun
    marqueur adjacent univoque comme `=`/`-` à exclure par lookbehind — un
    `<`/`>` de balise et un `<`/`>` de comparaison sont syntaxiquement
    indissociables sans un vrai analyseur, hors de portée de cet outil
    zéro-dépendance (voir en-tête de `norm.js` : sous-détecter plutôt que
    deviner). Exclure le fichier entier de cet opérateur est donc la
    correction la plus sûre, cohérente avec cette discipline.
  - Conséquence (risque résiduel accepté) : un générique TypeScript sur un
    `.ts` non-JSX (`Array<string>`, `function identity<T>(x: T): T`) reste mal
    détecté comme site de comparaison — fermer ce cas précisément nécessiterait
    un vrai analyseur syntaxique. Documenté et épinglé par un test
    (`test/mutate.test.js::detection: TypeScript generic angle brackets are a
    known, accepted residual false-positive`) plutôt que silencieusement
    laissé de côté ; un futur resserrement (heuristique plus fine, ou parseur)
    reste possible mais hors scope de cette story.

## Test Plan

Unitaire (`test/mutate.test.js`) :

- [ ] Opérateur de comparaison : `a < b` → mutant `a <= b`, position correcte.
- [ ] Opérateur de comparaison : `>=` → `>`, et `=>` (fonction fléchée) n'est
      jamais reconnu comme un site — seul un `<`/`<=`/`>`/`>=` isolé compte.
- [ ] Plusieurs sites dans un même fichier → chacun restauré avant le suivant
      (fichier identique à l'original entre deux mutations consécutives).
- [ ] `maxMutantsPerRun` respecté : un fichier avec plus de sites que le
      plafond s'arrête au plafond, le signale.
- [ ] Score de mutation : 3 tués / 4 total → 75 % affiché.
- [ ] Score de mutation : 0 site → message dédié, pas de pourcentage.
- [ ] Lock de récupération : un `.ai-learn/mutate.lock.json` présent au
      démarrage restaure le fichier original avant de continuer.
- [ ] Lock de récupération : le fichier original visé par le lock a été
      supprimé entre-temps → restauration le recrée sans planter.
- [ ] Un fichier de prose (`.md`) et un fichier de test du périmètre restent
      exclus de `detectAllSites` même quand plusieurs autres fichiers du
      périmètre ont des sites valides (régression du fix post-review de
      02-01, étendue au mode multi-sites).
- [ ] (revue post-implémentation) Le `->` d'un accès pointeur/struct C n'est
      jamais confondu avec un site de comparaison ; une vraie comparaison sur
      la même ligne qu'un `->` reste détectée.
- [ ] (revue post-implémentation) Un fichier `.jsx`/`.tsx` ne produit aucun
      site `comparison-operator` (balises JSX), `boolean-literal` restant
      actif sur ce même fichier.
- [ ] (revue post-implémentation) Un générique TypeScript sur un `.ts`
      non-JSX est épinglé comme faux positif accepté (test qui documente le
      risque résiduel plutôt que de le cacher).

Intégration (`test/mutate.test.js`, `test/init.test.js`, `test/update.test.js`) :

- [ ] `ai-learn init` sur un projet JS crée `.ai-learn/mutate.json` avec les
      opérateurs de `javascript.js`.
- [ ] `ai-learn update` sur un projet dont `.ai-learn/mutate.json` existe déjà
      (valeurs personnalisées) ne le modifie jamais.
- [ ] Projet avec 3 sites mutables (1 booléen, 2 comparaisons), 2 tués/1 survécu
      → rapport à 3 lignes, score 67 %, exit 1 (au moins un survécu).

## Acceptance Traceability

| Acceptance criterion | Test proving it (`file::test`) |
| --- | --- |
| Comparaison mutée par frontière sur `javascript.js`, `=>` jamais confondu | `test/mutate.test.js::mute un opérateur de comparaison par frontière` |
| Tous les sites traités, un par un | `test/mutate.test.js::traite chaque site séquentiellement avec restauration entre chacun` |
| Stack sans opérateur dédié → succès explicite | `test/mutate.test.js::aucun site mutable reste un succès explicite` |
| Backup orphelin restauré au démarrage | `test/mutate.test.js::restaure un lock orphelin au démarrage` |
| `.ai-learn/mutate.json` créé une fois par init/update | `test/init.test.js::crée mutate.json` et `test/update.test.js::ne réécrit jamais mutate.json existant` |
| Score de mutation affiché correctement | `test/mutate.test.js::calcule le score de mutation` |
| Fichiers de prose/test exclus en mode multi-sites | `test/mutate.test.js::detectAllSites exclut les fichiers non-source et de test` |

## Commands

- Command: `npm test`
  - Expected: la suite complète passe.
- Command: `node bin/ai-learn.js init --dir <projet-temporaire>` puis vérifier
  `.ai-learn/mutate.json`
  - Expected: fichier créé avec les opérateurs de la stack détectée.

## Rollback

Retirer `mutators` des trois stack packs, `ensureMutateConfig`/`loadMutateConfig`
de `mutate.js` et leurs appels dans `init.js`/`update.js`, revenir au moteur
mono-opérateur/mono-site de 02-01. `.ai-learn/mutate.json` déjà créé chez un
apprenant reste un fichier inoffensif non lu par le code revenu en arrière —
aucune migration nécessaire pour revenir en arrière.
