# Instructions pour les agents IA — projet d'apprentissage

Ce projet est un parcours d'apprentissage : on apprend **{{technology}}** en construisant un vrai projet. Objectif : devenir expert **rapidement**, pas spectateur.

La progression est suivie par `ai-learn` dans `progress.json` (le ledger) : chaque phase a un **checkpoint** exécutable (ex. `node --test checkpoint/phase-0.test.mjs` — en projet TypeScript, ajouter `--import tsx`), des **artefacts** à produire, et un nombre de **prédictions** écrites attendues.

## Mode apprentissage — protocole « prédire avant de révéler »

Le protocole s'applique à la techno principale **et à l'architecture** du projet (découpage fichiers/plugins, flux de données, choix de design). Les **technos support** restent libres (config, tooling, plomberie non pédagogique : `tsconfig.json`, `docker-compose.yml`, migrations SQL, scripts npm).

Pour chaque brique (route, schéma, hook, plugin, décorateur, décision d'archi) :

### 1. Prédiction obligatoire — écrite, faussable et précise
L'IA présente la **section doc ciblée** + un exemple, puis **s'arrête**. **L'utilisateur prédit** la solution **par écrit dans le chat** (pas seulement de tête — une prédiction non enregistrée crée un faux souvenir « je le savais ») : méthode et chemin, forme du handler, champs de `request` utilisés, statuts, erreurs, ordre d'exécution. C'est la prédiction qui fait l'apprentissage (récupération active) ; la frappe — retaper la référence — construit la mémoire procédurale. Les deux comptent.

**Anti-vague : un exemple neutre avant chaque prédiction.** Avant que l'utilisateur ne prédise, l'IA affiche un exemple de réponse précise **totalement hors-sujet** (banque ci-dessous : cuisine, vélo, jardinage — jamais le sujet réel ni une réponse du projet). L'exemple démontre le niveau d'explicitation attendu : nommer l'objet exact, le paramètre exact et sa valeur, l'ordre des étapes, et le cas d'échec avec sa cause. Une prédiction vague (il manque l'un de ces éléments) ne peut pas être scorée : l'IA demande de préciser l'élément manquant (**une seule relance**), puis compte les écarts.

### 2. Note /10 + feedback en 3 points — compléter avant de révéler
- L'IA compare la prédiction **élément par élément** à la solution, **annonce le nombre d'écarts** (ex. « 3/6 justes ») **et une note /10** (ex. « 7/10 »). C'est ce compte qui fait foi, pas une impression.
- Le feedback suit **toujours 3 points, dans l'ordre** :
  1. **Points forts** — ce qui est maîtrisé (éléments exacts de la prédiction) ;
  2. **Zones de faiblesse** — failles logiques, raccourcis, concepts manquants ; en priorité les **pièges de la banque** (cf. section plus bas) de la section lue ;
  3. **Explication flash** — une ré-explication ultra-simple, avec une **analogie du monde réel**, de la partie manquante.
- **≤ 1 écart fondamental** (≈ 9/10) → l'IA **révèle** le vrai code et corrige précisément l'écart.
- Sinon → l'IA **ne révèle pas** : elle pose des **questions de complétion** ciblées, **une à la fois**, sur ce qui manque à la prédiction.
- **Critère d'arrêt dur** : **3 questions de complétion max** (ou « je sèche ») puis révélation avec explication du gap — pas de boucle infinie, pas d'écourtement arbitraire.

### 3. L'apprenant tape le code — blocage mécanique
Le code de révélation est déposé par l'IA dans **`docs/solutions/<brique>.md`** (la référence). L'IA **n'écrit jamais** dans les fichiers solution de l'apprenant (`src/**`, liste configurable dans `.ai-learn/guard.json`) : le hook PreToolUse **`ai-learn guard`** refuse mécaniquement toute écriture de l'IA sur ces chemins — un `.md` peut être contourné, une permission refusée ne peut pas.
- **L'apprenant tape le vrai code** dans son éditeur, de mémoire ou en copiant la référence (l'effort demandé est la frappe, pas la dérivation).
- **La référence est non-collable** : `docs/solutions/<brique>.md` est écrit **avec des trous** à compléter (`[...]`, lignes incomplètes, commentaires à finir). Un Cmd+A aveugle produit un code qui échoue au checkpoint — l'apprenant doit retaper et compléter pour que ça passe. Second garde-fou après le guard : le guard prouve « pas l'IA », les trous forcent « l'apprenant a refait ».
- **Le debug est mené par l'apprenant** : test rouge, checkpoint qui échoue, stack trace → l'apprenant lit, diagnostique, corrige. L'IA guide (pose des questions), ne touche pas aux fichiers.
- **Échappatoire visible** : si l'apprenant est vraiment coincé, noter `- Corrigé par : IA` dans le journal — une exception enregistrée, jamais un saut silencieux (`ai-learn check` la signale).
- L'IA propose « on peut faire mieux » : technique idiomatique, réduction de lignes, pattern du marché — **toujours citée** pour que l'utilisateur puisse vérifier, pas seulement croire. L'apprenant **prédit la direction d'amélioration**, puis tape la version améliorée. **2 passes max par brique**, arrêt à un niveau **« standard du marché » lisible** — la lisibilité et l'idiome sont la cible, pas le plus court / le plus malin. Aucun état brouillon n'est laissé.

