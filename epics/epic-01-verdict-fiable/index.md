# Epic 01 — Le verdict est fiable

## Goal

Faire en sorte que `ai-learn check` dise la vérité dans les deux sens : ne plus être
rouge pendant qu'une phase est légitimement en cours, et ne plus être vert quand la
preuve ne prouve plus rien.

## Business Value

L'argument entier de l'outil est *« la preuve prime sur la déclaration »*. Deux
défauts le contredisent aujourd'hui :

- un faux positif permanent (une phase `in_progress` avec un fichier de checkpoint
  déclenche une **erreur bloquante**) — c'est le scénario que `docs/DOGFOODING.md`
  désigne comme le pire possible : *« un check qui se déclenche sur un cas qu'on ne
  peut pas résoudre légitimement, c'est un check qu'on apprend à désactiver »* ;
- un faux négatif silencieux : une évidence reste valable indéfiniment, même après
  que `src/**` a changé ou disparu.

Tant que ces deux-là tiennent, tout mécanisme ajouté par-dessus (mutation, tests,
mode dirigeant) hérite d'un verdict auquel on ne peut pas se fier.

## Scope

Inclus :

- [ ] Un modèle d'états explicite du verdict : `en cours`, `prouvé`, `périmé`, `non prouvé`.
- [ ] L'empreinte du code prouvé écrite dans l'évidence et relue par les lecteurs.
- [ ] Le retour d'une phase périmée vers « à re-prouver ».
- [ ] Les prédictions en données horodatées, comptées par phase, exigées par `verify`.
- [ ] Un parseur d'arguments partagé et une sortie `--json`.
- [ ] La CI multi-OS, le `CHANGELOG.md`, et `docs/plans/` reconstitué.

Exclus :

- [ ] Le moteur de mutation (`ai-learn mutate`) — epic 02.
- [ ] Le ledger `tracks/tests.json` — epic 02.
- [ ] Le mode dirigeant et l'inversion du guard — epic 03.
- [ ] Toute réécriture de `scan.js`, `docs.js`, `propose.js`, `traps.js`.
- [ ] Toute migration destructive d'un projet existant (décision : rétro-compat silencieuse).

## Backbone

Journey : l'apprenant travaille une phase → `check` reste vert pendant le travail →
`verify` prouve → la preuve reste vraie tant que le code n'a pas bougé → elle
redevient à re-prouver quand il bouge → le tout est exigeant sur les prédictions et
lisible par une machine.

```text
s1
├── s2
│   └── s3
│       └── s4
│           └── s5
└── s6
```

`s6` ne touche que `.github/`, `CHANGELOG.md` et `docs/plans/` — disjoint de tous les
autres, exécutable en parallèle dans son propre worktree. `s2` à `s5` éditent tous
`check.js`, `status.js` et `next.js` : ils forment une chaîne séquentielle, pas des
branches parallèles.

## Stories

1. **story-01-01-trois-etats-du-verdict**
2. **story-01-02-preuve-perimee-a-reprouver**
3. **story-01-03-predictions-donnees**
4. **story-01-04-verify-exige-predictions**
5. **story-01-05-pilotage-cli**
6. **story-01-06-depot-tient-ses-promesses**

## Context Strategy

- Mode d'exécution par défaut : `STANDARD`
- Scout pre-step nécessaire : aucun. Le périmètre est connu (audit du 2026-09-01),
  les modules concernés sont nommés story par story.
- Ancres de recherche partagées : `latestEvidenceForPhase`, `checkpointFilePath`,
  `countJournalEntries`, `setPhaseStatus`, `writeEvidence`, `getFlagValue`
- Zones à ne pas toucher : `scan.js`, `docs.js`, `traps.js`, `propose.js`,
  `platforms/**`, `norm.js` (moteur), `guard.js` (décision)

## Architecture Impact

