# Spec — Story 13.06 — La pédagogie se teste sur l'apprenant, avec une mesure qu'elle ne peut pas gonfler

## User Value

Une proposition `pedagogie` acceptée (« la synthèse en cinq étapes aide plus que la synthèse libre ») devient une expérience : l'outil alterne les deux variantes d'une phase à l'autre, mesure un résultat que l'agent ne contrôle pas, et refuse de conclure avant d'avoir assez de phases. L'outil améliore sa façon d'enseigner sur des preuves, pas sur une impression.

## Requirements

- `ai-learn memory experiment start --id <slug> --hypothesis "<…>" --variants a,b --metric <métrique> [--min <n>] [--proposal <fichier>]` ; `experiment stop --id` ; `experiment report [--id]` (machinerie).
- Une seule expérience active à la fois (sinon refus nommant l'active).
- **Affectation par phase** : à la première prédiction d'une phase, la phase reçoit la variante suivante (alternance a, b, a…), enregistrée dans `~/.ai-learn/memory/experiments.json` avec l'alias et l'id de phase ; `next --json` porte `experiment: { id, variant, instruction }` pour que l'agent applique la variante.
- **Métriques autorisées** (aucune n'est la note /10 que l'agent attribue lui-même) :
  - `revisite` : taux de réussite de `verify --revisit` sur les phases de la variante ;
  - `transfert` : note moyenne des prédictions `transfert` des phases de la variante ;
  - `incident` : taux de `break --resolve` sans `--giveup` ;
  - `calibration` : disponible seulement si l'epic 14.01 est livrée (refus clair sinon).
- `--min` par défaut 6 phases par variante, minimum 4. `report` sous le seuil : « n/min, pas de conclusion » ; au-delà : valeur par variante et écart, **jamais** de verdict « gagnante » si l'écart est inférieur à 10 points.
- **Deux apprenants** (le mainteneur et un second utilisateur, chacun sur sa machine, 2026-11-24) : `experiment export --id <id> [--out <fichier>]` écrit un JSON **anonymisé** (id, hypothèse, variantes, métrique, et par phase : variante + mesure ; ni alias de projet, ni chemin, ni texte de prédiction) ; `experiment report --id <id> --with <fichier>[,<fichier>]` additionne les phases importées (refus si l'id, les variantes ou la métrique diffèrent) et affiche **le résultat par apprenant en plus du total** : un écart présent chez un seul apprenant est signalé « pas de conclusion commune ». Le seuil `--min` s'applique au total, et chaque apprenant doit avoir au moins 2 phases par variante.
- `memory export` rend `<vault>/ai-learn/experiments/<id>.md` (hypothèse, variantes, affectations par alias, mesure, statut).

## Acceptance Criteria

- [ ] Given une expérience active, when `experiment start` d'une seconde, then exit 1 nommant l'active.
- [ ] Given une expérience active et trois phases commencées, when on lit `experiments.json`, then elles ont reçu a, b, a.
- [ ] Given une phase affectée à `b`, when `next --json`, then `experiment.variant` vaut `b`.
- [ ] Given `--metric note`, when `experiment start`, then exit 1 listant les métriques autorisées.
- [ ] Given 3 phases par variante et `--min 6`, when `experiment report`, then « 3/6, pas de conclusion ».
- [ ] Given 6 phases par variante et un écart de 5 points, when `experiment report`, then aucune variante n'est déclarée gagnante.
- [ ] Given l'export d'un second apprenant (même id) avec 3 phases par variante et 3 phases locales par variante, `--min 6`, when `experiment report --with <export>`, then le total compte 6 par variante et le résultat de chaque apprenant est affiché.
- [ ] Given un export dont la métrique diffère, when `report --with`, then exit 1 nommant la différence.
- [ ] Given `experiment export`, when on lit le JSON, then il ne contient ni alias de projet, ni chemin, ni texte de prédiction.
- [ ] Given `--metric calibration` sans la confiance (14.01), when `experiment start`, then exit 1 explicite.

## Edge Cases

- Phase revisitée : garde sa variante d'origine.
- Projet sans `memory/` : l'expérience n'affecte que les projets où une prédiction est enregistrée après son démarrage.

## Out of Scope

- Test statistique formel : à deux apprenants, l'écart brut par apprenant plus un seuil d'échantillon reste plus honnête qu'une p-valeur.
- Synchronisation automatique entre machines : l'export est un fichier que les apprenants s'échangent à la main.
- Changer automatiquement le protocole selon le résultat : la conclusion devient une proposition `pedagogie` (13.05) que l'humain accepte.