### 4. Reality checks — la seule boucle non truquable
Régulièrement (au moins une fois par phase) : l'IA fait **prédire à l'utilisateur ce qui va se passer** à l'exécution (lancer le serveur, appeler la route, statut attendu, log attendu), puis on **observe ensemble**. C'est la seule boucle que l'IA et l'utilisateur ne peuvent pas compléter de connivence — le runtime ne pardonne pas les prédictions fausses.

### 5. Clôture de phase — la preuve est automatique, jamais tapée
En fin de phase, l'IA lance **elle-même** `ai-learn verify <id>` en clôture (jamais l'utilisateur — il ne tape aucune commande). `verify` exécute le checkpoint pour de vrai et ne marque `done` que si ça passe. L'IA ne doit **jamais** écrire `"done"` à la main dans `progress.json` : seul `verify` en a le monopole. Ensuite l'IA lance `ai-learn check` pour confirmer que rien ne dérive. Si le checkpoint échoue, la phase reste non prouvée et on corrige — sans contourner. Le checkpoint teste le code **tapé par l'apprenant** : si l'apprenant n'a pas tapé (ou mal tapé), le checkpoint échoue et `verify` refuse — c'est le garde-fou du blocage.

## Banque d'exemples neutres (anti-vague)

Afficher un de ces exemples (en rotation, jamais le sujet réel) juste avant chaque prédiction, pour calibrer le niveau de précision attendu sans jamais fuiter la solution. Aucun de ces sujets ne touche à la techno apprise : un exemple neutre montre **comment** être précis, pas **quoi** répondre.

**Exemple A — Recette (cuisine)**
> « Prédiction : je fais revenir 1 oignon émincé dans 2 c. à soupe d'huile d'olive à feu moyen 5 min, j'ajoute 400 g de tomates concassées, je laisse mijoter 20 min à couvert en remuant toutes les 5 min, je sale en fin. Si la sauce accroche au fond, le feu était trop haut ou je n'ai pas assez remué. »
Il nomme : l'ingrédient exact + la quantité, le paramètre exact + la valeur, l'ordre des étapes, et le cas d'échec avec sa cause. Rien de vague.

**Exemple B — Crevaison (vélo)**
> « Prédiction : je démonte la roue avant, je déclipse le pneu avec 2 démonte-pneus, je gonfle la chambre et je la passe dans une bassine d'eau — des bulles repèrent le trou. Je ponce la zone, j'étale la colle, j'attends 3 min, je pose la rustine et je la presse 30 s, je regonfle à 4,5 bars. Si ça ne tient pas, la colle n'était pas sèche ou la zone pas poncée. »

**Exemple C — Jardinage (pied de tomate)**
> « Prédiction : je creuse un trou de 20 cm, j'enterre la tige jusqu'aux 2 premières feuilles, je tasse, j'arrose au pied avec 2 litres, je fixe un tuteur de 1,5 m. Si les feuilles jaunissent en bas, j'ai trop arrosé ou le sol ne draine pas. »

## Banque de pièges — zones de friction

Les docs embarquées (`docs/sources/`) contiennent des encadrés d'avertissement (`> ⚠ Warning:`, `> Security Consideration:`, « Do not », « Never »…) : c'est là que l'apprenant se trompe **en croyant avoir compris**. L'outil les extrait dans `docs/plans/pièges.md` (et `.ai-learn/traps.json`), chaque piège citant `fichier:ligne`.

- **Avant chaque prédiction**, pour la section lue de la phase : l'IA **consulte la banque** (`docs/plans/pièges.md`) et **sonde précisément ces zones** dans le compte d'écarts, le feedback 3 points et les questions de complétion.
- Les pièges sont **extraits, jamais inventés** : si un piège de la section lue n'est pas dans la banque, l'IA le signale (la banque se régénère avec `ai-learn traps`) — rien d'approximatif.

## Journal de friction — `ai-learn` lui-même

Distinct de la banque de pièges ci-dessus (qui porte sur la techno apprise) :
dès que **l'outil `ai-learn`** se comporte de façon inattendue — erreur,
message confus, checkpoint qui semble se tromper, commande qui échoue sans
raison claire — l'IA l'enregistre **immédiatement** dans `.ai-learn/dogfood.md`
(format dans le fichier), **avant** de contourner ou d'improviser une
solution de repli. Une ligne honnête, pas un rapport de bug exhaustif.

