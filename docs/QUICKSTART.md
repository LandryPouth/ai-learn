# Quickstart

## 1. Initier un projet d'apprentissage

```bash
ai-learn init --dir ./fastify-traducteur-api --technology Fastify \
  --doc-source ~/dev/learning/fastify/fastify-main/docs
```

Crée (sans rien écraser) :
- `progress.json` — le ledger des phases
- `docs/plans/plan-apprentissage.md` — le plan (à remplir)
- `docs/plans/predictions.md` — le journal de prédictions
- `checkpoint/` et `.ai-learn/runs/` — les tests de phase et les évidences

## 2. Construire le parcours avec `/learn`

Dans ton agent, lance `/learn` : il pose les questions, rédige le plan et
écrit les phases dans `progress.json` à ta place. Tu n'édites pas `progress.json`
à la main — `/learn-next` te dit toujours quelle est la prochaine action
(et met le projet à niveau si l'outil a changé).

Une phase ressemble à :

```json
{
  "id": 1,
  "name": "Routes/Lifecycle",
  "status": "pending",
  "checkpoint": "node --test checkpoint/phase-1.test.mjs",
  "artifacts": ["docs/phase-1-routes-lifecycle.md"],
  "predictionsRequired": 2
}
```

Les prédictions se font en deux temps, avant la révélation :
`ai-learn predict --phase 1 --prediction "..."`, puis `ai-learn predict --reveal <id> ...`.

## 3. Valider une phase

```bash
ai-learn verify 1
```

Exécute `node --test checkpoint/phase-1.test.mjs`, écrit l'évidence dans `.ai-learn/runs/`, et marque la phase `done` si et seulement si la commande passe.

## 4. Vérifier tout un monorepo

```bash
ai-learn check --root ../tech-experiments
```

- phase `done` sans évidence → **erreur** (exit 1)
- artefact manquant → **erreur**
- évidence existante mais phase pas `done` → warning (drift)
- journal de prédictions incomplet → warning

## Le cycle d'apprentissage

```
init → plan + phases → (prédiction écrite → révélation → amélioration) → verify → check
```
