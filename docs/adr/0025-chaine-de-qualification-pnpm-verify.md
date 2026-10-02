# ADR-0025 — Chaîne de qualification `pnpm verify`

- **Statut** : acceptée
- **Date** : 2026-10-02
- **Source** : dossier de création § 5.2, § 9.4, § 9.5

## Contexte

Le lot 0 doit livrer une commande unique qui exécute toutes les gates, avec un contrôle négatif par gate (REC-10).

## Décision

`pnpm verify` enchaîne, dans cet ordre : installation verrouillée, format (Prettier), `typecheck`, `lint`, `depcruise`, tests unitaires avec couverture, tests de gates (`test:gates`), build, E2E, contrôle négatif de la gate E2E (`test:gates-e2e`), `security` (osv-scanner et SBOM). Choix associés :

- **Couverture** : seuil global de 80 % sur les lignes ; 90 % de lignes et 85 % de branches sur `domain`, `expression`, `policy`, `workflow-engine`. Le dossier ne précise pas si le 80 % global vise aussi les branches : seules les lignes sont mesurées.
- **E2E** : Chromium, Firefox et WebKit (D-11) contre le build de production servi par `vite preview`.
- **Versions** : Vitest 3 et Vite 7 (même moteur côté application et tests) ; scripts d'installation refusés par défaut par pnpm 12, seul `esbuild` est autorisé (`allowBuilds`).
- **Sécurité** : `osv-scanner` est un binaire externe : un avertissement en local s'il manque, un échec en CI (variable `CI`). Le SBOM CycloneDX est produit par `pnpm sbom` puis validé.
- Les tests de gates lancent les vrais outils (ESLint, dependency-cruiser, Vitest, Playwright) ; leur délai est de 60 s (`tools/gate-tests/vitest.config.ts`). Le contrôle négatif de la gate E2E lance un navigateur : exécuté en parallèle des autres tests il a atteint 48 s puis le délai (alors qu'il dure 4 à 10 s seul). Il est donc exclu de la phase de tests unitaires et lancé seul, après l'E2E (`pnpm test:gates-e2e`). Le réglage `fileParallelism` n'est pas pris en compte au niveau d'un projet Vitest : il n'a pas été retenu.
- **Phase `test:gates`** (lot 1, ADR-0032) : les tests de gates lancent ESLint, dependency-cruiser et Playwright ; exécutés dans le même processus Vitest que les tests unitaires, ils saturent le processeur et faisaient échouer par intermittence les workers (« Timeout calling onTaskUpdate », délai RPC de 60 s). Cause établie par comparaison A/B : elle ne dépend pas de la version de Node. Le motif `!tools/gate-tests` du `vitest.config.ts` racine les exclut de `pnpm test`, et `verify-gate.test.ts` vérifie que les quatre phases de test (`test`, `test:gates`, `test:e2e`, `test:gates-e2e`) figurent dans la chaîne.

## Conséquences

- `verify` dure environ 2 minutes 30. La preuve que « un `eval` et une dépendance interdite font échouer la CI » exécute les commandes `lint` et `depcruise` du `package.json` sur une copie de travail : elle ne relance pas `verify` en entier (récursion), elle s'appuie sur la sémantique de `&&`.
- **Non vérifié** : la commande réelle d'`osv-scanner` (`scan source --lockfile`) n'a jamais tourné faute de binaire installé ; aucune CI n'existe encore dans le dépôt.
- Aucun contrôle automatique des licences (le SBOM est généré sans elles, `--lockfile-only`) : voir ADR-0022.
