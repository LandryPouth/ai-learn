# Plan — pistes non mesurées (métier de dev, compétences durables)

> **IMAGINÉ, jamais mesuré.** Contrairement aux autres documents de `docs/plans/`,
> rien ici n'est reconstitué depuis l'historique git ou le code : ces pistes sortent
> d'une revue de l'outil menée en conversation le 2026-09-29, à partir de la lecture
> de `README.md`, `templates/AGENTS-apprentissage.md`, `docs/roadmap.md`,
> `bin/lib/tracks/*.js` et `bin/lib/stacks/*.js`. **Aucune ne vient d'une entrée du
> journal de friction ni d'un blocage réellement rencontré en apprenant.** Tout le
> document est donc une **Hypothèse**, au sens où `git-gh-renforcement-domaine.md`
> emploie ce mot — il n'y a pas une seule affirmation ici qui soit adossée à une
> preuve d'usage.
>
> **Pourquoi ce fichier et pas un autre endroit.** Pas dans `DOGFOODING.md` : ce
> journal doit rester une liste d'incidents réels, et y verser des idées le dilue
> jusqu'à ce qu'il ne porte plus de signal. Pas dans `docs/roadmap.md` : la roadmap
> est ce qui a été décidé, pas ce qui a été envisagé. Ce fichier est le tampon entre
> les deux.
>
> **Référencé par :** aucune ligne de code — par construction, c'est le signe
> qu'aucune de ces pistes n'est construite. Seul `docs/roadmap.md` § *Hors roadmap*
> y renvoie, pour qu'elles ne se reperdent pas.

## Règle de promotion

Une partie ne quitte ce fichier pour la roadmap que lorsque **le journal de friction
ou un `progress.json` réel** montre le manque qu'elle prétend combler. Chaque partie
ci-dessous porte donc une section *Condition de promotion* : c'est le seul endroit du
document qui ait une valeur contraignante. Sans ce signal, construire l'une de ces
pistes revient exactement à ce que le préambule de `DOGFOODING.md` interdit —
« décider quoi construire ensuite depuis l'imagination ».

Ordre de dépendance, si toutes étaient un jour retenues :

```
epic 01 (verdict fiable) → epic 02 (mutation) → Partie A (debug)
                                              ↘ Partie C (reality compté)
epic 03 (mode dirigeant) → Partie B (juger le code d'autrui)
Partie D (norm) — indépendante
```

---

## Partie A — Module debug par injection de faute

