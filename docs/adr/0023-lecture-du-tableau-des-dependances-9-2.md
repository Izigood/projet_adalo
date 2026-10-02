# ADR-0023 — Lecture du tableau des dépendances autorisées (§ 9.2)

- **Statut** : acceptée
- **Date** : 2026-10-02
- **Source** : dossier de création § 9.2 ; `.dependency-cruiser.cjs`

## Contexte

Le tableau 9.2 donne, par module, ce dont il « peut dépendre » et ce dont il « ne doit jamais dépendre ». Il est muet sur `design-system`, `testing`, `acs-cli`, `gate-tests` et `ci-checks`, et ambigu sur « tous les paquets runtime ».

## Décision

Chaque module ne peut importer **que** les modules listés pour lui (liste blanche), ce qui couvre les deux colonnes du tableau. Hypothèses retenues là où le tableau est muet :

- `design-system` : aucune dépendance ; `gate-tests` et `ci-checks` : aucune dépendance.
- `testing` : `domain` et `project-schema` (fixtures de manifestes).
- `acs-cli` : `domain`, `project-schema`, `validator`, `publisher`.
- `apps/runtime` : `domain`, `project-schema`, `expression`, `data-repository`, `component-sdk`, `components`, `design-system`, `workflow-engine`, `policy` (ni `validator`, `publisher` ni `testing`, côté Studio d'après le § 5).
- `apps/studio` : tous les paquets ; jamais les internes de `apps/runtime`.
- Les fichiers de test peuvent en plus importer `packages/testing`.

Règles complémentaires : Dexie n'est importable que depuis `data-repository`, les dépendances circulaires et les imports non résolus sont interdits.

## Conséquences

- Le tableau étant appliqué à la lettre, `components`, `validator` et `publisher` ne peuvent pas importer `domain` directement. Si `Result` ou `DomainError` y sont nécessaires, un ADR devra assouplir la règle (autoriser `domain` partout est cohérent : c'est le paquet de base). **Point ouvert pour les lots 3 et 13.**
- Une violation fait échouer `pnpm depcruise`, donc `pnpm verify` (contrôles négatifs : `tools/gate-tests/depcruise-gate.test.ts`).
- Ne pas modifier `.dependency-cruiser.cjs` pour faire passer un import : modifier d'abord cet ADR.
