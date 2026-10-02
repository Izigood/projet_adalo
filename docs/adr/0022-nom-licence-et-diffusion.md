# ADR-0022 — Nom, licence et diffusion

- **Statut** : Acceptée : recommandation du dossier appliquée telle quelle (dossier § 0, tant qu'un ADR ne la modifie pas)
- **Date** : 2026-10-02
- **Source** : dossier de création § 3, décision D-12

## Contexte

Nom, licence et diffusion (CDC Q1, Q7) restaient à définir.

## Décision

Nom de travail conservé, usage interne, code propriétaire ; vérifier les licences des dépendances (MIT, Apache 2.0, BSD uniquement selon le dossier ; ISC est aussi admis par CLAUDE.md).

## Conséquences

**Point ouvert.** `axe-core`, prévu aux §5.2 et 9.4 pour l'accessibilité, est sous licence MPL-2.0, hors de la liste autorisée : il n'a pas été installé au lot 0. Une décision (ADR dédié) est à prendre avant le lot 3. Le SBOM du lot 0 est généré sans les licences (`--lockfile-only`) : le contrôle automatique des licences n'existe pas encore.
