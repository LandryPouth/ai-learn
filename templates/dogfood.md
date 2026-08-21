# Journal de friction — `ai-learn`

> Dès que `ai-learn` (pas le projet appris, l'outil lui-même) coûte plus qu'il
> ne rapporte, ça s'écrit ici. Pas un rapport de bug exhaustif — **la
> friction** : erreur, message confus, checkpoint qui semble se tromper,
> commande qui échoue sans raison claire.

## Pourquoi ce fichier

Ce journal appartient à ce projet, pas au dépôt `ai-learn`. Le mainteneur ne
voit jamais ce qui se passe chez un apprenant sans qu'il l'envoie — pas
d'upload automatique. Sur demande explicite, envoyer ce fichier permet de
corréler un incident réel à une version précise de l'outil et d'orienter les
correctifs.

Le signal à guetter n'est pas seulement un crash. C'est aussi la pensée
*« ai-learn me fait perdre mon temps »* — plus grave qu'une fonctionnalité
manquante, parce qu'au bout de ce chemin il y a un apprenant qui contourne ou
éteint l'outil.

## Comment enregistrer une entrée

Une entrée par incident, la plus récente en premier. Court ; l'IA l'écrit
**immédiatement** quand ça arrive, avant de contourner ou d'improviser
(cf. `AGENTS.md`).

```md
### <low|medium|high> — <titre court>
- Surface : <init|status|next|verify|check|scan|propose|docs|traps|guard|progress.json>
- Problème : <ce qui s'est réellement passé, en une phrase>
- Workaround : <ce qui a permis d'avancer ; "aucun, bloqué" est une réponse valide>
- Version de l'outil : <sortie de `ai-learn --version`>
```

Sévérité : `low` (agace) · `medium` (coûte du temps) · `high` (aucun
contournement légitime, ou verdict faux).

## Entrées

<!-- Nouvelle entrée en haut, sous cette ligne. -->
