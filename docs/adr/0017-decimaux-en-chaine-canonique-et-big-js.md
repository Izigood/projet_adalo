# ADR-0017 — Décimaux : chaîne canonique et big.js

- **Statut** : Acceptée : recommandation du dossier appliquée telle quelle (dossier § 0, tant qu'un ADR ne la modifie pas)
- **Date** : 2026-10-02
- **Source** : dossier de création § 3, décision D-07

## Contexte

Options : A, chaîne canonique avec échelle par champ et calcul avec big.js ; B, `number` JavaScript.

## Décision

**Option A.** Pas d'erreur d'arrondi sur montants et indicateurs ; le tri passe par une clé d'index normalisée.

## Conséquences

Concerne le lot 4. Ajoute la dépendance big.js (licence à vérifier avant ajout, ADR-0022).
