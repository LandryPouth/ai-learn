# Story 08.04 — Windows natif : ce qui marche, ce qui est dit

## Goal

Sous Windows natif, `ai-learn` ne casse pas sur un chemin avec espace ni sur l'absence de `trash`, et le README dit exactement ce que la garde ne voit pas (PowerShell, `cmd`).

## Risk

Faible côté code ; le risque est de promettre une protection non observée. Aucune affirmation « supporté » sans preuve sur `windows-latest`.

## Acceptance Criteria

- [ ] Given un projet dont le chemin de l'outil contient un espace, when `ensureGuardHook` écrit la commande du hook Claude, then la commande est quotée et exécutable ; un test exécute la commande écrite et obtient un refus attendu.
- [ ] Given l'absence de `trash` (cas Windows), when `docs` doit supprimer un fichier, then un repli explicite (ou un message clair avec la commande à lancer) est utilisé, jamais `rm -rf` ; le test simule `trash` absent.
- [ ] Given un `Set-Content` ou un `copy` PowerShell/`cmd` visant `src/**`, when la garde est lue, then le README liste ces formes sous « ce que la garde ne voit pas » et un test fige le comportement actuel (non analysé, donc autorisé) pour que le changement futur soit visible.
- [ ] Given la matrice CI, when elle tourne sur `windows-latest`, then les nouveaux tests passent ; si un test est ignoré sous Windows, la raison est écrite dans le test.
- [ ] Given le plugin OpenCode de 08-01, when il est généré sous Windows, then ses chemins sont corrects (séparateurs, espaces) ; la preuve de refus sur Windows n'est pas revendiquée tant qu'elle n'est pas observée.
- [ ] Given un README relu, when la section Windows est lue, then elle distingue « testé en CI », « observé en session » et « non vérifié ».

## Edge Cases

- [ ] Chemins `C:\…` et `\\?\`, insensibilité à la casse déjà gérée par `guard.js` : ne pas régresser.
- [ ] Commandes `verify` rédigées en bash qui échouent sous `cmd.exe` : un message d'`init`/`check` renvoie vers la portabilité (`npm test`, `node script.js`).

## Out of Scope

- Enseigner à la garde la grammaire PowerShell/`cmd`.
- Hook git `pre-push` en Node.
