# ADR-0035 — axe-core en dépendance de test (licence MPL-2.0)

- **Statut** : acceptée (lève l'écart n° 2 du lot 0 ; complète l'ADR-0022)
- **Date** : 2026-10-02
- **Source** : dossier § 5.2, § 8.4, § 9.4 ; CLAUDE.md (licences) ; ADR-0022

## Contexte

Le § 9.4 prévoit axe-core dans Playwright pour l'accessibilité. Il est sous licence MPL-2.0, hors de la liste de CLAUDE.md (MIT, Apache-2.0, BSD, ISC), qui exige un ADR pour toute autre licence. Le lot 0 avait laissé cette décision à prendre avant le lot 3, où l'accessibilité devient testable.

## Décision

`axe-core` et `@axe-core/playwright` sont autorisés **uniquement comme dépendances de développement** (tests E2E). La MPL-2.0 est un copyleft faible, qui s'applique aux fichiers de la bibliothèque elle-même : elle n'atteint pas le code du dépôt, et rien de ces paquets n'entre dans un bundle livré (Studio, Runtime, paquets publiés).

## Conséquences

- Aucune importation de ces paquets hors de `e2e/` (à contrôler en revue).
- Toute autre licence hors liste garde besoin de son propre ADR.
- Il n'existe toujours pas de contrôle automatique des licences (dette du lot 0).
