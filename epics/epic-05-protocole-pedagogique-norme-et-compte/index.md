# Epic 05 — Le protocole pédagogique est normé et compté

## Goal

Transformer les règles de session que l'apprenant a dû dicter à la main (synthèse ciblée, relecture du code avant notation, cas d'échec, pas de solution avant la frappe) en sections normées d'`AGENTS.md`, et rendre le reality check aussi mécanique que les prédictions de code.

## Business Value

Sept entrées du journal du projet appris disent la même chose : l'apprenant a dû **demander explicitement** à l'IA de faire ce que le protocole aurait dû imposer (relire `src/**` avant de noter, inclure le cas d'échec, ne pas montrer d'exemple concret avant sa frappe, expliquer la commande git, structurer la synthèse). Chaque demande est une règle de session qui disparaît avec la session — et le prochain apprenant la redécouvre. En parallèle, le reality check — « la seule boucle non truquable » — est le seul mécanisme sans compteur (`docs/plans/pistes-non-mesurees.md`, Partie C, la seule dont la condition de promotion est déjà remplie).

## Scope

Inclus :

- [ ] Troisième type de prédiction `reality` et `predictionsRequired` ventilé par type (Partie C).
- [ ] §1bis `AGENTS-apprentissage.md` : format de synthèse ciblée (problème concret → mécanisme → exemple voisin → invitation à questionner → prédiction).
- [ ] Relecture obligatoire de `src/**` avant notation et avant révélation ; cas d'échec dans chaque question de prédiction.
- [ ] Pas d'exemple de solution concrète avant la frappe de l'apprenant ; révélation dans le chat par défaut, `docs/solutions/` optionnel.
- [ ] Profil de tuteur (`.ai-learn/tutor.json`) et preuve de transfert, enregistrée séparément de la preuve par tests.

Exclus :

- [ ] Le mécanisme de mutation (epic 02).
- [ ] Une note chiffrée automatique des prédictions — la notation reste faite par l'IA, le moteur ne compte que présence et antériorité.
- [ ] Tout contenu propre à un stack (reste dans les packs).

## Backbone

Backbone: prédire (3 types comptés) → synthèse ciblée → relecture du code réel → notation → révélation sans solution prématurée → clôture

Chaîne simple : `s1` pose les types de prédiction dans le moteur ; `s2` à `s5` modifient tous `templates/AGENTS-apprentissage.md`, donc strictement séquentiels (`s5` réutilise en plus les types de `s1`).

## Stories

1. **story-05-01-reality-check-compte**
2. **story-05-02-format-de-synthese-ciblee**
3. **story-05-03-relire-avant-noter-et-cas-d-echec**
4. **story-05-04-pas-de-solution-avant-la-frappe**
5. **story-05-05-profil-de-tuteur-et-preuve-de-transfert**

## Context Strategy

- Mode d'exécution par défaut : `STANDARD` (voir chaque story ; le mode dirigeant porte des stories `STRICT`).
- Scout pre-step : aucun — chaque story nomme ses fichiers et ses ancres.
- Zones à ne pas toucher sans décision : `scan.js` (moteur de détection), `guard.js` hors epic 03.

## Clarification Readiness

ready — les stories reposent sur des entrées observées (`docs/DOGFOODING.md` et le journal du projet `fastify-traducteur-api`) et sur des décisions déjà verrouillées dans `docs/roadmap.md`. Les « Décisions à prendre » restantes sont des choix de conception à trancher dans le `plan.md` de chaque story, pas des questions bloquantes.
