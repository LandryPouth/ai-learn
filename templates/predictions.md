# Journal de prédictions

Une entrée par prédiction écrite **avant** révélation. Une prédiction doit être faussable : l'IA la compare élément par élément et note le nombre d'écarts — c'est ce compte qui fait foi, pas une impression.

**Ce fichier est généré.** Les entrées ci-dessous sont régénérées depuis `.ai-learn/predictions.json` (source de vérité) à chaque `ai-learn predict` — ne pas les éditer ici, elles seraient écrasées à la prochaine régénération. Retirer ce titre rend le fichier personnalisé : `ai-learn predict` ne le touchera plus jamais.

## Format

```md
### Phase <N> — prédiction <k>/<total>
- Prédiction : <méthode + chemin, handler, statuts, erreurs, flux>
- Écarts : <x>/<y> — Note : <x>/10
- Points forts : <ce qui était exact>
- Zones de faiblesse : <failles logiques, raccourcis, concepts manquants — priorité aux pièges de la banque>
- Explication flash : <analogie du monde réel de la partie manquante>
- Corrigé : <ce que la révélation a corrigé>
- Corrigé par : <apprenant | IA>  <!-- IA = échappatoire visible quand bloqué, check la signale -->
- Révélé le : <date>
```

## Règles

- Toujours prédire par écrit dans le chat **et** copier ici après la révélation.
- **Anti-vague** : avant chaque prédiction, l'IA montre un exemple neutre hors-sujet (cuisine, vélo, jardinage — cf. `AGENTS.md`) qui calibre la précision attendue sans fuiter la solution. Une prédiction doit nommer l'objet exact, le paramètre exact et sa valeur, l'ordre des étapes, et le cas d'échec avec sa cause. Si elle reste vague, l'IA demande de préciser l'élément manquant (une relance) puis compte les écarts.
- 3 questions de complétion max par prédiction, puis révélation avec explication du gap.
- 2 passes d'amélioration max par brique.
- Un reality check par phase (prédire ce qui va se passer à l'exécution, puis observer).
- L'apprenant tape lui-même les corrections (défaut : `Corrigé par : apprenant`). `Corrigé par : IA` est une échappatoire visible quand il est vraiment bloqué — le guard l'autorise, `ai-learn check` la signale.
