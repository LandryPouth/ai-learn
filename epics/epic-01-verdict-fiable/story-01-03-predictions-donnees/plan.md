# Plan — Story 01.03

## Implementation Context

Fichiers probables :

- `bin/lib/predictions.js` (nouveau) — lecture/écriture/validation/rendu. Même forme
  que `progress.js` et `tracks/git.js` : `version: 1`, `readXxx`, `writeXxx`,
  `validateXxx → issues[]`, fallback à la lecture.
- `bin/ai-learn.js` — nouveau cas dans le `switch`, entrée d'aide, mention dans le
  bloc `Commands`.
- `bin/lib/check.js` — `countJournalEntries` / `countIATypedCorrections` : lire les
  données quand elles existent, retomber sur le `.md` sinon ; comptage par phase.
- `bin/lib/init.js`, `bin/lib/update.js` — création/propagation du fichier de données
  (même emplacement que `ensureNormConfig` et `syncDogfood`).
- `templates/predictions.md` — devient le gabarit de rendu, avec un en-tête marqueur.
- `templates/AGENTS-apprentissage.md`, `commands/*.md` — le protocole dit à l'agent
  d'enregistrer la prédiction au lieu d'éditer le `.md`.
- `test/predictions.test.js` (nouveau), `test/check.test.js`, `test/init.test.js`,
  `test/update.test.js`, `test/cli.test.js`.

Ancres de recherche :

- `countJournalEntries`
- `countIATypedCorrections`
- `predictionsRequired`
- `PROTOCOL_MARKER` (la convention de fichier généré à imiter)
- `ensureNormConfig`

Mode d'exécution :

- `STANDARD`

Scout pre-step :

- `no`

À éviter sauf nécessité :

- `verify.js` — le blocage est la story 01.04
- `guard.js`, `norm.js`, `scan.js`

## Technical Notes

**Schéma** (`.ai-learn/predictions.json`) :

```
{ version: 1, entries: [ { id, phaseId, at, prediction, gaps, score,
                           strengths, weaknesses, flash, correctedBy,
                           revealedAt } ] }
```

`at` est l'horodatage d'écriture de la prédiction ; `revealedAt` celui de la
révélation. C'est l'écart entre les deux qui rend l'antériorité vérifiable — la
story 01.04 s'en sert, celle-ci se contente de le stocker fidèlement.

**Marqueur de fichier généré.** Reprendre exactement la convention en place : un
titre/première ligne reconnaissable (`update.js#PROTOCOL_MARKER`,
`guard.js#SOLUTIONS_README`). Un fichier qui ne commence pas par le marqueur est
considéré comme personnalisé et n'est jamais réécrit.

**Rétro-compatibilité.** L'ordre de résolution du comptage :
1. `.ai-learn/predictions.json` valide ⇒ il fait foi ;
2. sinon `docs/plans/predictions.md` parsé avec un séparateur tolérant
   (`[—–-]`) ⇒ comptage hérité, par phase grâce au groupe `Phase (\d+)` déjà
   présent dans le regex actuel ;
3. sinon zéro.

**Comptage par phase.** Le regex actuel capture déjà le numéro de phase — le défaut
n'est pas dans l'extraction mais dans l'agrégation. Comparer
`predictionsRequired` de chaque phase au nombre d'entrées de cette phase, et
rapporter le manque **phase par phase**.

**Sécurité du rendu.** Le texte d'une prédiction est écrit par un agent : l'échapper
au rendu (au minimum, ne jamais laisser une ligne commencer par `###` sans
échappement) pour qu'une prédiction ne puisse pas fabriquer de fausses entrées dans
le `.md` — le `.md` n'est plus la source de vérité, mais il reste ce que l'humain lit.

## Decisions

- Décision : le JSON fait foi dès qu'il existe et est valide.
  - Raison : deux vérités synchronisées divergent — exactement ce que l'outil
    reproche aux agents.
  - Conséquence : un projet qui adopte la commande ne peut plus revenir à l'édition
    manuelle du `.md`. À écrire dans l'en-tête généré.
- Décision : le parsing hérité du `.md` est conservé, avec séparateur tolérant.
  - Raison : rétro-compatibilité silencieuse (décision verrouillée) — le dogfood
    Fastify a un journal `.md` réel.
  - Conséquence : deux chemins de comptage cohabitent. Ne pas supprimer le second
    tant que des projets sans `predictions.json` existent.
- Décision : la commande enregistre, elle ne juge pas.
  - Raison : la note et les écarts sont produits par l'agent selon le protocole ;
    l'outil ne peut pas les recalculer et ne doit pas prétendre le contraire.
  - Conséquence : `score` et `gaps` sont des données rapportées, pas des données
    prouvées. Le README doit le dire comme il dit déjà que la cognition n'est pas
    prouvée.

## Test Plan

Unitaire (`test/predictions.test.js`) :

- [ ] Écriture puis relecture d'une entrée (round-trip)
- [ ] Validation : version inconnue, `entries` non-tableau, entrée sans `phaseId`
- [ ] Rendu : les entrées apparaissent dans l'ordre chronologique
- [ ] Rendu : un `.md` sans marqueur n'est pas écrasé et l'outil le signale
- [ ] Rendu : un texte contenant `###` ne fabrique pas de fausse entrée
- [ ] Deux entrées au même horodatage restent distinctes

`test/check.test.js` :

- [ ] Comptage par phase : 4 entrées sur la phase 0 ne couvrent pas la phase 1
- [ ] Projet hérité, séparateur `-` → entrées comptées
- [ ] Projet hérité, séparateur `—` → entrées comptées (non-régression)
- [ ] `predictions.json` corrompu → erreur structurelle
- [ ] `Corrigé par : IA` compté depuis les données
- [ ] Projet ayant les deux fichiers → le JSON fait foi

`test/init.test.js` / `test/update.test.js` :

- [ ] `init` crée le fichier de données
- [ ] `update` le rétro-installe sur un projet plus ancien sans perdre le `.md` hérité

`test/cli.test.js` :

- [ ] La commande apparaît dans l'aide
- [ ] Un appel sans phase échoue proprement (`UsageError`, pas une stack)

Manuel :

- [ ] Sur le dogfood Fastify : `ai-learn check` compte le journal `.md` existant
      comme avant.

## Acceptance Traceability

| Acceptance criterion | Test proving it (`file::test`) |
| --- | --- |
| Entrée horodatée rattachée à la phase | `test/predictions.test.js::round-trip d'une entrée` |
| Rendu chronologique + marqueur | `test/predictions.test.js::le rendu porte le marqueur` |
| `.md` personnalisé non écrasé | `test/predictions.test.js::un md personnalisé n'est pas écrasé` |
| Comptage par phase | `test/check.test.js::le comptage des prédictions est par phase` |
| Projet hérité, tiret ordinaire | `test/check.test.js::le séparateur tiret ordinaire est compté` |
| JSON corrompu signalé | `test/check.test.js::predictions.json corrompu est une erreur` |
| Échappatoire IA préservée | `test/check.test.js::corrigé par IA est signalé` |

## Commands

- Command: `npm test`
  - Expected: la suite complète passe.
- Command: `node bin/ai-learn.js check --root .`
  - Expected: exit 0 sur ce dépôt.

## Rollback

Supprimer la commande et le module ; `check` retombe sur le parsing `.md`, qui n'a
jamais cessé d'exister. Les `.ai-learn/predictions.json` déjà écrits deviennent des
fichiers inertes — aucune perte, le `.md` rendu reste lisible.
