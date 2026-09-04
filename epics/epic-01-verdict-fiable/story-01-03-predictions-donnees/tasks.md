# Tasks — Story 01.03

## Pre-Implementation

- [x] Lire `plan.md` (Implementation Context)
- [x] Relire `templates/predictions.md` (format de rendu à reproduire à l'identique)
- [x] Relire la convention de fichier généré : `update.js#PROTOCOL_MARKER` et
      `guard.js#SOLUTIONS_README`

## Implementation Tasks

- [x] Créer `bin/lib/predictions.js` (schéma versionné, `validate`, lecture, écriture, rendu)
- [x] Ajouter la commande d'enregistrement dans `bin/ai-learn.js` + l'aide
- [x] Rendre `docs/plans/predictions.md` depuis les données, avec marqueur généré et
      refus d'écraser un fichier personnalisé
- [x] Échapper le texte rapporté au rendu (pas de fausse entrée `###` fabricable)
- [x] Faire compter `check` par phase, depuis les données quand elles existent
- [x] Rendre le séparateur du parsing hérité tolérant (`[—–-]`)
- [x] Câbler la création dans `init.js` et la rétro-installation dans `update.js`
- [x] Mettre à jour `templates/AGENTS-apprentissage.md` et les commandes `/…` :
      l'agent enregistre la prédiction, il n'édite plus le `.md`

## Testing Tasks

- [x] Créer `test/predictions.test.js` (6 cas)
- [x] Étendre `test/check.test.js` (6 cas)
- [x] Étendre `test/init.test.js`, `test/update.test.js`, `test/cli.test.js`

## Validation Tasks

- [x] `npm test`
- [x] `node bin/ai-learn.js check --root .`
- [ ] Vérifier sur le dogfood Fastify que le journal `.md` hérité est toujours compté
      (pas de checkout Fastify dans ce dépôt — substitué par une reproduction manuelle
      équivalente, voir Result)

## Status: done

## Result

**Résumé.** `.ai-learn/predictions.json` (nouveau module `bin/lib/predictions.js`) est
désormais la source de vérité du journal de prédictions : versionné, validé
structurellement, écrit par la nouvelle commande `ai-learn predict --phase <id>
--prediction "..." [--gaps ...] [--score ...] [--strengths ...] [--weaknesses ...]
[--flash ...] [--corrected ...] [--corrected-by apprenant|IA]`. `docs/plans/predictions.md`
devient un rendu de ces données (en-tête du template + entrées générées), régénéré à
chaque appel de la commande, jamais écrasé s'il ne porte plus le marqueur généré
(`# Journal de prédictions` en première ligne — même convention que
`update.js#PROTOCOL_MARKER` / `guard.js#SOLUTIONS_README`). `check` compte désormais
**par phase** (plus de somme globale qui laissait 6 prédictions sur la phase 0
satisfaire la phase 1), lit les données quand elles existent et valides, retombe sinon
sur le `.md` hérité avec un séparateur tolérant (`[—–-]`), et signale une
`predictions.json` corrompue comme une erreur explicite — jamais un retour silencieux
à zéro. `init` crée le fichier vide pour tout nouveau projet ; `update` le rétro-installe
sur un projet existant, en signalant explicitement quand ça fait basculer la source de
vérité au-dessus d'un `.md` hérité non vide (déjà accepté par la décision verrouillée du
2026-09-01, mais pas silencieusement).

**Décisions prises pendant l'implémentation (au-delà de `plan.md`).**
- **Une seule commande, un seul appel** (`at` et `revealedAt` tous deux à `now`) plutôt
  qu'un flux en deux temps (prédire, puis réveler séparément). `plan.md` note que cette
  story « se contente de stocker fidèlement » les deux horodatages — aucun AC ni edge
  case n'exige un vrai écart entre eux. Un flux à deux appels aurait ajouté une machine
  à états (créer puis mettre à jour une entrée existante) qu'aucune exigence ne demande ;
  la story 01.04, qui rendra cet écart réellement vérifiable, est le bon endroit pour
  décider si cela justifie de rouvrir cette interface.
