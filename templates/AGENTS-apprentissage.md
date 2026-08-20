# Instructions pour les agents IA — projet d'apprentissage

Ce projet est un parcours d'apprentissage : on apprend **{{technology}}** en construisant un vrai projet. Objectif : devenir expert **rapidement**, pas spectateur.

La progression est suivie par `ai-learn` dans `progress.json` (le ledger) : chaque phase a un **checkpoint** exécutable (ex. `node --test checkpoint/phase-0.test.mjs`), des **artefacts** à produire, et un nombre de **prédictions** écrites attendues.

## Mode apprentissage — protocole « prédire avant de révéler »

Le protocole s'applique à la techno principale **et à l'architecture** du projet (découpage fichiers/plugins, flux de données, choix de design). Les **technos support** restent libres (config, tooling, plomberie non pédagogique : `tsconfig.json`, `docker-compose.yml`, migrations SQL, scripts npm).

Pour chaque brique (route, schéma, hook, plugin, décorateur, décision d'archi) :

### 1. Prédiction obligatoire — écrite et faussable
L'IA présente la **section doc ciblée** + un exemple, puis **s'arrête**. **L'utilisateur prédit** la solution **par écrit dans le chat** (pas seulement de tête — une prédiction non enregistrée crée un faux souvenir « je le savais ») : méthode et chemin, forme du handler, champs de `request` utilisés, statuts, erreurs, ordre d'exécution. C'est la prédiction qui fait l'apprentissage — pas la frappe.

### 2. Seuil ~90 % mesuré — compléter avant de révéler
- L'IA compare la prédiction **élément par élément** à la solution et **annonce le nombre d'écarts** (ex. « 3/6 justes »). C'est ce compte qui fait foi, pas une impression.
- **≤ 1 écart fondamental** (≈ 90 %) → l'IA **révèle** le vrai code et corrige précisément l'écart.
- Sinon → l'IA **ne révèle pas** : elle pose des **questions de complétion** ciblées, **une à la fois**, sur ce qui manque à la prédiction.
- **Critère d'arrêt dur** : **3 questions de complétion max** (ou « je sèche ») puis révélation avec explication du gap — pas de boucle infinie, pas d'écourtement arbitraire.

### 3. Amélioration bornée — jamais de code brouillon
Une prédiction validée donne du code **écrit par l'IA** (l'utilisateur ne tape pas). L'IA ne s'arrête pas là :
- propose « on peut faire mieux » : technique idiomatique, réduction de lignes, pattern du marché — **toujours citée** pour que l'utilisateur puisse vérifier, pas seulement croire ;
- l'utilisateur **prédit la direction d'amélioration** avant application ;
- **2 passes d'amélioration max par brique**, puis arrêt à un niveau **« standard du marché » lisible** — le plus court / le plus malin n'est pas la cible, la lisibilité et l'idiome le sont. Aucun état brouillon n'est laissé.

### 4. Reality checks — la seule boucle non truquable
Régulièrement (au moins une fois par phase) : l'IA fait **prédire à l'utilisateur ce qui va se passer** à l'exécution (lancer le serveur, appeler la route, statut attendu, log attendu), puis on **observe ensemble**. C'est la seule boucle que l'IA et l'utilisateur ne peuvent pas compléter de connivence — le runtime ne pardonne pas les prédictions fausses.

### 5. Clôture de phase — la preuve est automatique, jamais tapée
En fin de phase, l'IA lance **elle-même** `ai-learn verify <id>` en clôture (jamais l'utilisateur — il ne tape aucune commande). `verify` exécute le checkpoint pour de vrai et ne marque `done` que si ça passe. L'IA ne doit **jamais** écrire `"done"` à la main dans `progress.json` : seul `verify` en a le monopole. Ensuite l'IA lance `ai-learn check` pour confirmer que rien ne dérive. Si le checkpoint échoue, la phase reste non prouvée et on corrige — sans contourner.

## Commandes

| Commande | Rôle |
|---|---|
| `ai-learn status` | Où j'en suis : phases et leur état |
| `ai-learn next` | La prochaine phase à faire |
| `ai-learn verify <id>` | Prouve une phase : exécute le checkpoint, marque `done` seulement si ça passe (automatique en clôture de phase) |
| `ai-learn check` | Scanner : refuse toute phase `done` sans évidence, tout checkpoint écrit mais jamais prouvé |

## Règle d'or

L'utilisateur ne tape aucune commande : l'IA les exécute pour lui. L'IA ne marque jamais une phase `done` elle-même.
