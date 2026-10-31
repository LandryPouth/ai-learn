---
description: "Prochaine phase à faire"
argument-hint: ""
allowed-tools: ["Bash"]
---

# ai-learn: learn-next

Montre la prochaine phase à travailler dans le projet courant.

Exécute :

```bash
ai-learn next
```

Affiche la sortie telle quelle : la phase suivante (id, nom, statut, checkpoint,
prédictions exigées, artefact) puis, en avertissement, les phases `done` dont la
preuve est périmée (avec la commande `ai-learn verify <id>`) ou absente.

Une preuve périmée ne remplace jamais la prochaine action : elle est listée
après. Si tout est fini et prouvé, `ai-learn next` le dit — propose alors
`/learn-check` pour confirmer que tout est prouvé.

Si la sortie annonce une **revisite échue**, lance `ai-learn revisit <id>` : l'outil
retire de `src/**` ce que la phase avait ajouté et l'apprenant le retape de mémoire
(sans notes). Tu ne lis pas le code retiré, ni la sauvegarde `.ai-learn/revisit/`, et
tu ne le recopies pas. Ensuite `ai-learn verify <id> --revisit` ; au besoin
`ai-learn revisit <id> --giveup` restaure les fichiers. Une revisite en cours ou
interrompue est annoncée en première ligne de `ai-learn next` et `ai-learn status`.
