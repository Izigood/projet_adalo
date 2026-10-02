# ADR-0014 — Moteur d'expressions : jsep et interpréteur maison

- **Statut** : Acceptée : recommandation du dossier appliquée telle quelle (dossier § 0, tant qu'un ADR ne la modifie pas)
- **Date** : 2026-10-02
- **Source** : dossier de création § 3, décision D-04

## Contexte

Options : A, sous-ensemble type JS parsé par jsep avec vérificateur de types et interpréteur maison ; B, DSL et parseur entièrement maison.

## Décision

**Option A.** Syntaxe familière, parseur maintenu (licence MIT), aucun `eval` (RG-05, ARC-EXP-01).

## Conséquences

Concerne le lot 8. `eval`, `new Function` et `setTimeout` avec chaîne sont interdits par ESLint dès le lot 0 (ADR-0024).
