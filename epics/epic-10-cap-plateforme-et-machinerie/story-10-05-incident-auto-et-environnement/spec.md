# Spec — Story 10.05 — Incidents automatiques et pannes d'environnement

## User Value

L'apprenant n'a rien à demander : de temps en temps, `/learn-next` lui sert un incident à un moment sûr. Quand sa progression plateforme le permet, la panne n'est plus dans le code mais dans l'environnement (variable mal réglée, port pris, base arrêtée) — ce qui l'oblige à utiliser les vrais outils (`ss`, `curl -v`, `docker compose ps`, `psql`) et que `git diff` ne révèle pas.

## Requirements

- `tutor.json` gagne `incidents: { "chance": 0..1 }` (défaut `0.25`, `0` = jamais). Champ absent = défaut ; valeur hors plage = erreur `check`.
- `ai-learn next` propose un incident (`incident.due: true` dans `--json`) seulement si : la dernière phase vient d'être prouvée par `verify` (aucun incident proposé depuis), arbre git propre, aucun incident actif, mode `apprenti`, tirage aléatoire < `chance` (générateur injectable). `/learn-next` lance alors `ai-learn break` lui-même, sans demander.
- Niveau choisi automatiquement : 1 par défaut ; 2 si le palier debug 1 est atteint ; 3 (environnement) si le palier debug 2 **et** au moins un palier plateforme 4 (conteneurs) ou 6 (observabilité) sont atteints et qu'une panne d'environnement est applicable.
- Banque de pannes d'environnement (niveau 3), chacune réversible et détectable :

  | Panne | Applicable si | Injection | Restauration |
  |---|---|---|---|
  | variable corrompue | `.env` présent, non suivi par git | une valeur réécrite | contenu d'origine |
  | port occupé | `PORT` déclaré dans `.env` | un processus enfant détaché écoute le port, pid enregistré | arrêt du pid enregistré, vérifié par son pid |
  | service arrêté | `docker compose` disponible et un service en cours d'exécution | `docker compose stop <service>` | `docker compose start <service>` |

  Une panne n'est gardée que si un checkpoint `done` tombe après injection (même règle que 10.04).
- `--resolve` / `--giveup` / ledger / secret : identiques à 10.04 ; palier debug 4 = panne d'environnement résolue. La prédiction `debug` d'un niveau 3 porte `cause` (texte) au lieu de `fichier:ligne` ; la comparaison vaut `exact` si le type de panne nommé est le bon (`env`, `port`, `service`).

## Acceptance Criteria

- [x] Given une phase tout juste prouvée, un arbre propre et un tirage sous `chance`, when `ai-learn next --json`, then `incident.due` vaut `true`.
- [x] Given `chance: 0`, when `next`, then aucun incident n'est jamais proposé.
- [x] Given un incident déjà proposé après la dernière phase prouvée, when `next` est relancé, then aucun second incident n'est proposé.
- [x] Given `chance: 2`, when `ai-learn check`, then erreur nommant `tutor.json` et la plage.
- [x] Given palier debug 1 atteint et pas le 2, when un incident automatique part, then son niveau est 2.
- [x] Given les conditions du niveau 3 et un `.env` non suivi, when l'incident part avec la panne « variable », then `.env` est modifié, un checkpoint tombe, et `--giveup` rend `.env` identique octet par octet.
- [x] Given la panne « port », when `--resolve` ou `--giveup`, then le processus enregistré n'existe plus et aucun autre processus n'a été tué.
- [x] Given aucune panne d'environnement applicable, when le niveau 3 est choisi, then l'outil retombe au niveau 2 et le dit.
- [x] Given la panne « service » et Docker absent, when on liste les pannes applicables, then elle n'y figure pas (test auto-skip si Docker présent mais pas de compose de test).

## Edge Cases

- `.env` suivi par git : panne « variable » non applicable (sinon `git diff` la révèle et on toucherait un fichier versionné).
- Processus du port tué par l'apprenant : `--resolve` le constate et ne tue rien d'autre.
- Machine redémarrée pendant un incident « port » : le pid enregistré n'existe plus → traité comme restauré.

## Out of Scope

- Pannes réseau système (DNS, iptables) : demandent des droits root.
- Pannes non déterministes ou de performance (Partie A tiers 4-6).
