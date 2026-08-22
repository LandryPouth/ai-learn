---
description: "Propose un projet à construire quand l'apprenant ne sait pas quoi faire — tout est fait automatiquement, vocabulaire neutre"
argument-hint: ""
allowed-tools: ["Bash"]
---

# ai-learn: propose

L'apprenant ne sait pas quoi construire ? `/propose` lui donne un projet, et le
**projet entier se monte tout seul**. L'apprenant tape `/propose` — **aucune
option, il n'a pas à connaître l'outil**.

## Neutralité — jamais de biais dans ce que voit l'apprenant

Ne jamais dire ni écrire, dans ce qui est montré ou expliqué à l'apprenant :
**« codecrafters »**, **« roadmap »**, **« build-your-own-x »**. L'apprenant
sait juste qu'il est là pour apprendre. Ce vocabulaire reste interne à l'outil.

Présenter un projet en langage simple : *« Un serveur HTTP fait maison : tu
vas comprendre ce qu'un framework cache derrière ses routes. »* — sans nommer
d'où vient l'idée.

## Flux — tout est automatique

1. L'apprenant tape `/propose`.
2. L'IA choisit les filtres d'après la conversation (stack, niveau), ou pose
   **une** question simple et neutre si besoin : *« tu préfères quelque chose de
   réseau, un outil, ou un jeu ? »*
   - Si un ledger de domaine existe déjà (`~/.ai-learn/domains/<stack>.json`)
     pour la stack pressentie, lis-le d'abord : calcule `--level` pour cibler
     les tiers **encore manquants** plutôt que de laisser le niveau au
     hasard — c'est ce qui rend « quelques projets suffisent pour devenir
     expert » réel plutôt qu'un vœu. Aucun changement de commande : le filtre
     `--level` existe déjà, seule la valeur choisie est informée par le ledger.
3. L'IA lance `ai-learn propose [--stack …] [--level …]` et lit
   `.ai-learn/proposals.json`.
4. L'IA choisit un projet (ou propose 2-3 en langage naturel), puis **monte
   tout le parcours sans que l'apprenant fasse quoi que ce soit** :
   - `ai-learn docs add` pour embarquer chaque ressource des étapes (clone,
     preset, ou `--regen` si non clonable) ;
   - `ai-learn init --phases` avec des phases dont chaque checkpoint est
     exécutable et chaque citation pointe vers `docs/sources/<nom>/` ;
   - le plan, l'AGENTS.md, le journal de prédictions — tout est posé.
5. L'apprenant n'a plus qu'à apprendre : la première phase est prête.

## Projet inventé — validation anti-hallucination

Si l'apprenant veut un projet **hors banque**, l'IA l'invente — mais le valide :
chaque étape doit citer une ressource vérifiable.

```bash
ai-learn propose --validate <fichier.json>
```

- ✓ `Projet valide` — chaque étape a sa ressource.
- ✗ Refus (exit 1) — il liste les étapes non sourcées. L'IA remplace la
  ressource par une vraie référence (URL, RFC, man, livre, `docs/sources/…`)
  ou retire l'étape. Jamais de plan sur du non sourcé.

Format d'un projet inventé :

```json
{
  "title": "Mini-traceroute",
  "stages": [
    {
      "title": "ICMP echo",
      "checkpoint": "ping répond",
      "resource": { "name": "man 7 raw", "ref": "https://man7.org/linux/man-pages/man7/raw.7.html" }
    }
  ]
}
```

## Détails techniques (pour l'IA)

- `ai-learn propose [--stack c|javascript|python|go] [--level 1-5] [--limit n]`
  — court-list + `.ai-learn/proposals.json`.
- `ai-learn propose --validate <fichier.json>` — garde-fou pour les projets
  inventés.
- Toutes les étapes de la banque sont déjà adossées à une ressource vérifiable.
- Rappel : rien de ce qui est montré à l'apprenant ne contient « codecrafters »,
  « roadmap » ou « build-your-own-x ».
