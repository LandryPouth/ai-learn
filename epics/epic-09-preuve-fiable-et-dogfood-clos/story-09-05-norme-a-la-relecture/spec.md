# Spec — Story 09.05 — La norme mesurée quand l'IA relit le code de l'apprenant

## User Value

Le retour clean code arrive brique par brique, au moment où l'IA relit ce que l'apprenant vient de taper pour le noter, et plus en un seul bloc en fin de phase. C'est la dernière entrée encore ouverte du journal Fastify (« `norm` jamais déclenché au fil de l'eau »).

## Requirements

- **Constat de départ** : le hook PostToolUse `norm --hook` (story 07-03) écoute `Write|Edit|MultiEdit`. En mode apprenti, l'IA ne peut pas écrire `src/**` ; l'apprenant tape dans son éditeur ; le hook ne mesure donc jamais son code.
- **Mesure à la relecture** : AGENTS §2 impose à l'IA de relire `src/**` avant de noter. Le hook `norm --hook` écoute aussi `Read` ; sur la lecture d'un fichier couvert par `learnerFiles`, il mesure ce seul fichier et renvoie les violations à l'agent (même format, jamais bloquant, silencieux sans violation).
- **Avant tout code** : confirmer dans la doc Claude Code que `PostToolUse` se déclenche pour `Read` et que la sortie peut renvoyer un contexte à l'agent ; sinon, repli : seul le point suivant est livré, consigné au Result.
- **`next`** : la sortie texte et `--json` incluent les violations de norme des fichiers de l'apprenant (`norm: { violations: [...] }`), pour que `/learn-next` les remonte à chaque reprise sur toutes les plateformes.
- **AGENTS §3quater** : décrit la mesure à la relecture et le repli (`ai-learn norm` sur les plateformes sans hook).
- `update` met à jour le matcher des projets existants (`Write|Edit|MultiEdit|Read`).

## Acceptance Criteria

- [ ] Given un hook `Read` sur `src/app.ts` contenant une fonction de 80 lignes (seuil 50), when `norm --hook` tourne, then la sortie contient `src/app.ts:<ligne> — … [maxFunctionLines]` et l'exit est 0 (non bloquant).
- [ ] Given un `Read` sur un fichier hors `learnerFiles` (ex. `README.md`), when le hook tourne, then aucune sortie.
- [ ] Given un `Read` sur un fichier propre, when le hook tourne, then aucune sortie.
- [ ] Given un projet existant avec l'ancien matcher, when `update`, then le matcher inclut `Read` et les autres hooks de l'apprenant sont intacts.
- [ ] Given une violation dans `src/**`, when `ai-learn next --json`, then `norm.violations` la contient ; when `ai-learn next`, then une ligne « Norme : 1 violation » la cite.
- [ ] Given la doc Claude Code consultée, when on lit le Result, then la source et la confirmation (ou le repli) y figurent.

## Edge Cases

- Lecture partielle (`offset`/`limit`) : mesurer le fichier entier quand même (coût borné à un fichier).
- Fichier énorme : respecter `maxFileLines` déjà mesuré ; pas d'analyse de fonction au-delà de la limite existante de `norm`.
- Mode dirigeant : `learnerFiles` désigne les tests ; la norme porte sur les fichiers d'implémentation comme aujourd'hui — garder la règle actuelle de `normHookContext`.

## Out of Scope

- OpenCode/Codex/Gemini : pas de nouveau hook ; `next` couvre ces plateformes.
- Détecter la duplication (hors des métriques de `norm`).
