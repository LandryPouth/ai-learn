# Spec — Story 09.04 — Un scaffold au bon endroit, sûr par défaut

## User Value

Un nouveau parcours atterrit dans son propre dossier, ne commit jamais `node_modules` ni un `.env`, et les commandes marchent depuis n'importe quel sous-dossier du projet. Un fichier abîmé est nommé avec la position de l'erreur, au lieu d'un « lance `init` » qui pousse l'IA à créer un second projet.

## Requirements

- **`.gitignore`** : `init` et `update` créent ou complètent `.gitignore` sous un bloc marqué `# ai-learn` : `node_modules/`, `dist/`, `build/`, `.env`, `.env.*`, `!.env.example`, `.ai-learn/runs/`, `.ai-learn/guard.log`, `__pycache__/`, `.venv/`, `target/`, `*.o`. Ajout seulement des lignes absentes ; rien n'est jamais retiré ni réordonné hors du bloc.
- **Dossier de `init`** : sans `--dir`, si `--project <nom>` est donné et que le dossier courant n'est ni vide ni nommé `<nom>`, `init` crée et utilise `./<nom>/` ; sinon le dossier courant. Dans tous les cas, la première ligne affiche le chemin absolu choisi. `init` refuse d'écrire dans un dossier dont un **parent** contient déjà `progress.json` (projet imbriqué), en nommant ce parent.
- **Racine depuis un sous-dossier** : `status`, `next`, `verify`, `check`, `predict`, `norm`, `mutate`, `traps`, `docs` remontent jusqu'au `progress.json` le plus proche (arrêt au home ou à la racine du système), comme `findProjectRoot` du guard. `--dir` explicite reste prioritaire.
- **JSON corrompu** : `progress.json` illisible → « progress.json illisible : <message JSON> (ligne L, colonne C) — corriger le fichier ; ne pas relancer `init` ». `check` affiche le même détail.
- **Paquet npm** : `package.json#files` inclut `commands` ; un test vérifie que `npm pack --dry-run --json` liste `commands/learn.md`.

## Acceptance Criteria

- [ ] Given un dossier sans `.gitignore`, when `init`, then `.gitignore` contient le bloc `# ai-learn` avec `node_modules/` et `.env`.
- [ ] Given un `.gitignore` existant avec des lignes perso et `node_modules/`, when `update`, then les lignes perso sont intactes, `node_modules/` n'est pas dupliqué, les lignes manquantes sont ajoutées.
- [ ] Given le dossier `tech-experiments` (non vide, autre nom), when `init --project mini-redis`, then le projet est créé dans `./mini-redis/` et la sortie affiche ce chemin.
- [ ] Given un dossier vide nommé autrement, when `init --project x`, then le projet est créé dans le dossier courant.
- [ ] Given un projet existant, when `init` dans son sous-dossier `src/`, then exit 1, message nommant le projet parent, aucun fichier créé.
- [ ] Given `cd src/`, when `status` / `next` / `verify 1`, then ils agissent sur le projet parent.
- [ ] Given un `progress.json` tronqué, when `status`, then le message contient « illisible », une position, et pas « init ».
- [ ] Given `npm pack --dry-run --json`, when le test lit la liste, then `commands/learn.md` y figure.

## Edge Cases

- `--project` contenant `/` ou `..` : refusé (pas d'écriture hors du dossier courant).
- Remontée : ne jamais dépasser le home ; un `progress.json` dans le home lui-même est ignoré.
- Windows : `.gitignore` en fin de ligne d'origine conservée (CRLF).

## Out of Scope

- Initialiser un dépôt git (`git init` reste un geste de l'apprenant, palier git).
