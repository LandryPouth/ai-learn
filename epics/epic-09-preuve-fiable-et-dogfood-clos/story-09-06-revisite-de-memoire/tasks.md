# Tasks — Story 09.06

- [x] Fixture git avec commits de phase ; tests rouges (tous les critères).
- [x] `revisit.js` : préconditions, diff inverse, sauvegarde, verrou, abandon, orphelin.
- [x] `verify --revisit` : exige la revisite active ; intervalle.
- [x] `next`/`status` : revisite active et orpheline en premier.
- [x] `learn.md`, `learn-next.md`, AGENTS §5bis, README.
- [x] Rejouer sur une copie de Fastify : `revisit 1` retire-t-il les routes de la phase 1 ? Consigné dans Result : non, refusé (retravaillée depuis).
- [x] `npm test`, revue indépendante.

## Result

Livré : `bin/lib/revisit.js` (préconditions, diff inverse dans un répertoire temporaire hors dépôt, sauvegarde + manifeste, verrou à deux états `applying`/`active`, abandon octet pour octet, état orphelin), sous-commande `revisit [--giveup]`, `verify --revisit` exige une revisite active et double `reviewAfterDays` (plafond 60, jamais abaissé), `next`/`status` annoncent la revisite en première ligne (champ JSON `revisitPending`), `guard` protège `.ai-learn/revisit/` et le verrou en écriture, `learn.md`, `learn-next.md`, AGENTS §5bis, README. Tests : `test/revisit.test.js` (13), plus cas dans verify/next/docs/guard ; les tests `verify --revisit` existants posent maintenant un verrou actif.

Décisions de mise en œuvre :
- Verrou orphelin = état `applying` (arrêt pendant le retrait), sauvegarde absente ou verrou illisible. Le CLI quittant juste après le retrait, « processus mort » seul ne distingue rien.
- Le verrou et la sauvegarde sont exclus via `.git/info/exclude` (écrit par l'outil) : ils n'apparaissent ni comme arbre sale ni dans `git add -A`, même dans un projet dont le `.gitignore` précède cette story.
- Aucune commande git d'écriture (`log`, `diff-tree`, `status`, `rev-parse` seulement) ; `git apply -R` tourne dans un répertoire temporaire hors dépôt.

Rejeu sur une copie (clone) de `fastify-traducteur-api` : `revisit 5` retire 8 lignes de `src/app.ts` et 50 de `src/plugins/deepl.ts`, `--giveup` restitue l'état exact. `revisit 0`..`3` sont **refusés** (« retravaillée depuis ») : les phases suivantes ont réécrit `src/index.ts`/`src/app.ts` ; `revisit 4` refusé (aucun fichier de l'apprenant). En pratique seule la dernière phase (ou une phase dont le code n'a plus bougé) est revisitable par retrait — limite assumée par la décision « refuser plutôt qu'approximer », à rediscuter si les revisites de phases anciennes sont voulues.

Revue indépendante (sous-agent, contexte vierge) : corrigés — `verify`/`--stale` ordinaire refusé pendant une revisite (sinon démotion), chemins du manifeste confinés au projet et aux `learnerFiles`, liens symboliques refusés, commits retenus par sujet `type(phase-N):` seulement, phase qui supprime/remplace du code refusée (l'inverse réinjecterait de l'ancien code), noms de fichiers littéraux (`-z`, `--literal-pathspecs`), `--giveup` sans verrou refusé. Non corrigé, assumé : un `verify --revisit` ne distingue pas un code retapé à l'identique de l'original restauré par `git checkout` (même contenu) — on détecte et on montre, on ne verrouille pas ; écritures `.git/info/exclude` (une ligne, local) ; doublement d'intervalle non atomique avec la levée du verrou.

Risques restants : l'IA peut lire `.ai-learn/revisit/` (le guard n'interdit que l'écriture) — la règle est dans AGENTS §5bis, pas mécanique ; `reviewAfterDays` reste éditable dans `progress.json` (hors périmètre, cf. epic 09).

### Rollback Notes

`git revert` du commit. Aucune migration ; un `.ai-learn/revisit.lock.json` laissé par une version annulée se résout en le supprimant avec `.ai-learn/revisit/` (sauvegardes) après avoir restauré les fichiers.

## Status: done
