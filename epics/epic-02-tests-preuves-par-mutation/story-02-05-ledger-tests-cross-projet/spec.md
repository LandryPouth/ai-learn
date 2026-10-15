# Story 02.05 — Ledger cross-projet `tests.json`

## Goal

Mémoriser la maîtrise du test-driven-avec-mutation à travers tous les projets
de l'apprenant, comme `~/.ai-learn/tracks/git.json` le fait déjà pour git/gh —
6 tiers, jamais remis à zéro, avec un tier « rouge d'abord » qui se lit
**depuis les évidences déjà sur disque**, jamais depuis une déclaration.

## User Value

Sans ledger cross-projet, chaque nouveau projet d'apprentissage repartirait de
zéro sur la mutation, alors que `tracks/git.json` a déjà établi que ces
compétences se cumulent projet après projet. Le tier « rouge d'abord » est la
partie la plus difficile à prouver mécaniquement : il faut observer qu'un test
a réellement échoué *avant* de passer, pas seulement qu'il est vert maintenant
— sinon rien ne distingue un TDD réel d'un test écrit après coup pour faire
plaisir au ledger.

## Context

`bin/lib/tracks/git.js` est le gabarit exact à reproduire : ledger versionné et
validé (`readOrDefaultGitTracks`/`validateGitTracks`), home-scopé et injectable
pour les tests (`{ home = os.homedir() }`), `TIER_IDS` fixe, `syncGitTrack`
appelé uniquement depuis `verify.js` sur une évidence qui vient réellement de
passer. Le tier « rouge d'abord » n'a pas d'équivalent dans `git.js` (ses
tiers sont tous « a fait X au moins une fois ») — c'est la seule vraie nouveauté
méthodologique de cette story, et elle doit s'appuyer sur des faits déjà écrits
sur disque : les évidences successives d'une même phase dans
`.ai-learn/runs/*-verify.json`, triées par horodatage.

Les 6 tiers pressentis (`docs/roadmap.md`) restent à nommer précisément dans
cette story — le roadmap ne fixe que leur existence, pas leur contenu détaillé,
contrairement aux 6 tiers de `git.json` qui étaient déjà énumérés
(`docs/plans/git-gh-renforcement-domaine.md`). Cette story doit donc les
définir explicitement avant d'écrire le ledger.

## Requirements

- [ ] `bin/lib/tracks/tests.js` (nouveau) reproduit le schéma de `tracks/git.js` :
      `version`, `tiers` (6 entrées `{ achieved, evidence }`), `projects`,
      lecture/écriture home-scopées et injectables.
- [ ] Les 6 tiers sont définis explicitement dans cette story (voir Decisions
      du plan) et documentés dans le fichier lui-même (commentaire, même style
      que `git.js` qui renvoie vers son plan source).
- [ ] Le tier « rouge d'abord » est détecté en lisant, pour une même phase, une
      évidence `mutation.ok: false` (ou un mutant explicitement survécu)
      **suivie chronologiquement** d'une évidence `mutation.ok: true` — jamais
      déclaré, toujours observé depuis `.ai-learn/runs/*-verify.json`.
- [ ] `syncTestsTrack({ dir, phase, verifyEvidence, home })` est appelée depuis
      `verify.js`, dans le même bloc `try/catch` isolé que `syncGitTrack`/
      `syncDomainLedger`, seulement quand `verifyEvidence.ok === true`.
- [ ] Un tier progresse et ne régresse jamais (même discipline que `git.json` :
      `achieved` ne repasse jamais à `false`).
- [ ] `ai-learn status` (ou une nouvelle sous-commande, à trancher dans le
      plan) affiche l'état des tiers atteints — cohérent avec la façon dont le
      ledger git est déjà consultable (à vérifier : si `git.json` n'a
      aujourd'hui aucun affichage dans `status`, ne pas en inventer un pour ce
      ledger seul seulement — rester symétrique).

## Acceptance Criteria

- [x] Given une phase `mutation: true` dont deux évidences successives
      existent dans `.ai-learn/runs/` — la plus ancienne avec `mutation.ok:
      false`, la plus récente avec `mutation.ok: true` — when `ai-learn verify`
      tourne à nouveau avec succès, then le tier « rouge d'abord » de
      `~/.ai-learn/tracks/tests.json` passe à `achieved: true`.
- [x] Given une phase dont la seule évidence est déjà `mutation.ok: true` (pas
      d'échec antérieur observé), when `ai-learn verify` tourne, then le tier
      « rouge d'abord » **n'est pas** marqué atteint pour cette phase — l'ordre
      observé doit être réel, pas supposé.
- [x] Given un tier déjà `achieved: true` dans le ledger, when un `verify`
      ultérieur ne retouche pas ce tier, then il reste `achieved: true` (jamais
      remis à zéro).
- [x] Given deux projets différents utilisant le même `$HOME`, when chacun
      exécute `ai-learn verify` avec succès sur une phase `mutation: true`, then
      les deux contribuent au même ledger cross-projet, avec chaque projet listé
      séparément dans `config.projects`.
- [x] Given un ledger `tests.json` corrompu ou de version inconnue, when
      `ai-learn verify` tourne, then le sync échoue silencieusement (n'interrompt
      jamais `verify`) et repart d'un ledger par défaut au prochain sync réussi
      — même discipline que `syncGitTrack`/`syncDomainLedger`.

## Edge Cases

- [ ] Plusieurs évidences `mutation.ok: false` consécutives avant la première
      `true` — compte comme « rouge d'abord » dès la première transition
      false→true observée, pas seulement s'il n'y a eu qu'un seul échec.
- [ ] Évidences non triées par nom de fichier dans un ordre chronologique fiable
      (horodatage dans le nom, déjà garanti par `writeEvidence` — vérifier que
      le tri lexicographique du nom de fichier suffit, comme `findEvidence` le
      suppose déjà pour `latestEvidenceForPhase`).
- [ ] Phase sans jamais aucune évidence `mutation` (phase.mutation jamais
      activé) — n'alimente aucun tier, ne casse rien.
- [ ] Le répertoire `.ai-learn/runs/` a été nettoyé/supprimé entre deux
      `verify` — le tier « rouge d'abord » ne peut plus être observé
      rétroactivement pour cette phase ; documenté comme limite connue
      (l'observation dépend de la conservation des évidences), pas un bug.

## UX Notes

Sans affichage dédié pour l'instant (voir Requirements — rester symétrique avec
`git.json`), le seul contrat visible de cette story est la persistance
correcte du ledger. Si le plan décide d'ajouter un affichage minimal, il doit
suivre le vocabulaire déjà établi par l'outil (« tier », pas de nouveau
jargon).

## Dependencies

Dépend de **story-02-03** : lit la forme `evidence.mutation` qu'elle introduit,
et s'appelle depuis le point d'intégration `verify.js` qu'elle pose (à côté de
`syncGitTrack`/`syncDomainLedger`). Peut s'exécuter en parallèle de
**story-02-04** une fois 02-03 fusionnée — fichiers disjoints.

## Out of Scope

- [ ] Tout affichage nouveau et dédié dans `status`/`check` au-delà de ce que
      symétrie avec `git.json` justifie déjà.
- [ ] La définition des tiers pour l'epic 03 (mode dirigeant) — cette story ne
      fixe que les 6 tiers de la maîtrise mutation/TDD, epic 03 les consomme
      sans les redéfinir.
