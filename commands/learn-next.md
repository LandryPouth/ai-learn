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
