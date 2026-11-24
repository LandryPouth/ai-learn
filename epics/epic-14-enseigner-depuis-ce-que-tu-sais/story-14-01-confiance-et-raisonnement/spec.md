# Spec — Story 14.01 — Prédire avec sa confiance et son raisonnement

## User Value

L'apprenant ne dit plus seulement « je pense que c'est ça » : il dit à quel point il en est sûr et pourquoi. Le retour distingue une idée fausse (erreur sûre d'elle) d'un trou (erreur hésitante), et `status` lui montre s'il sait ce qu'il sait.

## Requirements

- `ai-learn predict ... --confidence <0-100> [--reasoning "<…>"]` : entier 0 à 100 ; hors bornes = refus. Optionnels pour les entrées existantes et les types `debug`/`lecture` ; **exigés** quand `.ai-learn/tutor.json` déclare `predictions.confidence: true` (activé par défaut par `init` dans les nouveaux projets).
- La confiance s'enregistre **avant** la révélation : `--reveal` refuse `--confidence` (rien n'est modifié).
- `docs/plans/predictions.md` régénéré affiche « Confiance : n % » et « Raisonnement : … ».
- **Calibration** : sur les prédictions révélées avec confiance, trois tranches (0-39, 40-69, 70-100) ; taux de justesse par tranche (juste = note ≥ 7/10). `status` affiche une ligne « calibration » dès 5 prédictions ; `bilan` une section.
- Signal : une prédiction notée < 5/10 avec confiance ≥ 80 est marquée `confidentMiss` ; `status` en donne le compte.
- `templates/AGENTS-apprentissage.md` §1-2 : demander la confiance et le raisonnement avec la prédiction ; au reveal, une erreur confiante se traite comme une idée fausse (montrer le modèle mental à corriger), une erreur hésitante comme un trou ; ne pas noter le raisonnement, s'en servir pour le feedback.

## Acceptance Criteria

- [ ] Given `--confidence 120`, when `predict`, then exit 1 et rien n'est écrit.
- [ ] Given une prédiction révélée, when `predict --reveal <id> --confidence 50`, then exit 1 et l'entrée est inchangée.
- [ ] Given `tutor.json` avec `predictions.confidence: true`, when `predict` sans `--confidence`, then exit 1 nommant le champ.
- [ ] Given un projet existant sans la clé, when `predict` sans `--confidence`, then l'entrée est enregistrée (rétro-compatible).
- [ ] Given 6 prédictions révélées avec confiance, when `status`, then la ligne « calibration » donne le taux par tranche.
- [ ] Given une note 3/10 à 90 % de confiance, when `status`, then « erreurs confiantes : 1 ».
- [ ] Given une prédiction avec raisonnement, when on lit `predictions.md`, then « Raisonnement : » apparaît.

## Edge Cases

- `--confidence 0` est valide (l'apprenant parie contre sa propre réponse) ; ne pas confondre avec l'absence.
- Prédictions importées (13.02) : sans confiance, exclues de la calibration.

## Out of Scope

- Curseur graphique, score de Brier : trois tranches suffisent pour un petit nombre de prédictions.
