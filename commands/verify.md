---
description: "Prouve une phase : lance son checkpoint et marque done si ça passe"
argument-hint: "<phase-id>"
allowed-tools: ["Bash"]
---

# ai-learn: verify

Prouve une phase du parcours : exécute son checkpoint pour de vrai, capture la
sortie, et ne marque la phase `done` que si ça passe.

## Arguments

`$ARGUMENTS` doit contenir l'**id numérique** de la phase, ex. `/verify 2`.

- S'il manque, demande l'id (ou lance `/next` pour savoir où on en est).
- S'il est invalide, préviens et ne fais rien d'autre.

## Exécution

```bash
ai-learn verify <id>
```

## Après

- Si ça passe : la phase est `done`, l'évidence est écrite. Récapitule en une
  ligne ce qui a été prouvé, et suggère la suite (`/next`).
- Si ça échoue : la phase reste non prouvée. Affiche la sortie du checkpoint,
  identifie ce qui ne passe pas, et propose d'y remédier (souvent : compléter
  l'apprentissage de la phase avant de re-vérifier).
- Termine par `/check` mental : si l'utilisateur demande la vue d'ensemble,
  lance `/check`.

Règle inviolable : **ne modifie jamais le statut d'une phase toi-même.** Seul
`ai-learn verify` peut marquer `done`, et seulement quand le checkpoint passe.
