---
description: "Scanner : tout est-il cohérent et prouvé ?"
argument-hint: ""
allowed-tools: ["Bash"]
---

# ai-learn: check

Croise les `progress.json` contre la réalité sur toute la racine de projet(s)
d'apprentissage.

Exécute, depuis la racine qui contient le ou les projets (ex. le monorepo) :

```bash
ai-learn check
```

Ou, si le projet courant est déjà le bon :

```bash
ai-learn check --root .
```

Affiche la sortie telle quelle :

- **erreurs** (exit 1) : phase `done` sans évidence, artefact manquant, etc.
- **warnings** : journal de prédictions vide, doc source introuvable, évidence
  périmée.

## Après

- Si exit 0 : tout est cohérent. Dis-le simplement.
- Si exit ≠ 0 : liste les erreurs, explique chacune, et propose la réparation
  (typiquement : `/verify <phase>` pour prouver une phase marquée `done` sans
  évidence, ou compléter l'artefact manquant).
