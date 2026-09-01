# Tasks — Story 01.01

## Status: done

## Pre-Implementation

- [x] Lire `RULES.md` s'il existe, sinon `docs/conventions.md`
- [x] Lire `plan.md` (Implementation Context)
- [x] Relire `bin/lib/progress.js` en entier (feuille, 158 lignes) et la boucle de
      phases de `bin/lib/check.js`
- [x] Reproduire les deux défauts avant de corriger (phase `in_progress` rouge ;
      preuve survivant à la suppression de `src/**`) et noter la sortie exacte

## Implementation Tasks

- [x] Extraire `checkpointFilePath` de `check.js` vers un module partagé et mettre à
      jour l'import de `check.js`
- [x] Écrire la fonction d'empreinte (`sha256`, chemins triés et normalisés, octets bruts)
- [x] Écrire `phaseVerdict` dans `progress.js` — fonction pure, aucune I/O
- [x] Faire écrire l'empreinte par `verify` dans l'évidence, à côté de `norm`
- [x] Remplacer les deux branches de `check.js` par la consommation du verdict,
      en conservant l'erreur pour `pending` + fichier de checkpoint
- [x] Afficher l'état dans `status` et `next`

## Testing Tasks

- [x] Créer `test/verdict.test.js` (table de cas + stabilité du digest)
- [x] Étendre `test/check.test.js` (5 cas listés au Test Plan)
- [x] Étendre `test/verify.test.js` (l'évidence porte l'empreinte)
- [x] Étendre `test/status.test.js` et `test/next.test.js`
- [x] Justifier dans le `## Result` toute modification d'un test existant

## Validation Tasks

- [x] `npm test`
- [x] `node bin/ai-learn.js check --root .`
- [x] Vérifier manuellement sur le dogfood Fastify que `check` reste vert
      (rétro-compatibilité des évidences sans empreinte)

## Result

**Résumé.** Les deux défauts de l'audit du 2026-09-01 sont corrigés, et le mécanisme
d'empreinte/péremption est introduit de bout en bout. Un nouveau module
`bin/lib/source-hash.js` porte `checkpointFilePath` (extrait de `check.js`, inchangé)
et `computeSourceHash` (sha256 sur les octets bruts des fichiers `learnerFiles` +
fichier de checkpoint, triés par chemin normalisé). `progress.js#phaseVerdict` est une
fonction pure qui rend un des 6 états (`pending` / `in-progress` / `proven` /
`proven-unhashed` / `stale` / `unproven`) à partir de faits fournis par l'appelant —
`progress.js` reste une feuille, aucun `require` n'y a été ajouté. `verify.js` écrit
`evidence.sourceHash` inconditionnellement, à côté de `norm`. `check.js`, `status.js`
et `next.js` consomment tous `phaseVerdict` au lieu de re-dériver l'état chacun à sa
façon.

**Fichiers modifiés.**
- `bin/lib/source-hash.js` (nouveau)
- `bin/lib/progress.js` — ajout de `phaseVerdict`, exporté
- `bin/lib/verify.js` — écrit `sourceHash` dans l'évidence
- `bin/lib/check.js` — boucle de phases réécrite pour consommer le verdict ;
  `checkpointFilePath` local supprimé (importé de `source-hash.js`)
- `bin/lib/status.js` — la marque et le libellé de chaque phase viennent du verdict
- `bin/lib/next.js` — le warning "unproven" existant est étendu à "stale"
- `test/verdict.test.js` (nouveau) — table de cas `phaseVerdict` + `computeSourceHash`
- `test/check.test.js`, `test/verify.test.js`, `test/status.test.js`, `test/next.test.js`
  — cas ajoutés, aucun test existant modifié

**Aucun test existant n'a été modifié** — seuls des cas ont été ajoutés ; les 293 tests
préexistants passent tels quels.

**Tests exécutés.**
- `npm test` → 317/317 (293 existants + 24 nouveaux), 0 échec.
- `node bin/ai-learn.js check --root .` → exit 0 (aucun projet d'apprentissage à la
  racine du dépôt outil lui-même).
- Reproduction manuelle des deux défauts avant correctif (voir ci-dessous), puis
  re-vérification après correctif : `in_progress` + checkpoint sans évidence → exit 0 ;
  `pending` + checkpoint sans évidence → exit 1 (inchangé) ; `done` prouvé puis
  `src/index.js` modifié → exit 1 avec message "is done but its proof is stale" ;
  évidence dépouillée de `sourceHash` puis `src/` modifié à nouveau → exit 0
  (rétro-compatibilité).
- Validation manuelle sur le dogfood réel
  `~/dev/learning/tech-experiments/fastify-traducteur-api` (évidences écrites par une
  version antérieure de l'outil, sans `sourceHash`) : `ai-learn check` reste vert
  (0 erreur), `ai-learn status` affiche `✓ Phase 0` (état `proven-unhashed`, jamais
  `stale`).
- `ai-flow verify --story epics/epic-01-verdict-fiable/story-01-01-trois-etats-du-verdict`
  → `npm test` vert, `Coverage: evidence` (4 fichiers de test modifiés à côté de 8
  fichiers de comportement ; pas de rapport lcov dans ce projet, donc pas de mesure
  `verified` — attendu, aucun outil de couverture n'est configuré ici).

**Reproduction des défauts avant correctif** (notée à la demande de la tâche
Pre-Implementation) :
- Défaut A : phase `in_progress` + `checkpoint/phase-0.test.mjs` existant, sans
  évidence → `✗ checkpoint exists but no passing evidence — run \`ai-learn verify 0\`` /
  `✗ check FAILED` / exit 1.
- Défaut B : phase `done` prouvée, puis `src/**` modifié après le `verify` → `check`
  restait vert (0 erreur) — aucun signal de péremption.

### Rollback Notes

Retirer `bin/lib/source-hash.js`, l'usage de `phaseVerdict`/`checkpointFilePath`/
`computeSourceHash` dans `check.js`/`status.js`/`next.js`/`verify.js`, et `phaseVerdict`
de `progress.js`. Aucune migration de données : les évidences déjà écrites avec
`sourceHash` restent lisibles par le code d'origine, qui ignore simplement ce champ —
un `git revert` de ce commit suffit, sans script de nettoyage.
