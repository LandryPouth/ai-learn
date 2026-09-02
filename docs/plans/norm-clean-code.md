# Décision — `ai-learn norm`, un vérificateur maison plutôt qu'un service hébergé

> **Reconstitué** (story 01.06) depuis l'historique git réel et les commentaires de
> code qui y renvoient. Source principale : le commit `985806a` (« feat(ai-learn):
> norm checker clean-code mécanique (blocage dur) », 2026-08-24) et le module
> `bin/lib/norm.js` tel qu'il existe aujourd'hui. Aucune affirmation de ce document
> n'a nécessité d'être marquée comme hypothèse.
>
> Référencé par : `bin/lib/norm.js:5` (rejet de la Norminette hébergée),
> `bin/lib/status.js:118` (décision « toujours revérifier »).

## Le problème

Le clean code ne doit pas être un conseil que l'IA peut choisir de suivre ou non —
la même philosophie que le blocage mécanique déjà appliqué à `src/**` (guard) et à
git/gh (voir `docs/plans/git-gh-renforcement-domaine.md`, Partie A). Il fallait un
mur mécanique, pas une recommandation en prose.

## Pourquoi pas la Norminette 42 elle-même

`ai-learn norm` est explicitement **inspiré** de la Norminette de l'École 42, mais
**sans en reprendre l'infrastructure hébergée** (`bin/lib/norm.js:4-5`).
`ai-learn` est un CLI Node zéro-dépendance qui doit tourner offline, dans
n'importe quel terminal (Linux/macOS/Windows) — dépendre d'un service hébergé
externe aurait cassé cette garantie pour tout apprenant hors du contexte 42, et
aurait introduit un appel réseau caché que le reste de l'outil s'interdit
explicitement (voir `docs/DOGFOODING.md`, "le fonctionnement offline-first de
l'outil, aucun appel réseau caché", à propos du fichier `.ai-learn/dogfood.md`).

## La décision

Un vérificateur **heuristique, zéro-dépendance, local**, scopé à ce qu'un
détecteur sans vrai parseur peut mesurer sans se tromper :

- longueur de fichier ;
- longueur de fonction ;
- profondeur d'imbrication ;
- nombre de paramètres.

Seuils par défaut dans `FALLBACK_NORM` (`bin/lib/norm.js`), ou ceux du stack pack
détecté, ou `.ai-learn/norm.json` (auto-créé, jamais réécrit une fois personnalisé
par l'apprenant). Intégré comme blocage dur dans `verify.js`, `check.js`,
`status.js`, `init.js` et `update.js`.

## Décision associée — biais vers le faux négatif

Comme chaque heuristique du dépôt (les marqueurs de concept de `scan.js`,
`mandatoryAt`), une violation qui passe au travers (faux négatif) est toujours
préférable à un faux positif — ce mécanisme bloque `verify`/`check` en dur, donc un
détecteur trop zélé punirait du code correct. `stripStringsAndComments` neutralise
l'intérieur des chaînes/commentaires avant l'analyse d'accolades pour éviter les
faux comptes, et un cas ambigu (accolades déséquilibrées) résout toujours vers
« ne pas bloquer » (voir le flag `balanced` de `detectFunctionsBrace` et le
comportement de saut d'`analyzeFile` sur code déséquilibré).

## Décision — toujours revérifier, jamais en cache

Contrairement aux résumés git/domaine (`printGitSummary`, `printDomainSummary`),
qui sont silencieux par absence de ledger, `printNormSummary` (`bin/lib/status.js`)
**re-calcule la norme à chaque appel de `ai-learn status`** plutôt que de mettre en
cache un dernier résultat. Décision explicite (`status.js:116-118` : « decision:
always verify ») : `walkSources` plafonne déjà à 1000 fichiers / 1 Mo chacun, donc
le coût reste négligeable pour un vrai projet d'apprentissage — mettre en cache
aurait introduit un risque de désynchronisation (un fichier corrigé après le
dernier passage resterait signalé, ou l'inverse) pour un gain de performance jamais
mesuré comme nécessaire.
