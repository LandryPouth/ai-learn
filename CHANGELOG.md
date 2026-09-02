# Changelog

<!-- Reconstitué depuis l'historique git réel (`git log` + les diffs de
     `package.json`), pas depuis la mémoire — voir story 01.06. Chaque ligne cite
     le hash court du commit qui l'a produite. Les entrées sont groupées par la
     valeur réelle de `version` dans `package.json` au moment de chaque commit
     (les trois commits `chore(release): bump version X -> Y` marquent les
     frontières et ne sont pas listés eux-mêmes) — pas par date de calendrier. -->

Toutes les versions notables d'`ai-learn` sont documentées ici. Le format suit
grossièrement [Keep a Changelog](https://keepachangelog.com/).

## 0.4.0 — depuis le 2026-08-24

`package.json` est à `0.4.0` depuis le bump `5a69921` ; aucun bump ultérieur
n'existe encore dans l'historique, donc cette section reste ouverte.

- `185fe82` fix(ai-learn): corrige la dérive verify/check et oriente checkpoint/predictions
- `67443c5` feat(ai-learn): trois états du verdict — périmé et in_progress non bloquant (story 01.01)
- `6d2890f` test(ai-learn): couvre la stabilité du digest face à un séparateur backslash (story 01.01)
- `e85cd94` chore(coding-flow): commit epic-01 planning scaffold and setup upgrade

## 0.3.0 — 2026-08-22

- `bb77e58` feat(ai-learn): adaptateur Antigravity (5e plateforme)
- `98fc7ff` feat(ai-learn): module git/gh + renforcement de la méthode d'apprentissage
- `985806a` feat(ai-learn): norm checker clean-code mécanique (blocage dur)

## 0.2.0 — 2026-08-21

- `d0c17e2` feat(ai-learn): self-heal mécanique multi-plateforme + ai-learn upgrade

## 0.1.0 — 2026-08-20

Version initiale.

- `2384055` feat(ai-learn): crée le CLI d'apprentissage evidence-based (init/status/verify/check)
- `027b3c9` feat(ai-learn): ajoute la commande next pour s'orienter
- `51bca18` feat(ai-learn): ajoute la machinerie Claude Code — 5 commandes /apprenant
- `d3f48f6` feat(ai-learn): rend la preuve automatique — supprime /verify, ajoute le backstop checkpoint non prouvé
- `3592b15` feat(ai-learn): embarque le protocole d'apprentissage — init l'écrit dans le projet
- `b2623be` feat(ai-learn): guard apprenant, banque de pièges, update/scan/propose/docs + tests
- `1c932c6` chore(ai-learn): prépare la publication open-source — CI, lockfile, README, metadata
- `5245df8` fix(ai-learn): réponse à la revue — guard bash honnête, propose forme+existence, banque web, révélation à trous
- `b1264fc` fix(update): rafraîchit docs/solutions/README.md quand il dérive du template
- `88b6e9f` fix(scan,check,traps): réponse à la 2e revue — seuils gameables, niveau optimiste, citations fantômes, présence non-preuve, admonitions non reconnues
- `0811158` refactor(ai-learn): stack packs pluggables + neutralise scan.js/propose.js + durcit concept/niveau
- `fca8ae6` docs(ai-learn): neutralise les derniers exemples illustratifs Fastify
- `76e1efd` fix(check,scan): vérifie mécaniquement les trous de révélation + corrige la régression js-hooks
- `b197898` feat(ai-learn): journal de friction auto-embarqué par projet
- `94b08bf` feat(ai-learn): installeur générique + adaptateur Codex CLI
- `5cbee6a` feat(ai-learn): garde-fou Codex mécanique + adaptateurs Gemini/OpenCode + fix Windows + dogfood par plateforme
- `4b6b83c` feat(check): ai-learn check écrit lui-même les entrées dogfood sur câblage cassé
- `4233d76` test(ai-learn): vérifie l'intégration réelle avec les CLIs locaux disponibles
