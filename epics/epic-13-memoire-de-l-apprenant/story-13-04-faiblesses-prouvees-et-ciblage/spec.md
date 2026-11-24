# Spec — Story 13.04 — Les exercices visent ce qui a été prouvé faible

## User Value

Si l'apprenant oublie le cas d'échec dans ses prédictions de trois projets différents, ou manque deux fois un `await` oublié en kata, le prochain incident et le prochain kata tirent plus souvent dans cette zone. L'entraînement suit ses faiblesses réelles au lieu du hasard, sans devenir prévisible.

## Requirements

- **Catégories d'écart au reveal** : `predict --reveal <id> ... --gap-kinds <k1,k2>` accepte un vocabulaire fermé : `cas-d-echec`, `ordre`, `statut`, `api-exacte`, `concept`, `nommage`, `autre`. Optionnel ; valeur inconnue = refus.
- **Mécanismes manqués** : `review --reveal` et `break --resolve`/`--giveup` enregistrent les identifiants de faute (`faults`) manqués ou non trouvés dans `~/.ai-learn/memory/weaknesses.json` (source machine, `version: 1`).
- **Faiblesse prouvée** : une catégorie ou un mécanisme vu **dans au moins 2 événements distincts** sur les 90 derniers jours. Une réussite postérieure (catégorie absente d'une prédiction notée ≥ 8/10, mécanisme trouvé) décrémente.
- **Ciblage** : `break` et `review` multiplient par 3 le poids des sites dont le mécanisme est une faiblesse prouvée ; jamais exclusif (les autres restent tirables) ; générateur injectable, déterministe sous graine.
- **Rendu** : `memory export` écrit `<vault>/ai-learn/learner/weaknesses.md` (une ligne par faiblesse : nom, nombre d'événements, alias des projets, dates) ; la fiche (13.01) gagne une ligne « faiblesses : … » (3 au plus).
- `templates/AGENTS-apprentissage.md` §2 : au reveal, l'agent passe `--gap-kinds`.

## Acceptance Criteria

- [ ] Given `--gap-kinds cas-d-echec,inconnu`, when `predict --reveal`, then exit 1 et rien n'est écrit.
- [ ] Given `cas-d-echec` sur 2 prédictions de deux projets, when `memory export`, then `weaknesses.md` et la fiche le listent.
- [ ] Given `cas-d-echec` une seule fois, when `memory export`, then il n'est pas listé.
- [ ] Given un mécanisme `await-oublie` manqué dans 2 katas, when `review` tire avec une graine fixée sur 1 000 tirages, then ce mécanisme sort environ 3 fois plus souvent qu'un autre mécanisme à poids égal (tolérance ±20 %).
- [ ] Given aucune faiblesse, when `break`, then les tirages sont identiques à ceux d'avant la story (même graine).
- [ ] Given un mécanisme trouvé après avoir été prouvé faible, when `memory export`, then son compte décroît.

## Edge Cases

- Faute sans identifiant stable (mutant générique) : rangée sous l'opérateur du pack.
- Projets sans `memory/` : aucune pondération (comportement actuel).

## Out of Scope

- Ciblage de `revisit` : la revisite suit déjà l'espacement ; la pondérer sur les faiblesses est une piste pour 14.04 (revisite en plusieurs formats).
- Tout jugement de l'IA sur la faiblesse : seuls les événements enregistrés comptent.
