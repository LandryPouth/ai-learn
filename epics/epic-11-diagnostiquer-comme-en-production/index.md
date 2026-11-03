# Epic 11 — Diagnostiquer comme en production

## Goal

Faire de `ai-learn break` un entraînement aux pannes qu'on rencontre réellement : mesurer le second avis de l'IA contre la vérité que seul l'outil connaît, injecter des pannes sémantiques (pas seulement des mutants syntaxiques), montrer un symptôme de production plutôt que la sortie d'un test, et retrouver le commit fautif d'une régression avec `git bisect`.

## Business Value

À l'ère de l'IA, la compétence la moins délégable est de partir d'un symptôme pour trouver une cause, et de savoir juger l'hypothèse que propose l'IA. Aujourd'hui `break` n'a que deux opérateurs (`boolean-literal`, `comparison-operator`), son symptôme est toujours la sortie d'un checkpoint (ou une panne d'environnement au niveau 3), et rien ne mesure si l'IA aurait trouvé, ni si l'apprenant sait la contredire.

Origine : 3 entrées du `.ai-learn/dogfood.md` de ce dépôt (2026-11-03) issues du « fil diagnostic » ajouté au parcours tech-experiments : pannes sémantiques et symptômes de prod, `git bisect`, protocole « second avis IA ».

## Scope

Inclus :

- [ ] Second avis IA enregistré et comparé mécaniquement au site réel à `--resolve` ; agrégé dans `~/.ai-learn/tracks/debug.json` ; protocole dans `AGENTS.md` §3sexies.
- [ ] Banque de pannes sémantiques par pack (`faults`), tirées par `break` seulement, jamais par `mutate`.
- [ ] Niveau 4 : symptôme de production produit par une commande déclarée par le projet (`incidents.symptomCommand`), palier debug 5.
- [ ] Incident « régression dans l'historique » : historique jetable construit par l'outil, commit fautif secret, palier git 7.

Exclus :

- [ ] Un pack Go (`bin/lib/stacks/go.js`) : les projets Go du parcours retombent sur `FALLBACK_MUTATORS`. Epic à part si le journal de friction le montre.
- [ ] Pannes sémantiques pour le pack C (`mini-*-cpp`) : différées, même raison.
- [ ] Les paliers 4-5 de `pistes-non-mesurees.md` Partie A (non déterministe, lenteur).
- [ ] Générer le symptôme de production à la place du projet : l'outil exécute la commande déclarée, il ne sait rien de pino, Sentry ou Grafana.

## Décisions de l'epic

- **Promotion sans friction observée, décidée par l'utilisateur (2026-11-03).** Les entrées du dogfood sont des manques relevés en concevant le parcours, pas des frictions vécues. La règle de `pistes-non-mesurees.md` ne les promouvrait pas. Comme pour l'epic 10, l'utilisateur tranche ; compensation identique : chaque story ajoute une ligne `docs/DOGFOODING.md` si son palier n'est jamais atteint après trois incidents réels.
- **La vérité reste à l'outil.** Toute comparaison (site, commit, second avis) se fait contre le secret de `~/.ai-learn/incidents/`, jamais contre une déclaration de l'apprenant ou de l'IA.
- **`mutate` ne change pas.** Les pannes sémantiques vivent dans un champ `faults` distinct de `mutators` : ajouter des opérateurs à `mutate` ferait tomber des phases déjà prouvées (mutants survivants nouveaux), donc des preuves vertes deviendraient rouges sans que l'apprenant ait rien changé.

## Backbone

Backbone: incident déclenché → symptôme lu → hypothèse de l'apprenant → second avis IA → cause localisée (ligne, commit) → réparation prouvée → ledger

Chaîne simple `s1 → s2 → s3 → s4` : les quatre stories modifient `bin/lib/incident.js` et `templates/AGENTS-apprentissage.md` §3sexies, donc pas de parallèle sûr. `s4` ne dépend pas de `s3` fonctionnellement, mais partage les mêmes fichiers. Ordre de consommation côté parcours : `s1` sert dès `fastify-traducteur-api` phase 9 ; `s2`/`s3` servent `prodready-api` phase 13 ; `s4` sert `prodready-api` (fil diagnostic).

`s4` construit aussi la banque de transformations neutres (`NEUTRAL_TRANSFORMS`) que réutilise l'epic 12 (story 12.03).

## Stories

1. **story-11-01-second-avis-ia-mesure** — walking skeleton : prédiction `--by ia` → comparaison à `--resolve` → `debug.json` → `status` → §3sexies.
2. **story-11-02-pannes-semantiques**
3. **story-11-03-symptome-de-production**
4. **story-11-04-regression-dans-l-historique**

## Context Strategy

- Mode : `s1` `STANDARD` ; `s2`, `s3`, `s4` `STRICT` (écriture dans `src/**` de l'apprenant ; `s4` crée une branche et des commits dans son dépôt).
- Scout pre-step : aucun, fichiers et ancres nommés dans chaque story.
- Modèles à calquer : `incident.js#trial` (injection + détectabilité), `mutate.js#MUTATION_OPERATORS` (forme d'un opérateur), `tracks/debug.js` (palier optionnel via `REQUIRED_TIER_IDS`), `incidents/env.js` (enregistrement secret et restauration).
- À ne pas toucher sans décision : la grammaire shell de `guard.js`, `scan.js`, la liste `mutators` des packs.

## Après livraison (hors dépôt)

Mettre à jour l'outil installé, lancer `ai-learn update --root` dans `tech-experiments`, puis retirer des plans les contournements notés le 2026-11-03 (protocole recopié, scripts d'incident fournis, « en attente » pour `bisect`).

## Clarification Readiness

ready — choix tranchés par hypothèses étiquetées dans chaque `plan.md` (`## Decisions`), à valider par l'utilisateur avant `/flow-run` : second avis enregistré par l'IA elle-même via le CLI ; niveau 4 conditionné à une commande déclarée par le projet ; `bisect` sur une branche jetable du dépôt de l'apprenant plutôt que sur un clone.