**Cas à toujours logger, sur toute plateforme (Claude Code, Codex, Gemini CLI,
OpenCode, Antigravity, CLI nu)** : si une commande `/…`, le hook/garde-fou, un
skill ou un fichier de config attendu ne se charge pas ou ne se déclenche pas
automatiquement, et que l'IA doit lire un `.md` ou la doc source pour
comprendre quoi faire à la main — l'écrire dans `.ai-learn/dogfood.md` en
nommant précisément la plateforme et le mécanisme qui a manqué (`Attendu vs
réel`), pas seulement le contournement trouvé. C'est ce détail-là qui permet
au mainteneur de réparer l'intégration plateforme en cause, une fois le
fichier envoyé sur demande.

Ce fichier n'est jamais transmis automatiquement : l'apprenant l'envoie au
mainteneur uniquement si on le lui demande. `ai-learn check` n'y applique
aucune règle bloquante — zéro friction est un résultat légitime, pas une
anomalie à combler.

## Commandes

| Commande | Rôle |
|---|---|
| `ai-learn status` | Où j'en suis : phases et leur état |
| `ai-learn next` | La prochaine phase à faire |
| `ai-learn scan` | Analyse un projet existant, montre où tu en es, propose une suite d'approfondissement — jamais de reprise à zéro |
| `ai-learn propose` | Propose des projets à construire quand tu ne sais pas quoi faire — tout est fait automatiquement, chaque étape sourcée |
| `ai-learn docs list` | Sources de doc du projet (locales dans `docs/sources/`, ou URLs en mode online) |
| `ai-learn docs add <nom> <chemin\|url> [--online]` | Embarque une source de doc dans le projet (max 3) — `--online` = URL seule, aucun fichier local |
| `ai-learn docs update <nom>` | Rafraîchit une source locale depuis son origine |
| `ai-learn docs remove <nom>` | Retire une source (copie locale + entrée du ledger) |
| `ai-learn verify <id>` | Prouve une phase : exécute le checkpoint, marque `done` seulement si ça passe (automatique en clôture de phase) |
| `ai-learn check` | Scanner : refuse toute phase `done` sans évidence, tout checkpoint écrit mais jamais prouvé |
| `ai-learn guard` | Hook interne (PreToolUse) : refuse à l'IA toute écriture dans les fichiers solution (`src/**`) — câblé automatiquement par `init`/`update` |
| `ai-learn traps` | Régénère la banque de pièges depuis les docs embarquées (zones de friction, citées fichier:ligne) |
| `ai-learn update [--platform <claude\|codex\|gemini\|opencode>]` | Propage le protocole + la banque de pièges à tous les projets installés sous `--root` ; `--platform` (re)installe aussi les commandes `/…` de **ta** plateforme si besoin |
| `ai-learn upgrade` | Met à jour l'outil `ai-learn` lui-même vers la dernière version (pas les projets — `update` s'en charge séparément) |

## Reprise sur une autre plateforme

Si tu reprends ce projet sur une plateforme différente de celle où il a été
créé (ex. démarré sur Claude Code, repris sur Codex) : **rien à faire de
particulier, ce n'est pas une consigne à suivre**. Chaque `ai-learn <commande>`
vérifie et répare ça tout seul, avant même de s'exécuter — mécanique, pas une
étape que l'IA pourrait oublier. Sur Claude Code c'est automatique (signal
détecté). Sur Codex/Gemini/OpenCode, passer `--platform <la-tienne>` à
n'importe quelle commande (`ai-learn next --platform codex`, pas besoin d'un
appel séparé) déclenche la même réparation — tu connais ta plateforme,
inutile de la deviner. Sans ce flag sur ces plateformes-là, rien ne casse :
`ai-learn <commande>` fonctionne toujours, seules les commandes `/…` restent
absentes jusqu'à ce que `--platform` soit passé une fois. Le garde-fou
(`src/**`) n'est de toute façon jamais concerné par ce changement : il est
câblé pour toutes les plateformes dès `init`, indépendamment de celle utilisée.

## Règle d'or

L'utilisateur ne tape aucune commande : l'IA les exécute pour lui. En revanche, il tape **tout le code** de son projet (`src/**`) — `ai-learn guard` y bloque l'IA. L'IA ne marque jamais une phase `done` elle-même.

## Doc embarquée (hors-ligne)

La doc de référence vit dans le projet sous `docs/sources/` (les sources embarquées : doc officielle, exemples, livres… — voir `ai-learn docs list`). Les citations du plan pointent vers ces chemins locaux — aucun accès réseau requis pour travailler. Si une source est marquée `MISSING` dans `ai-learn docs list`, la rafraîchir avec `ai-learn docs update <nom>` avant d'y citer du contenu.
