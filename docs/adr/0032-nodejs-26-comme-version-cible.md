# ADR-0032 — Node.js 26 comme version cible

- **Statut** : acceptée
- **Date** : 2026-10-02
- **Source** : dossier § 5.2 (« Node.js LTS courant ») ; demande de l'utilisateur ; ADR-0025

## Contexte

Le dépôt visait Node 24 (lot 0). Une politique de gestion du poste de développement a installé Node 26.10.0 en cours de lot 1, et la chaîne complète (`pnpm verify`, 541 tests, E2E sur les trois navigateurs) passe dessus. L'utilisateur a demandé de viser Node 26 si c'était possible.

## Décision

- Cible : **Node 26**. `.nvmrc` vaut `26`, `engines.node` vaut `>=26.0.0` (avec `engine-strict`), les types `@types/node` sont en `^26.6.3`.
- `@types/node` est volontairement en `26.6.3` et non `26.6.4` : la 26.6.4 avait moins d'un jour, et pnpm refuse par défaut les versions trop récentes (protection de chaîne d'approvisionnement). Lors de l'installation, pnpm avait **ajouté de lui-même** une exception `minimumReleaseAgeExclude` dans `pnpm-workspace.yaml` : elle a été retirée, et le lockfile reconstruit sous la politique.

## Conséquences

- **Écart avec le dossier** : Node 26 est aujourd'hui la version « Current » et ne passe en LTS que plus tard dans l'année (versions paires, en octobre). Le § 5.2 demande la LTS courante ; la bascule en LTS règle l'écart sans autre action. Tant qu'elle n'a pas eu lieu, une régression propre à Node 26 reste possible.
- Une CI future devra installer Node 26 (le fichier `.nvmrc` fait foi).
- Règle pour la suite : **relire tout changement de `pnpm-workspace.yaml` après une installation**. pnpm peut y inscrire seul une exception à ses protections ; il ne faut jamais en garder une sans décision explicite et un ADR.
