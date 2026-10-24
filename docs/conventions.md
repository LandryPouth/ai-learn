# Conventions — ai-learn

## Code

- **Zéro dépendance.** Node stdlib uniquement. Une PR qui ajoute une dépendance
  runtime doit d'abord justifier pourquoi l'offline-first et le « ça tourne
  partout » ne comptent plus.
- CommonJS (`"use strict"` en tête, `require`, `module.exports` en fin de fichier).
- **Chaque module s'ouvre par un commentaire de bloc** qui dit *pourquoi* il existe
  et quel contrat il tient — pas ce qu'il fait ligne à ligne. C'est la convention
  la plus visible du dépôt ; la respecter.
- Les décisions non évidentes sont commentées **à l'endroit du choix**, avec la
  raison et la conséquence (voir `norm.js#stripTrailingReturnType`,
  `guard.js#detectGitOrGh`, `progress.js#latestEvidenceForPhase`).
- Erreurs utilisateur → `fail(msg)` (lève une `UsageError`, sortie propre + exit 1).
  Tout le reste est un bug et remonte au handler `uncaughtException`.
- Nommage : `xxxCommand({ dir })` pour l'entrée CLI d'une commande,
  `ensureXxx(dir)` pour un câblage idempotent, `readXxx`/`writeXxx`/`validateXxx`
  pour un fichier de données.

## Fichiers de données

Tout fichier de données porte `version: 1` et a une fonction
`validateXxx(config) → issues[]` qui renvoie des `{ level: "error"|"warning", message }`.
Un fichier corrompu ou édité à la main est **signalé**, jamais silencieusement
accepté.

Config projet (`.ai-learn/*.json`) : créée une fois avec des valeurs concrètes,
**jamais réécrite** ensuite. Fallback champ par champ à la lecture.
Seule exception : `ai-learn mode` réécrit `mode`, `modeChangedAt` et `modeTiers`
de `.ai-learn/guard.json` — une bascule explicite de l'apprenant, qui préserve
tous les autres champs. Ce n'est jamais un automatisme de synchronisation.

## Tests

- `node --test`, un fichier par module (`test/<module>.test.js`), aucun framework.
- Helpers partagés dans `test/helpers.js` : `tmpProject`, `writeFile`, `capture`,
  `sampleProgress`. Pour un ledger home-scoped, utiliser le pattern `tmpHome()`
  de `test/install.test.js` / `test/tracks-git.test.js`.
- Un test qui dépend d'un binaire externe (`opencode`, `gh`) **s'auto-skippe**
  quand il est absent — jamais un échec de CI sur une machine sans l'outil.
- Un test qui ne peut pas tourner sous Windows porte sa raison **dans le test**
  (`{ skip: "…" }`), jamais un `if (process.platform)` silencieux : la matrice CI
  tourne sur `ubuntu-latest`, `windows-latest` et `macos-latest`, et un skip muet
  y ressemble à une couverture qui n'existe pas.
- La suite tourne aujourd'hui à ~810 tests sur 29 fichiers.

## Git

- Conventional Commits, imposé mécaniquement par `.githooks/commit-msg`.
- `.githooks/pre-push` lance la suite avant chaque push.
- Une branche par chantier, PR vers `main`.

## Documentation

- Le README est en **français** pour les parties destinées à l'apprenant, en
  anglais pour les tableaux de commandes. Les commentaires de code sont en anglais.
- **Toute limite est écrite, jamais masquée.** Le tableau des plateformes du README
  est le modèle : « vérifié en conditions réelles » / « non vérifié faute de X » /
  « non traité, voici pourquoi ». Un mécanisme dont on ne sait pas s'il marche se
  documente comme tel.
- Toute friction rencontrée en utilisant l'outil va dans `docs/DOGFOODING.md`,
  y compris — surtout — les fois où un check s'est déclenché **et avait raison**.
