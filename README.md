# ai-learn

**Evidence-based learning tracks.** `ai-learn` turns a learning path into a checked, shareable structure: every phase is proven by an executed checkpoint, tracked in a `progress.json` ledger, and cross-checked against reality — not by the word of an AI that could decide to skip the rule.

The problem it answers is the same one Coding Flow answers for engineering work, applied to learning: *"the agent said the phase was done"* is worth nothing. Only the CLI can say `PROVEN` and mean it — it runs the checkpoint itself.

> **Status : non publié.** Utilisé et affûté dans `tech-experiments` avant release. Pas encore sur GitHub ni npm.

## What it gives you

| Mécanisme | Rôle |
|---|---|
| `ai-learn init` | Scaffolde un projet d'apprentissage : `progress.json` (le ledger), `docs/plans/`, `checkpoint/`, journal de prédictions |
| `ai-learn verify <phase>` | Exécute le checkpoint de la phase, capture la sortie verbatim, écrit l'évidence, marque `done` **seulement si ça passe vraiment** |
| `ai-learn check` | Scan une racine (ex. un monorepo) : croise chaque `progress.json` contre la réalité — phase `done` sans évidence = erreur |
| `ai-learn status` | Vue lisible des phases et de leur état |
| `ai-learn next` | La prochaine phase à faire (et alerte sur les phases `done` sans évidence) |

## Install / usage (local, sans release)

```bash
node /chemin/vers/ai-learn/bin/ai-learn.js --help
```

Ou un alias :

```bash
alias ai-learn="node ~/dev/tools/ai-learn/bin/ai-learn.js"
```

## La philosophie

- **La preuve est exécutée, pas déclarée.** `verify` lance le checkpoint lui-même. « L'agent a dit que les tests passaient » ne vaut rien.
- **Le suivi est des données, pas de la prose.** `progress.json` est commité et inspectable ; `check` le lit et le compare aux fichiers.
- **Le check est la ceinture de sécurité.** C'est lui qui rend visible un AGENTS.md qu'on « oublie » : une phase `done` sans évidence, un artefact manquant, un journal de prédictions vide → erreur ou warning, exit 1.
- **Ce qu'il ne peut pas garantir : la cognition.** Le tool prouve les preuves visibles (tests, artefacts, journal) ; l'honnêteté de la prédiction reste humaine. Même contrat que Coding Flow : il prouve que les tests tournent, pas que l'agent a raisonné.

## Friction tool

Toute friction rencontrée en utilisant `ai-learn` est notée dans [`docs/DOGFOODING.md`](docs/DOGFOODING.md) — jamais masquée.
