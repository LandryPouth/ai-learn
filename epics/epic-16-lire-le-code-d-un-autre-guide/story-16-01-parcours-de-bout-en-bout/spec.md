# Spec — Story 16.01 — Ouvrir un dépôt étranger et le parcourir par arrêts

## User Value

L'apprenant ouvre une session dans un dépôt qu'il ne connaît pas, tape `/learn`, et l'agent lui propose un parcours de 6 à 10 arrêts. À chaque arrêt, il prédit où vit le mécanisme, lit, puis l'agent explique en citant des lignes réelles. Rien n'est écrit dans le dépôt étranger ; un mode d'emploi dans son dossier de lecture lui rappelle comment tout marche.

## Requirements

- `commands/learn.md` (routeur) : nouvelle ligne « un dépôt à **lire**, pas à construire (pas de `progress.json`, l'apprenant dit vouloir comprendre/prendre en main) » → `references/lecture.md` ; l'agent propose `parcours guidé` ou `questions libres`.
- `ai-learn tour start --source <chemin> [--alias <nom>] [--goal "<…>"]` : résout la source (absolue, relative, `~/`), crée `~/.ai-learn/reading/<alias>/` (`tour.json` v1, `.ai-learn/predictions.json`, `LISEZ-MOI.md` depuis `templates/lecture-lisez-moi.md`). Refuse un dossier qui a un `progress.json` (« c'est un projet d'apprentissage, lance `/learn` normal »).
- `ai-learn tour stop add --alias <a> --title "<…>" --file <f> --line <n> [--kind entree|demarrage|domaine|persistance|erreur|tests|autre]` : vérifie `fichier:ligne` sous la racine (`checkFileLineUnderRoot`) ; refus sinon. 10 arrêts au plus.
- `ai-learn tour next --alias <a> [--json]` : l'arrêt courant et ce qui est attendu : prédiction `lecture` (12.01, dans le dossier de lecture) avant la lecture, puis `predict --reveal --found` ; un arrêt est **visité** quand sa prédiction est révélée.
- `ai-learn tour status [--alias <a>]` : arrêts visités / total, par parcours ; sans alias, liste les parcours.
- `LISEZ-MOI.md` : ce qu'est le dossier, le déroulé d'un arrêt (prédire → lire → explication citée → question de vérification), les commandes, « rien n'est écrit dans le dépôt lu », ce qui viendra (diagramme, flux, test).
- **Questions libres (règle, pas de commande)** : `references/lecture.md` exige qu'en mode « questions libres » chaque réponse cite au moins un `fichier:ligne` réel du dépôt, lu avant de répondre ; une question générale qu'on ne peut pas citer est dite comme telle. Une question qui mérite d'y revenir devient un arrêt par `tour stop add` (vérification de 12.01). Décision du 2026-11-24 : l'ancienne story « questions libres citées » (`tour ask`) est réduite à cette règle.
- `references/lecture.md` : choisir les arrêts depuis le scan (`detectStack`, `package.json` `main`/`bin`/`scripts`, routes), ordre suggéré, une explication = des `fichier:ligne` réels, jamais de modification du dépôt.
- Docs : README (section « Lire un dépôt »), `project-context.md`, `architecture.md` (`tour.js`).

## Acceptance Criteria

- [ ] Given un dépôt fixture, when `tour start --source <repo>`, then `~/.ai-learn/reading/<alias>/` contient `tour.json` et `LISEZ-MOI.md` (home injecté), et l'arbre du dépôt est inchangé (empreinte avant/après).
- [ ] Given un dossier avec `progress.json`, when `tour start`, then exit 1 avec le message.
- [ ] Given `--file src/app.js --line 9999`, when `tour stop add`, then exit 1 et aucun arrêt n'est ajouté.
- [ ] Given un 11e arrêt, when `tour stop add`, then exit 1.
- [ ] Given un arrêt dont la prédiction `lecture` est révélée, when `tour status`, then « 1/n visités ».
- [ ] Given `tour next --json`, when un arrêt est courant sans prédiction, then `expected` vaut `predict`.
- [ ] Given le routeur `/learn`, when on lit `commands/learn.md`, then la route « dépôt à lire » renvoie à `references/lecture.md`.
- [ ] Given `commands/references/lecture.md`, when on cherche « questions libres », then la règle « chaque réponse cite un `fichier:ligne` réel, lu avant de répondre » y est.

## Edge Cases

- Deux parcours sur le même dépôt : alias distinct exigé (`--alias`), sinon reprise du parcours existant.
- Source supprimée ensuite : `tour status` signale « source introuvable » sans planter.

## Out of Scope

- Diagramme (16.02), flux (16.03), test de prise en main (16.04), incident (16.05).
