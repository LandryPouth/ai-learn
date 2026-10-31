---
description: "Incident de code — casse ton code sans dire où, tu diagnostiques et tu répares"
argument-hint: "[1|2]"
allowed-tools: ["Bash"]
---

# ai-learn: learn-break

Provoque un **incident de code** : l'outil casse le code de l'apprenant à un
endroit qu'il est le seul à connaître. L'apprenant prédit l'endroit, répare, et
les checkpoints des phases terminées prouvent la réparation.

L'argument optionnel est le niveau (`1` par défaut). Niveau 2 : la sortie du test
qui tombe ne nomme pas le fichier fautif (la victime n'est pas le coupable).

Exécute :

```bash
ai-learn break --level <niveau>   # 1, 2 ; 3 = panne d'environnement (repli sur 2 si aucune n'est applicable)
```

Si la commande refuse (arbre git non propre, aucune phase terminée, incident déjà
actif, mode dirigeant, aucune panne détectable), affiche la raison telle quelle et
dis ce qu'elle demande — rien n'a été modifié.

Sinon, montre le symptôme (la sortie du checkpoint) et suis le protocole
`AGENTS.md` § « Incident de code » :

1. **Prédire avant d'ouvrir un fichier** : l'apprenant écrit où il pense que se
   trouve la cause et pourquoi ; tu l'enregistres avec
   `ai-learn predict --phase <id> --type debug --file <fichier> --line <n> --prediction "<mécanisme>"`.
2. **Expérience, puis réparation, par l'apprenant.** Tu ne connais pas le site : ne
   le cherche pas, ne lis pas `~/.ai-learn/incidents/` (le garde-fou le refuse). Tu
   donnes des indices de **méthode** (relire la sortie, réduire le cas, poser une
   expérience), jamais l'endroit.
3. **Prouver** : `ai-learn break --resolve` relance les checkpoints. Vert : l'incident
   est clos, le site est révélé et comparé à la prédiction. Rouge : il reste actif.

Limite assumée : `git diff` / `git status` côté apprenant montre la modification, et
la prédiction ne vaut alors plus rien. Le mur de lecture du secret ne tient que sous
Claude Code ; ailleurs, c'est une consigne. `--giveup` est un acte de l'apprenant :
le garde-fou refuse à l'IA de le lancer (il le tape lui-même avec `! ai-learn break --giveup`).

Bloqué ? `ai-learn break --giveup` restaure le code d'origine, sauvegarde la version
de l'apprenant dans `.ai-learn/incident-giveup/` et révèle le site — sans palier.
