# Spec — Story 11.03 — Niveau 4 : le symptôme vient de la production

## User Value

En production, personne ne voit un test rouge : on voit une ligne de log, une erreur remontée, une alerte, une latence qui monte. Au niveau 4, l'apprenant ne reçoit que ce que l'observabilité de son projet montre, et doit remonter du symptôme au code.

## Requirements

- `.ai-learn/tutor.json` accepte `incidents.symptomCommand` (chaîne non vide) et `incidents.symptomTimeoutMs` (entier positif, défaut 60000). Validés par `tutor.js` ; invalides = erreur `check`.
- `ai-learn break --level 4` :
  - refus (exit 1) si `symptomCommand` n'est pas déclarée, avec un message qui dit quoi déclarer ;
  - exécute `symptomCommand` une fois avant injection (sortie de référence) ;
  - après injection, garde le site seulement si un checkpoint tombe **et** si la sortie de `symptomCommand` diffère de la référence (le symptôme est observable) ; sinon restauration et nouveau tirage ;
  - montre la fin de la sortie de `symptomCommand` (`OUTPUT_LINES`), jamais la sortie des checkpoints ni les phases qui tombent.
- `.ai-learn/incident.json` au niveau 4 : `failingPhases` vide (l'information reste dans le record secret).
- `--resolve` vert au niveau 4 → palier debug 5 (« panne trouvée depuis un symptôme de production »). `TIER_IDS` gagne 5, optionnel pour les ledgers existants.
- `--auto` : le niveau 4 est possible une fois le palier debug 2 atteint et `symptomCommand` déclarée ; s'il est aussi possible, le niveau 3 est tiré à pile ou face (générateur injectable).
- §3sexies décrit le niveau 4 : le symptôme est ce que l'observabilité montre ; l'apprenant cherche dans les logs, traces ou erreurs avant d'ouvrir un fichier.
- README : exemple de `symptomCommand` (script npm du projet qui démarre l'API, envoie quelques requêtes et affiche les logs JSON), en précisant que le script appartient au projet.

## Acceptance Criteria

- [ ] Given aucun `symptomCommand`, when `break --level 4`, then exit 1, message nommant `incidents.symptomCommand`, aucun fichier modifié.
- [ ] Given un `symptomCommand` qui imprime toujours la même chose, when `break --level 4`, then aucun site n'est gardé et le code est restauré octet par octet.
- [ ] Given un `symptomCommand` dont la sortie change quand `src/a.js` casse, when `break --level 4`, then la sortie montrée est celle de `symptomCommand` et ne contient ni la sortie du checkpoint ni l'id de phase.
- [ ] Given un incident de niveau 4 réparé, when `break --resolve`, then le palier debug 5 est atteint.
- [ ] Given un `debug.json` à 4 paliers, when `check`, then aucune erreur.
- [ ] Given `symptomCommand` qui dépasse `symptomTimeoutMs`, when `break --level 4`, then le processus est tué, le code restauré, exit 1 avec la raison.
- [ ] Given palier debug 2 atteint, `symptomCommand` déclarée et générateur fixé, when `break --auto`, then le niveau choisi est 4.

## Edge Cases

- `symptomCommand` qui échoue (exit ≠ 0) avant injection : refus, la référence doit être stable.
- Sortie non déterministe (horodatages, identifiants de requête) : la comparaison ignore les nombres et les identifiants hexadécimaux longs ; documenté comme limite, avec le conseil de garder la sortie stable.
- `symptomCommand` lance des processus (serveur) : l'outil tue le groupe de processus à la fin, comme `incidents/env.js` le fait pour le port.

## Out of Scope

- Lire Sentry, Loki ou Grafana à la place du projet.
- Paliers « lent » et « non déterministe » de la Partie A.
