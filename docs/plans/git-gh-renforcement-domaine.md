# Plan — module git/gh, renforcement 10x, maîtrise de domaine

> **Reconstitué** (story 01.06) depuis l'historique git réel et les commentaires de
> code qui y renvoient — jamais depuis l'imagination. Source principale : le commit
> `98fc7ff` (« feat(ai-learn): module git/gh + renforcement de la méthode
> d'apprentissage », 2026-08-22), qui introduit les trois parties ci-dessous en un
> seul commit — c'est pourquoi elles sont documentées ensemble ici plutôt que comme
> trois plans séparés. Complété par `bin/lib/tracks/git.js`, `bin/lib/tracks/domain.js`
> et `bin/lib/scan.js` (fonctions `suggestStresses`, `evaluateMandatoryAt`) tels
> qu'ils existent aujourd'hui. Toute affirmation qui n'a pas pu être retrouvée dans
> le code ou l'historique est marquée **Hypothèse** explicitement — il n'y en a
> aucune dans ce document.
>
> Référencé par : `bin/lib/tracks/git.js:22` (Partie A), `bin/lib/scan.js:707` et
> `bin/lib/verify.js:100` (Partie B), `bin/lib/tracks/domain.js:7` (Partie C).

## Contexte commun aux trois parties

Avant ce commit, la maîtrise d'un apprenant était bornée à un seul projet :
`progress.json` est réinitialisé à chaque nouveau projet, donc rien n'accumulait
d'un projet au suivant. Les trois mécanismes ci-dessous partagent la même réponse
structurelle : un **ledger home-scoped** (`~/.ai-learn/tracks/` ou
`~/.ai-learn/domains/`), écrit uniquement en cas de succès réel (`verifyEvidence.ok
=== true`), jamais remis à zéro par `ai-learn init`.

## Partie A — Module git/gh (`bin/lib/tracks/git.js`)

**Problème.** L'IA ne doit jamais taper de commande `git`/`gh` à la place de
l'apprenant (`ai-learn guard` bloque même la lecture, pas seulement l'écriture —
voir README, section philosophie). Mais sans suivi, rien ne dit si l'apprenant a
réellement progressé sur git au-delà du `commit` de base.

**Décision.** Un ledger global `~/.ai-learn/tracks/git.json`, jamais remis à zéro
d'un projet à l'autre, structuré en 6 tiers ancrés sur l'usage réel (et non sur une
déclaration) :

| Tier | Sujet |
| --- | --- |
| 1 | Vocabulaire de base + format de commit (Conventional Commits) |
| 2 | `diff` / `stash` / `restore` |
| 3 | Branches + résolution d'un conflit réel |
| 4 | `amend` / `rebase -i` / `cherry-pick` |
| 5 | Workflow PR complet via `gh` |
| 6 | Lecture de diffs/commits d'autrui |

**Mécanisme de preuve.** Un tier n'est marqué `achieved` que lorsque la phase qui le
déclare explicitement (`phase.gitTier`) vient de passer son checkpoint
(`syncGitTrack`, appelé uniquement depuis `verify.js` après un succès). Un usage
git/gh ambiant capté pendant une phase non taguée (`captureGitSignals` : reflog
`amend`/`rebase`/`cherry-pick`, nombre de `git stash list`, dernier merge commit,
PRs de l'auteur via `gh pr list`) est enregistré comme preuve annexe mais ne
suffit jamais à lui seul à marquer un tier acquis — même discipline « provoqué,
pas laissé au hasard » que la conception des phases elle-même. Signal fail-open :
`git`/`gh` absent ou non authentifié ne fait jamais planter `verify`.

**Décision associée (même commit).** Un hook `commit-msg` natif (Conventional
Commits), câblé par `init`/`update` via `core.hooksPath`, jamais écrasé s'il est
personnalisé par l'apprenant.

## Partie B — Renforcement « 10x » (banque `stresses`)

**Problème.** Un concept révélé une fois (« voici comment gérer une race
condition ») peut être lu et oublié sans jamais être vraiment éprouvé.

**Décision.** Chaque stack pack (`bin/lib/stacks/*.js`) porte, en plus de sa
banque `directions` habituelle, une banque `stresses` de même forme
(`requires`/`deepens`/`tier`) mais avec un `stressCheckpoint` en plus : une
commande qui **exécute réellement** une charge, une entrée malformée ou de la
concurrence, et qui est censée **échouer avant que l'apprenant écrive le correctif**
— jamais une casse racontée en prose. `suggestStresses` (`scan.js`) sélectionne
jusqu'à 5 stresses par le même filtre de non-régression que les directions
normales (concepts déjà utilisés, tier maximal atteint, frameworks détectés).

**Application dans `verify`.** Pour une phase qui déclare un `stressCheckpoint`,
`verify` exige que **le checkpoint de base ET le stressCheckpoint** passent avant
de marquer la phase `done` — le correctif doit tenir sous la charge réelle, pas
seulement sur le chemin heureux. Le moment où le stress échoue légitimement (avant
l'écriture du correctif) fait partie de la session interactive ; `verify` ne le
rejoue jamais, il n'exige que l'état final où les deux passent.

## Partie C — Maîtrise de domaine (`bin/lib/tracks/domain.js`)

**Problème.** Le pendant conceptuel de la Partie A pour les concepts de stack
(pas git/gh) : sans ledger cross-projet, « 3 projets dans le même stack →
expert » resterait un slogan sans mesure — soit un compteur figé (jamais
vraiment expert), soit une déclaration non vérifiable.

**Décision.** Un ledger par stack, `~/.ai-learn/domains/<stack-key>.json`, où les
concepts prouvés **s'accumulent** à travers tous les projets d'une même
technologie plutôt que d'être ré-appris depuis zéro à chaque nouveau projet. Clé
du ledger : le stack **détecté depuis le code réel** (`detectStack` +
`stackKey`), jamais le champ libre `progress.json.technology` — « React »,
« Node CLI » et « API web » doivent tous accumuler dans le même ledger
`javascript` plutôt que trois ledgers déconnectés.

**Statut « expert ».** Calculé dans `domainSummary` : couverture complète de la
banque de concepts de la stack détectée (`achieved.length === total.length`),
pas un compteur de projets fixe — la formule « 3 projets → expert » de l'intention
initiale est une heuristique de communication, la mesure réelle est la couverture
de la banque. Un concept déjà `achieved` ne régresse jamais ; `firstProject` et
`evidenceDate` sont fixés à la première preuve et jamais réécrits par un projet
suivant qui la confirme à nouveau.

## Décision associée (même commit) — seuil obligatoire d'architecture

`mandatoryAt` : la direction « Architecture & modularité » (banque `directions`
d'un stack pack) devient **obligatoire**, pas seulement suggérée, une fois qu'un
seuil de taille de fichier mesuré (`evaluateMandatoryAt`, `scan.js`) est franchi —
plutôt que de rester une suggestion parmi d'autres indéfiniment.
