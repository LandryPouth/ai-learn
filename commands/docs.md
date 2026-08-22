---
description: "Gère les sources de doc : embarquées, URLs en ligne, ou recréées localement (--regen)"
argument-hint: "list | add <nom> <chemin|url|preset> [--online] [--regen] | remove <nom> | update <nom>"
allowed-tools: ["Bash"]
---

# ai-learn: docs

Gère les sources de documentation de référence du projet.

- **Mode local (défaut)** : copie la source dans `docs/sources/<nom>/` — on
  travaille hors-ligne, les citations du plan pointent vers ces chemins locaux.
- **Mode online (`--online`)** : enregistre l'URL seule, **aucun fichier** dans
  le projet — pour qui ne veut pas de stockage local.
- **Mode généré (`--regen`)** : la source n'est pas clonable, l'IA la **recrée
  localement** depuis un contenu en ligne vérifié (voir section dédiée).
- **Mode fichier (ex. livre PDF)** : un fichier (`.pdf`, `.epub`, `.tex`…) est
  embarqué **entier** comme origine vérifiée ; l'IA en **distille l'essentiel**
  dans un `.md` citant les pages (voir section dédiée).

Limite : **3 sources max** (y compris les sources générées). Une copie est une
« photo figée » : `update` la rafraîchit depuis son origine, `remove` la retire
(copie + entrée du ledger).

## Usage

```bash
# Voir les sources actuelles (et leur état : present / MISSING / online)
ai-learn docs list

# Embarquer une doc locale dans le projet (max 3)
ai-learn docs add <techno>-docs /chemin/vers/<techno>/docs

# N'embarquer qu'un sous-dossier de la source (ex. juste docs/, pas le repo entier)
ai-learn docs add <techno>-docs /chemin/vers/<techno> --path docs

# Cloner un repo GitHub (léger, --depth 1)
ai-learn docs add <techno> https://github.com/<org>/<techno>

# Mode online : URL seule, aucun fichier local
ai-learn docs add <techno> https://<techno>.dev/docs --online

# Mode généré : la source n'est pas clonable — l'IA la recrée localement
ai-learn docs add backend-roadmap https://roadmap.sh/backend --regen

# Source fichier (ex. un livre PDF) : embarqué entier, l'IA en distille l'essentiel
ai-learn docs add <techno>-book /chemin/vers/livre.pdf

# Preset (raccourci, voir section dédiée)
ai-learn docs add build-your-own-x

# Rafraîchir / retirer une source
ai-learn docs update <techno>-docs
ai-learn docs remove <techno>-docs
```

## Règle d'embarquement (copie sélective)

Copier la **doc + les exemples pédagogiques**, pas le repo entier : utiliser
`--path` pour ne prendre que `docs/`, `examples/`, etc. Ne jamais embarquer
`node_modules`, `.git`, `test/` (bruit non pédagogique).

## Recréer une source non clonable (`--regen`)

Certaines ressources utiles ne sont **pas clonables** comme doc : backends de
données (ex. developer-roadmap), sites générés, pages web non accessibles en
git. Pour celles-là, l'IA **ne copie pas** : elle **recrée la doc localement**
dans `docs/sources/<nom>/` à partir du contenu en ligne **vérifié**.

```bash
# Scaffolde docs/sources/<nom>/ + enregistre l'URL d'origine dans progress.json
ai-learn docs add <nom> <https://...> --regen
```

