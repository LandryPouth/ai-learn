# Spec — Story 13.05 — L'outil propose, l'humain décide, chaque proposition cite ses preuves

## User Value

L'agent remarque qu'une idée fausse revient (« confond `reply.send` et `return` »), qu'un format pédagogique aide ou qu'une commande de l'outil fait perdre du temps. Il l'écrit en proposition dans le vault, avec les preuves exactes ; l'apprenant l'accepte ou la refuse dans Obsidian. Une idée fausse acceptée apparaît dans la fiche ; une proposition sans preuve réelle est refusée par l'outil.

## Requirements

- `ai-learn memory propose --kind idee-fausse|pedagogie|outil --title "<…>" --text "<…>" --evidence <id>[,<id>…] [--dir <projet>]` (machinerie appelée par l'agent) :
  - formes d'id acceptées : id de prédiction (`<alias>/<id>`), phase (`<alias>#<n>`), kata (`kata:<id>`), incident (`incident:<id>`), friction (`friction:<alias>/<n>`) ;
  - **chaque id est résolu** contre la source machine ou le projet ; un seul id introuvable = refus, rien n'est écrit ;
  - `idee-fausse` exige au moins 2 preuves (même seuil que 13.04) ;
  - écrit `<vault>/ai-learn/proposals/<date>-<slug>.md` au modèle `_templates/proposal.md` du vault, `status: proposed`, `source: ai-learn memory propose`.
- L'outil n'écrit **jamais** `status: accepted` ni `retired`. Le passage est fait par l'humain dans Obsidian.
- `memory export` relit les propositions : les `idee-fausse` en `accepted` alimentent la ligne « idées fausses » de la fiche (3 au plus) ; une proposition `accepted` dont une preuve ne se résout plus est signalée (warning), pas retirée.
- **Agrégat de friction** : `memory export --root <dossier>` lit les `.ai-learn/dogfood.md` des projets trouvés (`findLearningProjects`) et rend `<vault>/ai-learn/friction/index.md` : titres groupés par surface et sévérité, compte, alias du projet, numérotés pour être citables (`friction:<alias>/<n>`).
- `templates/AGENTS-apprentissage.md` : quand et comment proposer ; jamais de proposition sans preuve ; une proposition par sujet.

## Acceptance Criteria

- [ ] Given une preuve `fastify/p-123` inexistante, when `memory propose`, then exit 1 et aucun fichier n'est écrit.
- [ ] Given `--kind idee-fausse` avec une seule preuve, when `memory propose`, then exit 1.
- [ ] Given deux preuves réelles, when `memory propose --kind idee-fausse`, then `proposals/<date>-<slug>.md` existe en `status: proposed` avec les deux ids.
- [ ] Given cette proposition passée à la main en `accepted`, when `memory export`, then la fiche contient sa ligne « idées fausses ».
- [ ] Given une proposition `proposed`, when `memory export`, then la fiche ne la montre pas.
- [ ] Given deux projets avec 3 et 2 entrées de friction, when `memory export --root`, then `friction/index.md` liste 5 entrées groupées par surface.
- [ ] Given `memory propose` avec un titre déjà proposé, when on relance, then exit 1 nommant le fichier existant.

## Edge Cases

- Frontmatter édité à la main de façon invalide : proposition ignorée par la fiche, warning nommant le fichier.
- Slug en collision le même jour : suffixe `-2`.

## Out of Scope

- Accepter ou retirer une proposition en ligne de commande.
- Proposer des changements au code d'ai-learn automatiquement (une proposition `outil` reste une note).
