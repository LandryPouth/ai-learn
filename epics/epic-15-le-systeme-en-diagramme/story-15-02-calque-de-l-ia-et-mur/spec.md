# Spec — Story 15.02 — L'IA corrige dans son calque, jamais dans le tien, jamais avant toi

## User Value

Après la phase, l'IA ajoute ses corrections dans un calque à part, d'une autre couleur. L'apprenant masque ou affiche ce calque et voit d'un coup d'œil ce qui manquait à son dessin. L'outil garantit que l'IA n'a pas dessiné avant lui et n'a rien touché à son calque.

## Requirements

- `ai-learn diagram snapshot [--phase <id>]` (machinerie, lancée par l'agent après `verify` d'une phase `diagram: true`) : enregistre dans `.ai-learn/diagram.json` l'empreinte **complète** du calque `apprenant` (contenu et ids) et ouvre la **fenêtre de correction** de la phase. Refusé si la phase n'est pas prouvée.
- L'IA crée le calque `ia-phase-<id>` (couleur fixe, `#dae8fc` bordure `#6c8ebf` par défaut, notée dans le mode d'emploi) et n'y ajoute que des cellules dont le parent est ce calque.
- `ai-learn diagram reveal --phase <id>` : vérifie que le calque `apprenant` est identique à l'empreinte et que toute cellule ajoutée ou modifiée depuis appartient à `ia-phase-<id>` ; succès = fenêtre fermée, compte des ajouts (boîtes, flèches) enregistré. Échec = refus nommant les cellules fautives ; la fenêtre reste ouverte pour que l'IA corrige.
- **Guard** : `Write`/`Edit` (et redirection shell) sur `docs/systeme.drawio` refusés à l'IA hors d'une fenêtre ouverte ; message : « dessine d'abord, ou `diagram snapshot` après la preuve ». Sous Codex/Gemini/Antigravity : consigne seule, limite écrite dans le README.
- `check` : erreur si une fenêtre a été fermée par `reveal` puis que l'empreinte enregistrée ne correspond plus à un état historique cohérent (la vérification d'intégrité s'appuie sur `reveal`, `check` signale une fenêtre restée ouverte plus de 7 jours en warning).
- `ai-learn diagram status` : fenêtre ouverte ou fermée, calques `ia-phase-*` présents, rappel « reporte les corrections dans ton calque ».
- **Mode d'emploi** (`templates/diagramme.md`) complété : section « La fenêtre de correction », commandes `snapshot`/`reveal`/`status`, ce que fait le guard, quoi faire si `reveal` refuse, comment masquer les anciens calques `ia-phase-*` (ne jamais les supprimer : c'est l'historique de tes écarts).
- Docs : README, `project-context.md`, `architecture.md` (couplage `guard.js` ↔ `drawio.js`), AGENTS §Diagramme (fenêtre, calque, couleur, interdiction de toucher `apprenant`).

## Acceptance Criteria

- [ ] Given aucune fenêtre ouverte, when l'IA écrit `docs/systeme.drawio` via `Write`, then le guard refuse avec le message.
- [ ] Given une phase non prouvée, when `diagram snapshot`, then exit 1.
- [ ] Given une fenêtre ouverte, when l'IA écrit le `.drawio`, then le guard autorise.
- [ ] Given une boîte ajoutée dans `ia-phase-3`, when `diagram reveal --phase 3`, then succès, fenêtre fermée, « 1 boîte » enregistrée.
- [ ] Given un libellé modifié dans le calque `apprenant` pendant la fenêtre, when `diagram reveal`, then refus nommant la cellule, fenêtre ouverte.
- [ ] Given une cellule ajoutée dans le calque `apprenant` par l'IA, when `diagram reveal`, then refus.
- [ ] Given une fenêtre ouverte depuis 8 jours, when `check`, then warning.
- [ ] Given `init`, when on lit `docs/diagramme.md`, then la section « La fenêtre de correction » et les trois commandes y sont.

## Edge Cases

- L'apprenant modifie son calque pendant la fenêtre ouverte : `reveal` refuse ; le message dit à l'apprenant d'attendre le reveal, ou de relancer `snapshot` (qui remplace l'empreinte et garde la fenêtre).
- Plusieurs phases `diagram` sans reveal : une seule fenêtre à la fois, `snapshot` d'une autre phase refusé en nommant l'ouverte.
- `.drawio` déplacé ou renommé : le chemin est configurable dans `progress.json` (`diagramFile`), défaut `docs/systeme.drawio`.

## Out of Scope

- Noter les écarts (15.03).
