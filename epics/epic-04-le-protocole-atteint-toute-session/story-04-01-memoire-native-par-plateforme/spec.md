# Story 04.01 — Fichier mémoire natif par plateforme (AGENTS.md chargé partout)

## Goal

`ai-learn init`/`update` écrivent en plus d'`AGENTS.md` le fichier mémoire natif de la plateforme (`CLAUDE.md` avec `@AGENTS.md`, `GEMINI.md` équivalent) pour qu'une session généraliste charge le protocole sans passer par `/learn`.

## Risk

Fichier appartenant à l'apprenant : ne jamais réécrire. Pas de nouvelle surface d'autorisation.

## Acceptance Criteria

- [ ] Given un projet scaffoldé par `ai-learn init` sur claude-code, when on liste la racine, then `CLAUDE.md` existe et importe `@AGENTS.md`.
- [ ] Given un projet existant sans `CLAUDE.md`, when `ai-learn update --root` tourne, then le fichier est ajouté (backfill) sans toucher `AGENTS.md`.
- [ ] Given un `CLAUDE.md` déjà personnalisé par l'apprenant, when `init`/`update` retournent, then son contenu est conservé et seule la ligne d'import manquante est ajoutée, jamais le fichier réécrit.
- [ ] Given une plateforme qui lit déjà `AGENTS.md` nativement (codex, opencode), when `init` tourne, then aucun stub superflu n'est écrit.
- [ ] Given `ai-learn check`, when le stub d'une plateforme détectée manque, then l'écart est signalé en warning (même discipline que `.codex/config.toml`).

## Edge Cases

- [ ] `CLAUDE.md` en lecture seule ou dossier non inscriptible : `init` ne plante pas, il signale.
- [ ] Plateforme inconnue (`cli-nu`) : aucun stub écrit, aucun message trompeur.

## Out of Scope

- [ ] bin/lib/guard.js
- [ ] bin/lib/scan.js
- [ ] templates/AGENTS-apprentissage.md (contenu inchangé)