> **Promue (epic 10).** Tiers 1-3 construits par les stories 10.04 (`ai-learn break`, ledger `~/.ai-learn/tracks/debug.json`) et 10.05 (pannes d'environnement), hors règle des trois entrées de friction — décision explicite du propriétaire du produit (2026-10-30, voir `epics/epic-10-cap-plateforme-et-machinerie/index.md`). Les tiers 4-6 restent différés.

### Le problème visé

Lire une stack trace, localiser une cause à distance de son symptôme, reproduire un
comportement non déterministe : c'est la compétence la moins délégable du métier, et
l'outil ne la mesure nulle part. Elle n'apparaît ni dans `progress.json`, ni dans les
tiers git, ni dans le ledger de domaine.

### Le mécanisme de preuve

Le moteur existe déjà, ou existera à l'issue de l'epic 02 : `mutate` injecte une
faute dans `src/**` (in-place + backup + restauration) et vérifie que le test tombe.
**Le mode debug est le même moteur, inversé** — la faute est injectée et le site
n'est pas révélé :

1. `ai-learn debug <phase>` injecte un mutant, sans dire où.
2. L'apprenant lance la suite : elle est rouge.
3. **Avant d'ouvrir un fichier**, il prédit `fichier:ligne` + le mécanisme, à partir
   de la seule stack trace. Nouveau type de prédiction, même exigence de précision
   que les autres (cf. banque d'exemples neutres, `AGENTS-apprentissage.md`).
4. Il corrige.
5. L'outil compare le site prédit au **site d'injection qu'il connaît**.

C'est le premier verdict de l'outil qui mesure un acte cognitif plutôt qu'un
artefact, et il n'est pas truquable : la connivence apprenant/IA est impossible
puisque ni l'un ni l'autre ne sait où la faute a été posée.

### Les tiers

Ledger `~/.ai-learn/tracks/debug.json`, calqué sur `tracks/git.js` (home-scoped,
`home` injectable, jamais remis à zéro par `init`).

| Tier | Faute injectée | Compétence |
|---|---|---|
| 1 | Locale, trace complète | Lire une trace de bas en haut ; trouver la première frame *à soi* |
| 2 | Sur une frontière async | La trace est tronquée, le coupable n'y figure pas |
| 3 | **Dans le fichier A, crash dans le fichier B** | La trace nomme la victime, pas le coupable |
| 4 | Non déterministe (ordre, timing) | Reproduire avant de corriger ; le flaky |
| 5 | Aucune exception — c'est lent | Mesurer au lieu de supposer ; lire un profil |
| 6 | Observable uniquement par les logs | Le mode production : instrumenter, bisecter, hypothèse falsifiable |

Le tier 3 est le cœur : un `undefined` qui explose trois couches sous la fonction
qui l'a produit est la forme la plus fréquente d'un vrai bug, et celle où une IA
aide le moins, faute de voir le contexte d'exécution.

### Coût

Faible côté architecture (troisième instance d'un motif déjà écrit deux fois),
réel côté contenu : une banque `faults` par stack pack (`bin/lib/stacks/*.js`),
symétrique de `stresses` et `mutators`. Le tier 6 est le seul à demander autre chose
que `mutate` — il suppose une faute qui ne lève pas d'exception.

### Condition de promotion

**Au moins trois entrées du journal de friction, ou trois `Zones de faiblesse` du
journal de prédictions, où le temps a été perdu à localiser une cause et non à
comprendre un concept.** Aujourd'hui : zéro. Les six tiers ci-dessus sont une liste
plausible, pas une liste observée — s'ils sont construits tels quels, ils mesureront
ce qui a été imaginé en septembre 2026, pas ce qui bloque réellement.

**Dépend entièrement de l'epic 02.**

---

## Partie B — Tier « juger le code d'autrui », contre une vérité terrain publique

### Le problème visé

Tout le protocole entraîne le jugement contre une solution que l'IA a écrite. Aucun
mécanisme ne le confronte à un relecteur humain réel.

### Le mécanisme de preuve

Extension du tier git 6 (« lire un diff/commit écrit par quelqu'un d'autre »), d'un
cran : sur une **PR open-source déjà revue et fermée**, l'apprenant prédit par écrit
ce que le relecteur va objecter — *avant* de lire les commentaires. Puis il les lit,
et l'écart se compte comme n'importe quelle prédiction.

La vérité terrain est publique, antérieure, et non fabriquée par l'IA. La primitive
de vérification existe déjà : `check.js#citesRealPRUrl` (contrat presence+substance),
réutilisée telle quelle — ne pas la réécrire.

### Pourquoi c'est peut-être la piste la plus rentable

C'est le seul exercice envisagé qui entraîne la compétence qui prend le plus de
valeur — juger du code qu'on n'a pas écrit — contre un arbitre qui n'est ni
l'apprenant ni l'IA.

### Condition de promotion

**Le mode dirigeant (epic 03) livré, et son tier « revue » (`docs/reviews/<brique>.md`)
utilisé au moins une fois en conditions réelles.** Cette partie n'est qu'un
durcissement de ce tier : la construire avant lui, c'est durcir quelque chose qui
n'existe pas.

---

## Partie C — Le reality check compté

### Le problème visé

`AGENTS-apprentissage.md` §4 appelle le reality check *« la seule boucle non
truquable »*, et c'est le seul mécanisme du protocole sans compteur. Les prédictions
de code ont `predictionsRequired` ; les reality checks n'ont qu'une phrase dans les
règles. Une phase peut partir `done` avec zéro reality check enregistré, sans même
un warning.

### Le mécanisme de preuve

Aucun mur nouveau : un troisième type de prédiction (`code` / `casse` / `reality`),
et `predictionsRequired` ventilé par type. Le blocage dur de `verify` existe déjà et
fait le travail.

### Condition de promotion

Celle-ci est la moins spéculative des quatre — le manque est **structurel et
vérifiable dans le code**, pas supposé : l'asymétrie entre §4 et
`predictionsRequired` se lit directement. Elle est également consignée comme friction
(`DOGFOODING.md`, entrée `low` du 2026-09-29). À traiter avec l'epic 02, qui touche
déjà au schéma des prédictions.

---

## Partie D — Rétrograder `norm` du blocage par phase au tier de parcours

### Le problème visé

`ai-learn norm` bloque `done` en dur sur des métriques de lisibilité. C'est le seul
gate de l'outil dont l'axe est **orthogonal à ce que la phase enseigne** : une
fonction de 55 lignes empêche de clore « comprendre epoll », alors que le refactor
demandé n'a aucun rapport avec l'objectif d'apprentissage de la phase — et qu'il
tombe au pire moment, juste avant la clôture.

Le préambule de `DOGFOODING.md` prévient exactement contre cette forme :
*« Un check qui se déclenche sur un cas qu'on ne peut pas résoudre légitimement,
c'est un check qu'on apprend à désactiver. »* Ici le cas est résoluble — mais au prix
d'un détour hors-sujet, ce qui produit la même pression à contourner.

### La proposition

Ni supprimer ni conserver tel quel : **déplacer le mur**.

- Par phase : warning, pas erreur.
- En fin de parcours : blocage, comme aujourd'hui.
- La lisibilité accumulée remonte dans un `~/.ai-learn/tracks/quality.json` à tiers,
  mesurée dans la durée comme git — c'est là que cette compétence se juge, sur
  l'ensemble, pas sur un checkpoint isolé.

### Condition de promotion

**Une entrée de friction où `norm` a bloqué une clôture et où le refactor demandé
n'avait aucun rapport avec l'objectif de la phase.** Aujourd'hui : zéro. Tant que
personne ne l'a vécu, cette partie reste une préférence de conception, et
`norm --no-block` n'existe pas — ce qui est cohérent avec la ligne rouge produit.

---

## Partie E — Diagnostic initial et mesures de pilote (revue du 2026-10-16)

> Issue d'un avis externe collé en conversation le 2026-10-16, comparé au code et au
> journal. Ce qui était **déjà observé** a été promu : profil de tuteur et preuve de
> transfert → `story-05-05`. Le reste ci-dessous reste une hypothèse.

### Le problème visé

L'avis pose la bonne question : l'outil distingue-t-il « étape techniquement terminée »
de « compétence réutilisable sans guide » ? Réponse après lecture : **en partie** —
prédictions, mutation et revisite (epic 07) prouvent la compréhension ; rien ne mesure
l'autonomie dans le temps.

### Les deux idées non promues

1. **Test diagnostique avant chaque phase** (« si tu comprends les promesses, pas de
   cours dessus »). Recouvre en grande partie le ledger de domaine
   (`~/.ai-learn/domains/<stack>.json`) et `commands/learn.md` § « Ne jamais
   réapprendre un concept déjà maîtrisé ». À n'ajouter que si le ledger se révèle
   trop grossier.
2. **Mesures de pilote** : temps passé, niveau d'aide reçu, erreurs, résultat du
   transfert, comparé à un exercice sans assistance. Nécessite que l'outil enregistre
   le niveau d'aide réellement donné — aujourd'hui non observable mécaniquement (c'est
   l'IA qui le sait).

### Condition de promotion

**Un `progress.json` réel portant au moins trois phases avec une preuve de transfert
(`story-05-05`) où l'écart entre « tests verts » et « transfert raté » est visible.**
Tant qu'aucun apprenant n'a vécu cet écart, mesurer l'autonomie est une instrumentation
sans question. Dépend de l'epic 05 et de l'epic 07.

---

## Écarté

**« L'IA écrit le checkpoint, l'apprenant ne tape que `src/**` »** — proposé dans la
même revue, puis écarté le jour même. Motif : l'epic 03 traite déjà le sujet, et
mieux. La propriété du checkpoint ne doit pas suivre une règle uniforme mais
**basculer avec le mode** — en apprenti l'examen ne t'appartient pas, en dirigeant la
spécification devient ta seule contribution, donc elle doit être à toi et être
prouvée. Une règle uniforme aurait cassé le mode dirigeant avant qu'il existe.

**« Retirer l'écriture des tests par l'apprenant »** — écarté pour la même raison :
l'epic 02 répond au problème du test faible par la mutation, qui est une sortie
mécanique. Retirer l'écriture aurait contourné le problème au lieu de le prouver.
