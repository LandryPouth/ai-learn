# Spec — Story 10.04 — Incident de code : casser, diagnostiquer, réparer

## User Value

L'apprenant s'entraîne à la compétence la moins délégable du métier : trouver une cause à partir d'un symptôme. L'outil casse son code sans dire où ; il prédit l'endroit avant d'ouvrir un fichier, répare, et l'outil compare sa prédiction au site réel, qu'il est le seul à connaître.

## Requirements

- `ai-learn break [--level 1|2]` et la commande visible `/learn-break` (quatrième commande).
- Préconditions, sinon refus exit 1 avec la raison : `progress.json` présent ; au moins une phase `done` avec checkpoint ; arbre git propre (le CLI lit `git status`, l'IA ne le lance pas) ; aucun incident actif ; pas de verrou `mutate` orphelin ; mode `apprenti` (en `dirigeant`, l'IA écrit l'implémentation : l'incident n'aurait pas de sens).
- Injection : moteur de `mutate.js` (`findAllSites`, `applyMutant`, `restoreOriginal`, verrou). Site tiré au hasard (générateur injectable pour les tests), appliqué, puis checkpoints des phases `done` relancés ; le site n'est gardé que si au moins un checkpoint tombe (panne détectable). Sinon restauration et nouveau tirage (20 essais max), puis refus « aucune panne détectable : tes tests ne couvrent pas assez le code ».
- Niveaux : **1** = n'importe quel site détectable, la sortie du checkpoint est montrée ; **2** = « victime ≠ coupable » : site dont le fichier n'apparaît pas dans la sortie du checkpoint qui tombe (vérifié mécaniquement).
- Secret : site + contenu d'origine dans `~/.ai-learn/incidents/<id-projet>.json` ; dans le projet, seulement `.ai-learn/incident.json` `{ active, level, startedAt, failingPhases }`. Le guard refuse à l'IA `Read`/`Grep`/`Glob` et les écritures sur `~/.ai-learn/incidents/**` (mur pour les outils, haie pour Bash).
- Protocole (`AGENTS.md` §3sexies) : symptôme → prédiction de type `debug` (`fichier:ligne` + mécanisme), enregistrée avant toute ouverture de fichier → expérience → réparation par l'apprenant. L'IA ne connaît pas le site et donne des indices sur la méthode, jamais sur l'endroit.
- `ai-learn break --resolve` : relance les checkpoints des phases `done` ; tous verts → incident clos, site révélé, comparaison avec la dernière prédiction `debug` (`exact` : même fichier, ligne ±2 ; `fichier` ; `manqué`) ; rouge → reste actif, sortie montrée.
- `ai-learn break --giveup` : restaure le contenu d'origine (la version de l'apprenant du fichier est sauvegardée dans `.ai-learn/incident-giveup/`), révèle le site, clôt avec `outcome: "abandon"`.
- Ledger `~/.ai-learn/tracks/debug.json` (calqué sur `tracks/git.js`) : palier 1 = incident résolu ; 2 = niveau 2 résolu ; 3 = site prédit `exact` avant la réparation. Le palier 4 (panne d'environnement) arrive en 10.05.
- `status` : incident actif en tête ; `next` : un incident actif passe avant la phase suivante.

## Acceptance Criteria

- [ ] Given un arbre git sale, when `ai-learn break`, then exit 1 « arbre git non propre » et aucun fichier n'est modifié.
- [ ] Given un projet dont un checkpoint couvre `src/a.js`, when `ai-learn break --level 1` (générateur fixé), then un seul site de `src/**` est modifié, `.ai-learn/incident.json` est actif et ne contient ni fichier ni ligne.
- [ ] Given aucun site détectable en 20 essais, when `break`, then exit 1, message de couverture, et chaque fichier est identique à avant (octet par octet).
- [ ] Given un incident de niveau 2, when on relit la sortie du checkpoint qui tombe, then elle ne contient pas le nom du fichier modifié.
- [ ] Given un incident actif et la panne réparée, when `break --resolve`, then incident clos, site affiché, palier 1 atteint dans `debug.json`.
- [ ] Given une prédiction `debug` `src/a.js:12` et un site réel `src/a.js:13`, when `--resolve` réussit, then la comparaison vaut `exact` et le palier 3 est atteint.
- [ ] Given un incident actif, when `break --giveup`, then le fichier retrouve son contenu d'origine, la version de l'apprenant est dans `.ai-learn/incident-giveup/`, l'issue `abandon` est notée, aucun palier n'est atteint.
- [ ] Given l'IA sous Claude Code, when elle tente `Read` sur `~/.ai-learn/incidents/x.json`, then le guard refuse.
- [ ] Given un processus tué pendant `break`, when on relance une commande `ai-learn`, then le verrou orphelin est réparé et le code restauré (contrat `recoverOrphanLock`).
- [ ] Given un incident actif, when `ai-learn next --json`, then `incident.active` vaut `true` et passe avant `next`.

## Edge Cases

- Mode `dirigeant` : refus.
- L'apprenant répare par un autre correctif que l'original : accepté si les checkpoints repassent.
- L'apprenant restaure via `git checkout` : accepté (limite assumée, README) ; la prédiction reste comparée.
- Projet sans opérateur de mutation pour sa stack : repli `FALLBACK_MUTATORS` comme `mutate`.

## Out of Scope

- Déclenchement automatique et pannes d'environnement (10.05).
- Tiers 4-6 de `pistes-non-mesurees.md` Partie A.