- **`predictions.json` corrompu retombe quand même sur le `.md` hérité s'il existe**, en
  plus de l'erreur structurelle. Lu littéralement, l'ordre de résolution de `plan.md`
  (« JSON valide ⇒ il fait foi ; sinon `.md` ») s'applique bien ici puisqu'un JSON
  corrompu n'est justement pas « valide » — l'erreur est ce qui rend la corruption non
  silencieuse, la bascule de secours sur le `.md` évite qu'un fichier de données cassé
  fasse perdre tout le suivi des prédictions pendant qu'on le répare.
- **Marqueur de fichier généré = première ligne `# Journal de prédictions`**, inchangée
  du template actuel — tout `predictions.md` existant (y compris hérité, jamais touché
  par une commande `predict`) la porte déjà, donc rétro-compatible sans migration : le
  jour où un projet hérité commence à utiliser `predict`, son `.md` est immédiatement
  éligible à la régénération.

**Fichiers modifiés.**
- `bin/lib/predictions.js` (nouveau) — schéma, validation, lecture/écriture, rendu,
  échappement du texte rapporté (`#` en tête de ligne, retours à la ligne repliés).
- `bin/ai-learn.js` — commande `predict` + aide.
- `bin/lib/check.js` — comptage par phase, source JSON/`.md` résolue explicitement,
  erreur structurelle sur JSON corrompu, `countJournalEntriesByPhase` (nouveau),
  séparateur tolérant sur `countJournalEntries`.
- `bin/lib/init.js` — crée `.ai-learn/predictions.json` vide.
- `bin/lib/update.js` — rétro-installe le fichier, signale le cas `.md` hérité non vide.
- `templates/predictions.md` — avertissement « fichier généré » ajouté sous le titre
  (le titre lui-même, marqueur, est inchangé).
- `templates/AGENTS-apprentissage.md` — le protocole appelle `ai-learn predict` après
  la révélation au lieu de dire d'éditer le `.md` à la main ; l'échappatoire IA passe
  par `--corrected-by IA`.
- `test/predictions.test.js` (nouveau, 14 cas), `test/check.test.js` (+6),
  `test/init.test.js` (+1), `test/update.test.js` (+3), `test/cli.test.js` (+3).

**Tests exécutés.**
- `npm test` → 357/357, 0 échec (332 hérités de 01.01/01.02 + 25 nouveaux).
- `node bin/ai-learn.js check --root .` → aucun projet d'apprentissage à la racine de
  ce dépôt (attendu, ce n'est pas un projet scaffoldé).
- `ai-flow verify --story epics/epic-01-verdict-fiable/story-01-03-predictions-donnees`
  → `npm test` vert.
- Reproduction manuelle de bout en bout (projet scaffoldé via `ai-learn init`) :
  `ai-learn predict` écrit l'entrée dans `.ai-learn/predictions.json`, régénère
  `docs/plans/predictions.md` avec le format exact du template et le marqueur généré,
  `ai-learn check` confirme la phase couverte.
- Substitut à la vérification dogfood Fastify (absente de ce dépôt) : projet reconstitué
  à la main avec un `predictions.md` hérité (séparateur `-` ordinaire, aucun
  `predictions.json`) et `predictionsRequired: 2` — `ai-learn check` compte les 2
  entrées correctement, 0 erreur/warning.

### Rollback Notes

Retirer la commande `predict` de `bin/ai-learn.js` et le module `bin/lib/predictions.js` ;
dans `check.js`, revenir au comptage global (`countJournalEntries` seul) et retirer la
lecture de `predictions.json`. Aucune migration de données : un `.ai-learn/predictions.json`
déjà écrit devient un fichier inerte, le `.md` généré reste lisible tel quel (c'est un
fichier normal, pas un artefact spécial) et redevient éditable à la main puisque plus
rien ne le régénère. Les projets sans `predictions.json` n'ont jamais changé de
comportement.
