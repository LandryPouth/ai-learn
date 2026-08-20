---
description: "Prochaine phase à faire"
argument-hint: ""
allowed-tools: ["Bash"]
---

# ai-learn: next

Montre la prochaine phase à travailler dans le projet courant.

Exécute :

```bash
ai-learn next
```

Affiche la sortie telle quelle : la phase suivante (id, nom, statut, checkpoint,
prédictions exigées, artefact) et l'avertissement éventuel sur une phase `done`
sans évidence.

Si tout est fini, `ai-learn next` le dit — propose alors `/check` pour confirmer
que tout est prouvé.
