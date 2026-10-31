# Tasks — Story 09.07

- [x] Tests rouges (messages, prochaine action, next, check, docs, À revoir, outdated, aide).
- [x] Messages en français ; prochaine action via `failureDetail`.
- [x] `next` → `ai-learn predict` ; `check` pending → information.
- [x] `docs.js` erreur de clone ; annonce mutation ; aide CLI ; QUICKSTART.
- [x] « À revoir » dans `status`.
- [x] `toolVersion` + `outdated` + `learn-next.md`.
- [x] `npm test`, `/flow-review`.
- [x] Clôture : rejouer chaque entrée Fastify ouverte sur une copie à jour (`ai-learn update` sur la copie) ; écrire les lignes `Statut` dans les 3 journaux (avec accord de l'apprenant) ; mettre à jour `DOGFOODING.md`.

## Status: done

## Result

Messages en français (verify, next, status, init, erreurs), « → Prochaine action » en fin de `verify` rouge, `next` → `ai-learn predict`, `check` : phases `pending` = une ligne d'information, erreur de clone nommant étape/délai/`--regen` (`cloneFailureMessage`), annonce de mutation, aide (`transfert`, `init --dir`), QUICKSTART via `/learn`, « À revoir » (`predictionsToReview`), `toolVersion`/`outdated` (`scaffoldState`, `stampToolVersion`) et `learn-next.md`.

Tests : `npm test` 913 verts ; nouveaux `test/messages.test.js`, `test/commands.test.js`. Tests existants adaptés aux messages français ; le test d'`update` tolère l'ajout de `toolVersion`.

Dogfood : entrées Fastify rejouées sur une copie mise à jour (`next` → Phase 6, `verify --stale` → rien de périmé, rappel de commit expliqué, `check` : 1 info pour 5 phases pending). Lignes `Statut` écrites dans les 3 `dogfood.md` (texte des entrées intact) ; `docs/DOGFOODING.md` mis à jour.

Risques restants : phases 2-5 de Fastify avertissent de prédictions manquantes (legacy `.md` supplanté par `predictions.json`) ; `/flow-review` non lancé (STANDARD, opt-in).

### Rollback Notes
`git revert` du commit ; les lignes `Statut` des journaux externes se retirent à la main.
