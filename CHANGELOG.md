# Journal des modifications

Format inspiré de Keep a Changelog. Un lot terminé = une entrée et un tag `vX.Y.0` (dossier § 9.6).

## [0.0.0] — Lot 0 « Fondations » — 2026-10-02

Tag proposé : **`v0.0.0`** (non posé : à créer après validation du lot).

### Ajouté

- **Monorepo pnpm** (Node 24, pnpm 12.8.1 épinglé) avec TypeScript strict (`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`), Prettier, ESLint, dependency-cruiser, Vitest (couverture), Playwright, `.gitattributes` en LF.
- **`pnpm verify`** : installation verrouillée, format, typecheck, lint, dépendances, tests avec couverture, build, E2E sur Chromium, Firefox et WebKit, contrôle négatif de la gate E2E, osv-scanner et SBOM CycloneDX (ADR-0025).
- **Paquets** : `domain` (`Result`, `DomainError` avec les 7 codes du § 7.7, `Id` typé UUID v7), `design-system` (jetons de base, thèmes clair et sombre, `themeCss`, `applyTheme`), 10 autres paquets et `tools/acs-cli` en squelette (un `index.ts` et un test chacun), `tools/ci-checks`, `tools/gate-tests`.
- **Squelettes qui démarrent** : `apps/studio` (React 19, Vite 7) et `apps/runtime` (Lit 3, Vite 7), tous deux thémés par les jetons, libellés en français dans `src/locales/fr.json`. Commandes : `pnpm dev:studio`, `pnpm dev:runtime`.
- **Interdits de CLAUDE.md** appliqués par ESLint : `eval`, `new Function`, `setTimeout`/`setInterval` avec chaîne, `any`, `innerHTML`/`outerHTML` dynamiques, `export default`, `localStorage`, Ajv compilé à l'exécution, `unsafeHTML`/`unsafeSVG` de Lit (ADR-0024).
- **ADR** : 0001 et 0002 (transcription minimale), 0003 à 0010 (emplacements réservés), 0011 à 0022 (décisions D-01 à D-12), 0023 à 0026 (choix du lot), index `docs/adr/README.md`.

### Critères de sortie du lot 0

