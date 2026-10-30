# Spec — Story 09.03 — Un garde-fou sans angle mort

## User Value

Ce qui règle la sévérité des contrôles (preuve exigée, seuils de norme, périmètre de mutation, journal de prédictions) n'est modifiable que par l'apprenant ou par le CLI. Une prédiction est enregistrée **avant** la révélation, et l'outil peut le vérifier. Quand le garde-fou est éteint, `check` le dit et `update` le rallume.

## Requirements

- **Réglages protégés** : `.ai-learn/tutor.json`, `.ai-learn/norm.json`, `.ai-learn/mutate.json`, `.ai-learn/predictions.json` rejoignent `PROTECTED_FILES` : mur pour Write/Edit/MultiEdit/NotebookEdit, haie pour Bash (mêmes détecteurs que `guard.json`). `ai-learn predict` (CLI) reste la seule voie d'écriture des prédictions pour l'IA.
- **Prédiction en deux temps** :
  - `ai-learn predict --phase <id> --prediction "…" [--type …]` enregistre la prédiction seule (`at` = maintenant, `revealedAt` absent) et affiche son `id`.
  - `ai-learn predict --reveal <id> --score … --gaps … --strengths … --weaknesses … --flash … [--corrected …]` complète l'entrée et estampille `revealedAt`.
  - Une prédiction sans `revealedAt` compte pour `predictionsRequired` (elle a bien été écrite avant) ; `check` avertit si une prédiction reste non révélée plus de 7 jours.
  - L'ancienne forme en un temps reste acceptée (rétro-compatible) et produit `at == revealedAt`, signalée par `check` comme « enregistrée après coup » (information).
- **AGENTS §2** : l'IA lance `predict` dès que l'apprenant a écrit sa prédiction, avant tout feedback, puis `predict --reveal` après la révélation.
- **Hook mort** : `check` lit le chemin du script dans chaque hook ai-learn (`guard`, `norm --hook`, plugin OpenCode, profil Codex) ; si le fichier n'existe pas → **erreur** « garde-fou éteint : le hook pointe vers <chemin> qui n'existe plus — `ai-learn update` ». `update` remplace un chemin mort par celui de l'outil courant (un chemin vivant vers une autre installation reste conservé, comportement actuel).

## Acceptance Criteria

- [ ] Given le mode apprenti, when l'IA tente Write sur chacun des 4 fichiers de réglage, then `deny` avec un motif qui nomme le fichier et la voie légitime.
- [ ] Given `echo x > .ai-learn/tutor.json` via Bash, when le guard décide, then `deny`.
- [ ] Given `ai-learn predict --phase 1 --prediction "…"`, when on relit `predictions.json`, then l'entrée a `at` et pas de `revealedAt`, et compte pour la phase.
- [ ] Given `predict --reveal <id> --score 7/10 …`, when on relit, then `revealedAt` ≥ `at` et les champs de feedback sont présents ; un `id` inconnu → exit 1, fichier inchangé.
- [ ] Given une entrée en un temps (ancienne forme), when `check`, then une information « enregistrée après coup » apparaît, sans erreur.
- [ ] Given une prédiction non révélée depuis 8 jours, when `check`, then un avertissement la nomme.
- [ ] Given `.claude/settings.json` dont le hook guard pointe vers un fichier absent, when `check`, then erreur « garde-fou éteint » et `check` échoue.
- [ ] Given ce même projet, when `ai-learn update`, then le hook pointe vers l'outil courant et `check` repasse.
- [ ] Given un hook pointant vers une autre installation qui existe, when `update`, then il est conservé.

## Edge Cases

- L'apprenant édite `norm.json` dans son éditeur : rien ne change (le guard ne voit que l'IA).
- `mode dirigeant` : mêmes fichiers protégés.
- Chemin de hook entre guillemets, avec espaces, ou forme Windows.

## Out of Scope

- Une commande CLI pour régler `tutor`/`norm`/`mutate` : l'apprenant édite ses fichiers ; à rediscuter si le journal de friction le demande.
