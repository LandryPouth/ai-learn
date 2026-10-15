# checkpoint/

Chaque phase de `progress.json` déclare un `checkpoint` : une commande shell
qui doit réussir (ex. `node --test checkpoint/phase-0.test.mjs` — en projet
TypeScript, ajouter `--import tsx`). C'est la preuve exécutée que la phase est
apprise, pas juste racontée — voir `ai-learn verify`.

Ce dossier est scaffoldé vide : rien n'écrit le test à votre place. Choisir et
écrire le test **fait partie de l'apprentissage de la phase**, pas une étape
administrative avant.

## Choix de stratégie (aucune convention imposée)

- **Test HTTP réel** (démarrer le serveur puis `fetch`/`http.request`) vs.
  **injection in-process** (ex. `fastify.inject()`, `supertest`) — les deux
  sont valides ; le choix dépend de ce que la phase doit prouver (comportement
  réseau réel vs. logique de handler isolée). Un refactor du code applicatif
  pour permettre l'injection est un choix d'architecture à part entière, pas
  un prérequis silencieux.
- Un fichier par phase (`checkpoint/phase-<N>.test.mjs` ou l'extension du
  runner de test choisi) ; le nom importe peu tant qu'il correspond exactement
  à la commande `checkpoint` déclarée dans `progress.json`.
- `ai-learn verify <id>` exécute cette commande telle quelle, depuis la racine
  du projet — vérifiez qu'elle marche sans étape manuelle avant.

## `checkpoint/` vs `test/**` — qui juge quoi

- `checkpoint/` : la preuve exécutée par `ai-learn verify` — la commande
  `checkpoint` de la phase pointe ici (le plus souvent).
- `test/**` : vos éventuels tests de travail. L'outil ne les exécute que si la
  commande `checkpoint` les appelle explicitement.
- `ai-learn mutate` mute `src/**` (jamais `test/**` ni `checkpoint/**`) puis
  relance **la commande `checkpoint` de la phase** : un mutant est **tué** si
  elle échoue, **survécu** si elle passe. Pour qu'un test de `test/**` compte
  comme protection, la commande `checkpoint` doit donc le lancer.
