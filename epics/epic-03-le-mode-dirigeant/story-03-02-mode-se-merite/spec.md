# Story 03.02 — `ai-learn mode dirigeant` se mérite

## Goal

`ai-learn mode dirigeant` n'accepte la bascule que si les tiers 1 à 3 de `~/.ai-learn/tracks/tests.json` sont atteints ; sinon il refuse en listant le tier manquant.

## Risk

STRICT : porte d'autorisation fondée sur un fichier de l'utilisateur ; revue indépendante obligatoire.

## Acceptance Criteria

- [x] Given les tiers 1-3 atteints, when `ai-learn mode dirigeant` tourne, then `guard.json` passe en `mode: "dirigeant"` et la bascule est tracée (date, tiers observés).
- [x] Given le tier 3 (« rouge d'abord ») non atteint, when la commande tourne, then elle refuse, exit 1, et nomme le tier manquant avec ce qui l'atteindrait.
- [x] Given un ledger absent, corrompu ou de version inconnue, when la commande tourne, then elle refuse (jamais d'accès par défaut quand le ledger est illisible).
- [x] Given `ai-learn mode apprenti`, when il tourne, then le retour est toujours permis, sans condition.
- [x] Given une édition manuelle de `guard.json` vers `dirigeant` sans passer par la commande, when `check` tourne, then l'écart avec le ledger est signalé en erreur.

## Edge Cases

- [x] Aucun cas limite propre à cette story au-delà des critères.

## Out of Scope

- [x] bin/lib/tracks/tests.js (aucune écriture)