**Règle anti-hallucination — rien d'inventé, rien d'approximatif** :
1. **L'IA ne rêve jamais la doc.** Elle va chercher le contenu réel en ligne
   (URL d'origine enregistrée), puis le **transcrit localement** avec ses
   citations. Une affirmation non vérifiable est **marquée comme non vérifiée**,
   jamais inventée.
2. **Chaque affirmation cite l'origine.** Toute fiche ou résumé écrit dans
   `docs/sources/<nom>/` doit contenir l'URL d'origine (ou sa forme racine),
   pour que l'apprenant puisse vérifier — pas seulement croire.
3. **`check` enforce les trois garde-fous** (source générée) :
   - **sans URL d'origine** → erreur (rien à vérifier contre) ;
   - **dossier vide** → erreur (la recréation n'a pas eu lieu) ;
   - **doc qui ne cite pas l'origine** → warning.
   Le check échoue tant que la source n'est pas recréée et sourcée.

**Workflow de l'IA pour `--regen`** :
- `ai-learn docs add <nom> <url> --regen` → scaffold + provenance.
- Récupère le contenu en ligne vérifié, le **transcrit localement avec ses
  citations** — jamais de mémoire.
- Clôture : `ai-learn check` confirme que la source est recréée + sourcée.

## Source fichier (ex. livre PDF)

Un livre ou doc au format fichier (`.pdf`, `.epub`, `.tex`…) ne se clone pas —
mais il est **lisible par l'agent** (outil Read, page par page). L'outil
l'embarque **entier** comme origine vérifiée, puis l'IA **n'en distille que
l'essentiel** :

```bash
ai-learn docs add <techno>-book /chemin/vers/livre.pdf
```

- Le fichier est copié dans `docs/sources/<nom>/` : la **doc complète** reste
  disponible hors-ligne — l'apprenant peut la lire en entier plus tard, s'il
  veut.
- L'IA **cherche dans le document ce dont le plan a besoin**
  (`docs/plans/plan-apprentissage.md`) puis écrit `docs/sources/<nom>/essentiel.md` :
  chaque affirmation cite `livre.pdf:page N`. **Pas tout le livre : l'essentiel
  seulement.**
- **Anti-hallucination — rien d'inventé** : `check` exige un `.md` non vide qui
  cite `livre.pdf` — le même contrat que `--regen`, mais l'origine est un
  fichier local au lieu d'une URL.
- La banque de pièges (`ai-learn traps`) extrait ensuite les zones de friction
  de `essentiel.md` comme de n'importe quelle doc markdown ; le fichier d'origine
  (non markdown) est ignoré.
- `ai-learn docs update <nom>` re-copie le fichier depuis son origine locale.

## Presets (compléments, pas une roadmap)

Quatre raccourcis éprouvés pour des ressources **complémentaires** — l'outil reste
**libre**, ce sont des points d'entrée, pas une roadmap imposée :

```bash
# Clone le catalogue Build your own X (échelles de projets concrets, ladders)
ai-learn docs add build-your-own-x

# Recrée localement la roadmap backend (le repo est un data backend, inutile en clone)
ai-learn docs add developer-roadmap

# Recrée localement la spec Conventional Commits (module git/gh)
ai-learn docs add conventional-commits

# Recrée localement le manuel de la CLI gh (module git/gh)
ai-learn docs add gh-manual
```

- `build-your-own-x` → clone de `codecrafters-io/build-your-own-x`.
- `developer-roadmap` → `--regen` depuis `https://roadmap.sh/backend`.
- `conventional-commits` → `--regen` depuis `conventionalcommits.org/en/v1.0.0/`.
- `gh-manual` → `--regen` depuis `cli.github.com/manual/`.

## Banque de pièges (zones de friction)

Les docs embarquées regorgent d'avertissements (`> ⚠ Warning:`,
`> Security Consideration:`, « Do not », « Never »…) : c'est là que l'apprenant
se trompe **en croyant avoir compris**. L'outil les extrait **automatiquement** :

- **`docs add/update/remove` régénèrent** la banque de pièges à chaque
  changement de source :
  - `.ai-learn/traps.json` — version machine (`{schemaVersion, generatedAt, traps[]}`, chaque piège `{source, file, section, line, text}`) ;
  - `docs/plans/pièges.md` — version lisible, groupée par source → fichier,
    chaque piège citant `fichier:ligne`.
- **`ai-learn traps`** re-régénère à la main (ex. après avoir ajouté des
  sections à une source `--regen`).
- L'IA **sonde ces pièges** dans le protocole (cf. AGENTS.md) : avant chaque
  prédiction, elle consulte la banque pour la section lue et teste précisément
  ces zones dans le compte d'écarts et le feedback. Les pièges sont
  **extraits, jamais inventés**.

```bash
ai-learn traps
```

## Après

- Une source ajoutée est tracée dans `progress.json` → `docSource` avec
  provenance (URL, chemin local, `generated`/`generatedAt` pour `--regen`). Les
  citations du plan doivent pointer vers `docs/sources/<nom>/`.
- Vérifie que le check ne signale plus de source introuvable :
  `ai-learn check`.
