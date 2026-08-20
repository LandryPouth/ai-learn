---
description: "Où j'en suis — état du parcours d'apprentissage"
argument-hint: ""
allowed-tools: ["Bash"]
---

# ai-learn: status

Affiche l'état du parcours d'apprentissage dans le projet courant.

Exécute :

```bash
ai-learn status
```

Affiche la sortie telle quelle (phases, statuts, éventuelles issues du
`progress.json`). N'interprète rien, n'invente pas d'état.

Si la commande échoue (exit ≠ 0), affiche l'erreur et explique la cause probable
(pas de `progress.json` → suggérer `/learn`).
