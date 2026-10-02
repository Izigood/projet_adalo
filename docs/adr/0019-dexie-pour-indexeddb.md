# ADR-0019 — Bibliothèque IndexedDB : Dexie.js

- **Statut** : Acceptée : recommandation du dossier appliquée telle quelle (dossier § 0, tant qu'un ADR ne la modifie pas)
- **Date** : 2026-10-02
- **Source** : dossier de création § 3, décision D-09

## Contexte

Options : Dexie.js ou idb.

## Décision

**Dexie.js** : transactions, index composés, migrations de version, requêtes réactives.

## Conséquences

Dexie reste confiné à `packages/data-repository` : une règle dependency-cruiser interdit son import ailleurs (ADR-0023). Concerne le lot 4.