| Critère                                     | Preuve                                                                                                                                                                                               |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm verify` vert                          | `pnpm verify` : 180 tests unitaires et de gates, couverture de lignes à 100 %, build des deux applications, 24 tests E2E (8 par navigateur), 4 contrôles négatifs E2E, étape `security`.             |
| Une dépendance interdite fait échouer la CI | `tools/gate-tests/verify-gate.test.ts` (commande `depcruise` réelle sur une copie de travail) ; `depcruise-gate.test.ts` ; `depcruise-table-gate.test.ts` (les 14 lignes du tableau 9.2, une à une). |
| Un `eval` fait échouer la CI                | `tools/gate-tests/verify-gate.test.ts` (commande `lint` réelle) ; `lint-gate.test.ts` (65 cas).                                                                                                      |
| Playwright sur 3 navigateurs                | `playwright.config.ts` ; `tools/gate-tests/e2e-matrix-gate.test.ts` exige que chaque spec tourne sur les trois moteurs.                                                                              |

### Contrôles négatifs livrés (REC-10)

Chaque gate a son contrôle, qui mesure un comportement (les vrais outils sont lancés sur des fixtures) : couverture (`coverage-gate.test.ts`, les 4 paquets de logique), ESLint (`lint-gate.test.ts`), dépendances (`depcruise-gate.test.ts`, `depcruise-table-gate.test.ts`), chaîne `verify` (`verify-gate.test.ts`), E2E (`e2e-gate.test.ts` pour le Studio et le Runtime, `e2e-matrix-gate.test.ts`), sécurité (`security-gate.test.ts`). Des mutations réelles (seuil abaissé, règle ou paquet retiré, navigateur retiré, ligne du tableau 9.2 modifiée) ont été appliquées puis annulées pour vérifier que le test visé échoue.

### Écarts par rapport au dossier

1. **ADR-0003 à 0010 non transcrits.** Le DAD d'où ils proviennent n'est pas dans le dépôt ; ce sont des emplacements réservés explicites, pas des décisions inventées. Écart accepté par l'utilisateur (« ADR minimaux »). À transcrire dès que le DAD est disponible.
2. **`axe-core` non installé.** Prévu aux § 5.2 et 9.4, mais sous licence MPL-2.0, hors de la liste de CLAUDE.md (MIT, Apache-2.0, BSD, ISC) ; le § 5.2 affirme à tort que tout est MIT, Apache 2.0 ou BSD. Il faut un ADR (autoriser ou remplacer) avant le lot 3, où l'accessibilité devient testable (ADR-0022).
3. **Aucune CI dans le dépôt.** Le § 9.5 prévoit GitHub Actions ou Azure DevOps « selon l'outillage interne » : non tranché. Le critère « la CI échoue » est démontré sur les commandes de `verify`, pas sur un pipeline.
4. **osv-scanner jamais exécuté.** Le binaire n'est pas installé (choix de l'utilisateur) : `pnpm verify` réussit en local avec un avertissement, et échoue en CI s'il manque. La commande réelle (`scan source --lockfile`) et la lecture du lockfile de pnpm 12 restent à vérifier (ADR-0025).
5. **Couverture globale de 80 % sur les lignes seulement** : le § 9.4 ne précise pas si les branches sont visées (ADR-0025).
6. **Tableau 9.2 appliqué à la lettre** (ADR-0023). Conséquence : `components`, `validator` et `publisher` ne peuvent pas importer `domain` directement. À trancher par ADR si `Result` ou `DomainError` y deviennent nécessaires (lots 3 et 13).
7. **Périmètre anticipé.** `themeCss`/`applyTheme` (variables CSS, EF-THM-01, prévu au lot 2), la mesure des contrastes des thèmes de base (EF-THM-02, lot 7 pour l'éditeur) et les types `Result`, `DomainError`, `Id` (non listés au lot 0) ont été livrés pour que les squelettes démarrent avec un thème et que `domain` ne soit pas vide. Écart signalé ici plutôt que décidé en silence.
8. **ENF-06** n'a pas de ligne dans le tableau 4.2 : interprétée comme « contrats typés » (TypeScript strict, pas de `any`, `Result`).

### Dette et points ouverts

- **Pas de contrôle automatique des licences** alors que CLAUDE.md interdit toute licence hors liste : le SBOM est généré avec `--lockfile-only` (sans licences). À traiter avant d'ajouter des dépendances au lot 1.
- **Tests de squelette sans valeur d'exigence** : 11 paquets et `acs-cli` n'ont qu'un test de constante (`PACKAGE_NAME`). Ils prouvent seulement que le paquet est branché dans `typecheck` et `test`. Les seuils de 90 % et 85 % de `policy`, `expression` et `workflow-engine` sont donc sans portée avant les lots 8, 10 et 11.
- **Limites des règles ESLint** (ADR-0024) : `setTimeout` avec une chaîne stockée dans une variable, `insertAdjacentHTML` et `document.write` ne sont pas détectés. `eslint.config.js` n'est pas typé.
- **Environnement** : sur la machine de développement, la fermeture de Chromium et de Firefox prend par moments 20 à 70 s (WebKit : moins d'une seconde), ce qui a fait échouer des exécutions de `verify`. Les tests Playwright ont un délai de 120 s et 2 workers ; les contrôles négatifs de l'E2E tournent sur WebKit, seuls, après l'E2E. La cause n'est pas dans le projet (ADR-0025).
- **Durée de `verify`** : de 2 à 4 minutes selon la charge de la machine.

### Revue indépendante (sous-agent `reviewer`)

Verdict provisoire « lot à reprendre » : aucun interdit de CLAUDE.md trouvé, mais 17 constats. Limite : le sous-agent n'avait en pratique que des outils de lecture, il n'a donc ni lancé `pnpm verify` ni exécuté de mutation ; ses prédictions ont été vérifiées par moi.

- **Corrigés avec un test** : seuil de lignes des paquets de logique non protégé (mutation confirmée : 90 → 10 ne faisait échouer aucun test), matrice des 3 navigateurs sans contrôle, contrôle E2E limité au Studio, tableau 9.2 testé sur 4 lignes sur 14, motifs ESLint affirmés sans test, trous de contournement (`ajv/dist/*`, `*.config.*` dans `src`, `.tsx`), paramètre mort du test E2E, test dépendant de l'ordre.
- **Corrigés sans test dédié** : CHANGELOG (ce fichier), `packageManager` épinglé, fichiers de configuration typés, dossier temporaire des gates exclu de Prettier et des tests.
- **Consignés ci-dessus, non résolus** : ADR-0003 à 0010 (écart 1), osv-scanner (écart 4), licences (dette), tests de squelette (dette), périmètre anticipé (écart 7), absence de CI (écart 3).
