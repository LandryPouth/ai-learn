---
description: "Prochaine phase à faire"
argument-hint: ""
allowed-tools: ["Bash"]
---

# ai-learn: learn-next

Montre la prochaine phase à travailler dans le projet courant.

Commence par `ai-learn next --json` : si `outdated` est `true`, lance
`ai-learn update` avant toute autre action et dis-le en une ligne (« Projet mis à
niveau avec l'outil »). Un projet scaffoldé par une ancienne version n'a pas les
derniers contrôles ; l'apprenant n'a pas à y penser.

Lance `ai-learn check` en silence (ceinture de sécurité) : ne dis rien s'il
passe ; s'il signale une erreur, montre-la en premier avec ce qu'elle demande.
L'apprenant n'a pas de commande `check` à connaître.

Lance `ai-learn profile --json` : s'il existe, `dailyMinutes` calibre la taille de
la session proposée (ne propose pas plus que ce temps) et les exemples de
transfert se choisissent dans `projects[]`. Absent, comportement habituel ; ne le
crée pas ici (c'est `/learn`).

Puis exécute :

```bash
ai-learn next
```

Affiche la sortie telle quelle : la phase suivante (id, nom, statut, checkpoint,
prédictions exigées, artefact) puis, en avertissement, les phases `done` dont la
preuve est périmée (avec la commande `ai-learn verify <id>`) ou absente.

Une preuve périmée ne remplace jamais la prochaine action : elle est listée
après. Si tout est fini et prouvé, `ai-learn next` le dit — dis-le simplement : le
`check` silencieux a déjà confirmé que tout est prouvé.

Si `incident.due` vaut `true` dans le JSON de `ai-learn next --json`, lance toi-même
`ai-learn break --auto` **sans demander** : l'outil choisit le niveau (1, 2, ou 3 =
panne d'environnement) selon la progression de l'apprenant, puis montre le symptôme.
Annonce-le en une phrase (« Un incident vient de tomber ») et applique le protocole de
`/learn-break` : prédiction avant toute ouverture de fichier ou commande, tu ne
cherches pas la cause. Niveau 3 : la prédiction porte sur le type de panne
(`ai-learn predict --type debug --cause "<variable | port | service>" …`). L'apprenant
règle la fréquence dans `.ai-learn/tutor.json` (`incidents.chance`, `0` = jamais).

Si la sortie annonce un **incident de code actif** (ou si `incident.active` vaut
`true` dans le JSON), il passe avant la phase suivante : rappelle le protocole de
`/learn-break` (prédire le site avant d'ouvrir un fichier, réparer, puis
`ai-learn break --resolve`). Ne cherche pas le site toi-même.

Si la sortie annonce une **revisite échue**, lance `ai-learn revisit <id>` : l'outil
retire de `src/**` ce que la phase avait ajouté et l'apprenant le retape de mémoire
(sans notes). Tu ne lis pas le code retiré, ni la sauvegarde `.ai-learn/revisit/`, et
tu ne le recopies pas. Ensuite `ai-learn verify <id> --revisit` ; au besoin
`ai-learn revisit <id> --giveup` restaure les fichiers. Une revisite en cours ou
interrompue est annoncée en première ligne de `ai-learn next` et `ai-learn status`.