Introduit **un modèle d'états du verdict** là où il n'y avait que
`status ∈ {pending, in_progress, done}` croisé ad hoc avec « une évidence existe ».
L'état devient dérivé et calculé au même endroit pour les quatre lecteurs
(`check`, `status`, `next`, et la future sortie `--json`), au lieu d'être re-dérivé
différemment dans chacun.

Deux invariants existants sont préservés sans exception :

- `verify` garde le monopole du `done` (`setPhaseStatus` n'est appelé que de là) ;
- aucune écriture destructive : une évidence ancienne sans empreinte reste lisible
  et n'est **jamais** classée périmée.

## Testing Strategy

- Unitaire : le calcul d'état (table de cas : évidence absente / présente sans hash /
  présente avec hash identique / présente avec hash différent × `pending` /
  `in_progress` / `done`).
- Intégration : `check` sur un projet temporaire (`test/helpers.js#tmpProject`) pour
  chaque combinaison, en vérifiant **le code de sortie** autant que le texte.
- Non-régression : les ~340 tests existants passent sans modification, sauf ceux qui
  encodent explicitement le comportement corrigé — chaque modification d'un test
  existant doit être justifiée dans le `## Result` de la story.
- Portabilité : le hash doit être identique quel que soit le séparateur de chemin
  (`normalizePortable`) et l'ordre de lecture du répertoire.

## Risks

- Risque : rendre `check` trop permissif en corrigeant le faux positif, et perdre le
  filet qui rend `verify` non-skippable par omission. Mitigation : la story 01-01
  garde l'erreur pour `pending` + fichier de checkpoint présent, et ne relâche que
  `in_progress`.
- Risque : un hash instable (ordre de fichiers, CRLF, chemins Windows) ferait
  clignoter l'état `périmé` sans raison. Mitigation : tri explicite,
  `normalizePortable`, tests dédiés, CI multi-OS livrée dans la même epic (s6).
- Risque : le `.md` de prédictions devient généré et écrase une édition manuelle de
  l'apprenant. Mitigation : marqueur de fichier généré (même convention que
  `AGENTS.md` et le README des solutions), un `.md` personnalisé n'est jamais écrasé.
- Risque : `--json` fige un format que les stories suivantes voudront changer.
  Mitigation : `--json` est livré **en dernier** (s5), une fois le modèle d'états
  stabilisé par s1-s4, et porte lui-même un champ `version`.

## Decisions

- Décision : une évidence sans empreinte n'est jamais « périmée », seulement
  « non hashée ».
  - Raison : rétro-compatibilité silencieuse (décision verrouillée) ; le dogfood
    Fastify et tout projet déjà scaffoldé doivent continuer à passer `check`.
  - Conséquence : deux chemins de code cohabitent le temps que les projets se
    re-prouvent naturellement. Ne pas les fusionner avant que ce soit vrai.
- Décision : l'état est calculé dans `progress.js`, à côté de `latestEvidenceForPhase`.
  - Raison : `progress.js` est une feuille (aucun `require` interne) ; y placer le
    calcul évite le cycle `status.js → tracks/domain.js → scan.js` qui a déjà forcé
    à déplacer `latestEvidenceForPhase` hors de `status.js`.
  - Conséquence : `check`, `status`, `next` consomment tous la même fonction.
- Décision : `.ai-learn/predictions.json` devient la source de vérité, le `.md` un rendu.
  - Raison : l'antériorité prédiction < révélation ne peut pas être prouvée depuis de
    la prose. C'est le seul endroit de l'outil où un ordre temporel est démontrable.
  - Conséquence : ce qui est prouvé est l'**ordre d'écriture**, pas l'honnêteté.
    Cette limite doit être écrite dans le README et l'`AGENTS.md`, pas sous-entendue.

## Clarification Readiness

`ready` — les quatre questions bloquantes (découpage, isolation de la mutation,
compatibilité, source de vérité des prédictions) ont été tranchées le 2026-09-01 et
sont consignées dans `docs/roadmap.md`. Aucune question ouverte restante ne
changerait l'implémentation de cet epic.
