# Spec — Story 13.02 — Les prédictions d'avant comptent

## User Value

Les 33 prédictions tapées dans `docs/plans/predictions.md` avant l'arrivée de `predictions.json` (story 01.03) redeviennent des données : elles comptent pour `verify`, apparaissent dans `status` et nourrissent la mémoire. L'apprenant ne perd pas ce qu'il a déjà prouvé.

## Requirements

- `ai-learn predict --import-md [--dry-run]` (machinerie) lit `docs/plans/predictions.md` avec le parseur existant du format `### Phase <N> — prédiction <k>/<total>` (`check.js`) et ajoute chaque entrée à `.ai-learn/predictions.json` :
  - `phaseId`, `prediction`, `gaps`, `score`, `strengths`, `weaknesses`, `flash`, `corrected`, `correctedBy` repris des champs ;
  - `at` = `revealedAt` = la date « Révélé le » (forme en un temps, déjà acceptée) ; `importedFrom: "md"` ;
  - `type: "code"` (défaut existant).
- Idempotent : une entrée déjà importée (même phase, même rang, même texte) n'est pas dupliquée.
- Avant d'écrire : copie `predictions.json.bak-<horodatage>` ; après : le `.md` est **conservé tel quel** s'il est personnalisé (règle `syncJournalRender`), sinon régénéré.
- `--dry-run` affiche le nombre d'entrées importables, les entrées illisibles (titre et raison), et n'écrit rien.
- `check` signale (warning) un projet dont le `.md` contient des entrées absentes de `predictions.json`, avec la commande à lancer.

## Acceptance Criteria

- [ ] Given un `.md` de 3 entrées valides et un `predictions.json` vide, when `predict --import-md`, then `predictions.json` contient 3 entrées `importedFrom: "md"` et `verify` les compte.
- [ ] Given le même import relancé, when `predict --import-md`, then aucune entrée n'est ajoutée.
- [ ] Given une entrée sans « Révélé le », when `--dry-run`, then elle est listée illisible avec sa raison et rien n'est écrit.
- [ ] Given un import, when on liste `.ai-learn/`, then une sauvegarde `predictions.json.bak-*` existe.
- [ ] Given un `.md` avec des entrées non importées, when `check`, then un warning nomme `ai-learn predict --import-md`.
- [ ] Given le `.md` réel de `fastify-traducteur-api` copié en fixture (anonymisé), when `--dry-run`, then 33 entrées importables.

## Edge Cases

- Entrée « Corrigé par : IA » : importée avec `correctedBy: "ia"` (la signalisation de `check` reste).
- Dates au format libre : seule `YYYY-MM-DD` est acceptée ; autre format = illisible, jamais devinée.
- `predictions.json` invalide : refus, rien n'est écrit (pas de réparation silencieuse).

## Out of Scope

- Le nettoyage des ledgers (`ledgers --repair` existe).
