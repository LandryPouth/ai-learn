---
description: "Analyse un projet existant : où tu en es + suite d'approfondissement (jamais de reprise à zéro)"
argument-hint: ""
allowed-tools: ["Bash", "Read", "Write"]
---

# ai-learn: scan

Pour un projet déjà avancé (ex. un RPG en C, une API web) qu'on continue
de maîtriser : `scan` analyse le code réel, montre **où l'on en est** (stack,
git, tests, concepts mobilisés, niveau estimé) et propose une **suite
d'approfondissement** — des directions strictement plus profondes, jamais une
reprise à zéro.

## Étapes

1. **Lancer le scan** dans le projet :

```bash
ai-learn scan
```

2. **Lire le rapport objectif** : la sortie humaine + `.ai-learn/scan.json`
   (concepts → `concepts.used` avec leurs `evidence`, niveau → `level`,
   directions → `suggestions`).

3. **Résumer à l'utilisateur** : niveau estimé, concepts déjà mobilisés, et les
   directions proposées. Ne pas les appliquer telles quelles.

4. **Affiner les directions en phases réelles** : chaque `suggestion` devient
   1-2 phases de parcours, avec un **checkpoint exécutable** et des prédictions
   écrites attendues — en citant la **doc locale** indiquée dans
   `suggestion.doc` (ex. `docs/sources/<nom>-docs — Reference`) si
   elle existe dans le projet, sinon la doc officielle en ligne.

   Une `suggestion` avec `mandatory: true` (ex. `g-arch` une fois qu'un
   fichier dépasse le seuil mesuré) **doit** devenir une phase — ce n'est
   plus une proposition parmi d'autres à l'appréciation de l'IA, contrairement
   aux directions ordinaires. Le rapport humain la marque `⚠ OBLIGATOIRE`.

5. **Matérialiser le parcours** :
   - **Aucun `progress.json`** → `ai-learn init --phases '<json>' --technology <stack>`
     dans le même dossier (init est non-destructif).
   - **`progress.json` existant** → **étendre** le ledger : ajouter les
     nouvelles phases en `pending` (jamais `done`, jamais `in_progress` sans
     travail), sans modifier ni supprimer les phases existantes.

6. **Montrer la suite** : `ai-learn status` puis `ai-learn next` pour démarrer
   la première nouvelle phase.

## Contraintes (non-régression)

- Le scan est **read-only** : le seul fichier écrit est `.ai-learn/scan.json`.
  Ne jamais le modifier à la main pour « ajuster » le niveau.
- Les directions prolongent le code existant : **aucune reprise à zéro**, aucun
  rebuild d'un composant déjà maîtrisé.
- Les phases ajoutées respectent le mode apprentissage : checkpoint prouvable,
  prédictions écrites, `verify` seul peut marquer `done`.
