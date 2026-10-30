# Plan — Story 09.04

## Implementation Context

Fichiers probables :

- bin/lib/init.js (`.gitignore`, dossier choisi, refus d'imbrication)
- bin/lib/update.js (`.gitignore` complété)
- bin/lib/progress.js (`findProjectDir`, erreur JSON détaillée dans `readProgress`)
- bin/lib/util.js (`readJson` qui garde l'erreur de parsing)
- bin/ai-learn.js (résolution de `dir` commune à toutes les sous-commandes)
- bin/lib/check.js (détail JSON)
- commands/learn.md (§5 : le projet est créé dans `./<nom>/` si besoin)
- package.json (`files`)
- test/init.test.js, test/update.test.js, test/cli.test.js, test/package.test.js (nouveau)

Ancres : `scaffold({ dir, project`, `Initialized learning project`, `No progress.json in`, `findProjectRoot`, `readJson`

Mode : `STANDARD` · scout pre-step : `no`

À éviter : changer le contenu des fichiers scaffoldés autres que `.gitignore`.

## Decisions

- **Ignorer `.ai-learn/runs/`** : les évidences contiennent le chemin absolu de la machine et la fin des sorties de test (fuite possible au push public du palier `gh`). La preuve reste locale ; le projet Fastify l'ignorait déjà à la main.
- **Dossier dérivé de `--project` seulement quand le cwd n'est pas le projet** : préserve `/learn` lancé depuis un dossier déjà créé pour le projet, corrige le cas « dossier conteneur » reproduit deux fois.
- **Remontée commune** : une seule fonction, utilisée par le CLI avant la distribution des sous-commandes, au lieu de chaque commande.

## Test Plan

Fixtures de dossiers (vide, conteneur, sous-dossier de projet) ; `.gitignore` absent / partiel / CRLF ; JSON tronqué ; `npm pack --dry-run --json` (sans réseau).

## Acceptance Traceability

| Critère | Preuve |
|---|---|
| gitignore créé | test/init.test.js::init writes the ai-learn gitignore block |
| gitignore complété | test/update.test.js::update completes gitignore without touching custom lines |
| conteneur | test/init.test.js::init --project in a container creates ./<name>/ |
| dossier vide | test/init.test.js::init --project in an empty dir uses it |
| imbriqué | test/init.test.js::init refuses inside an existing project |
| sous-dossier | test/cli.test.js::commands find the project from a subdirectory |
| JSON corrompu | test/cli.test.js::a corrupt progress.json is named with its position, never init |
| paquet | test/package.test.js::the npm package ships commands/ |

## Commands

```
npm test
```
