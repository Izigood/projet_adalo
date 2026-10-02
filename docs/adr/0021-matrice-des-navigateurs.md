# ADR-0021 — Matrice des navigateurs

- **Statut** : Acceptée : recommandation du dossier appliquée telle quelle (dossier § 0, tant qu'un ADR ne la modifie pas)
- **Date** : 2026-10-02
- **Source** : dossier de création § 3, décision D-11

## Contexte

La matrice était à définir (ENF-03, A9). Elle bloque le lot 0.

## Décision

Chrome et Edge (2 dernières versions), Firefox (courante et ESR), Safari 17 et plus (macOS, iOS). Tests automatisés sur Chromium, Firefox et WebKit.

## Conséquences

Playwright exécute les trois moteurs dès le lot 0 sur les squelettes. Les constructions de style retenues (feuilles de style construites) sont prises en charge par Safari 16.4 et plus (ADR-0026).
