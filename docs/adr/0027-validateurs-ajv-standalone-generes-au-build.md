# ADR-0027 — Validateurs Ajv standalone générés au build

- **Statut** : acceptée
- **Date** : 2026-10-02
- **Source** : CLAUDE.md « Interdits » (Ajv) ; dossier § 5.1 ; lot 1 ; `packages/project-schema/scripts`

## Contexte

Les schémas du manifeste sont écrits en TypeBox (REC-03). Ajv compile un schéma avec `new Function`, ce que la CSP du Studio et des PWA publiées interdit (`unsafe-eval`). Le dossier impose donc le mode _standalone_ : le code de validation est généré au build.

## Décision

- `pnpm generate` écrit `packages/project-schema/generated/validators.js` et `.d.ts` à partir du registre `SCHEMAS`. Ces fichiers **ne sont pas versionnés** (§ 5.1 : « généré au build »). `pnpm generate` est la première étape de `pnpm verify` et le démarrage global de Vitest du paquet régénère les validateurs avant tout test.
- Le module généré est **autonome** : aucun `import`, aucun `require`, aucun `new Function`, aucun `eval`. `generateValidators` refuse de produire un fichier qui en contiendrait, et un test exécute les validateurs avec le constructeur `Function` bloqué. Ajv n'est donc qu'une dépendance de **développement** : il n'arrive jamais dans les applications.
- Options d'Ajv : `strict`, `allErrors` (toutes les erreurs d'un document), `discriminator` (unions par propriété `type`, avec une erreur précise par variante), `inlineRefs: false` (une définition partagée est compilée une fois et appelée, au lieu d'être recopiée), `unicode: false` (longueur des chaînes en unités UTF-16 : sans cela Ajv génère un `require` d'un utilitaire). Ajv signale cette dernière option comme dépréciée ; l'avertissement attendu est filtré, tout autre avertissement fait échouer la génération.
- Les définitions réutilisées (clé lisible, identifiant, libellé, classification, `Field`, `Entity`...) sont enregistrées sous leur nom dans `SCHEMAS` et référencées par `$ref`. Mesure au lot 1 : 285 Ko bruts, 25 Ko compressés pour l'ensemble des schémas (avant cette mesure, un seul `Field` pesait 25 Ko compressés).
- **Exception ESLint** à l'interdit d'importer `ajv` : uniquement `packages/project-schema/scripts/**` (génération au build, explicitement permise). Rien sous `src/` ni dans un autre paquet ne peut importer Ajv ; les points d'entrée d'Ajv qui compilent (`ajv`, `ajv/dist/ajv`, `/2019`, `/2020`, `/jtd`) restent interdits partout ailleurs, et les directives Lit aussi dans `scripts/`.
- TypeBox est épinglé en `0.34.52`. Le script de génération est lancé avec `vite-node`, car Node ne résout pas les imports `./x.js` vers des fichiers `.ts`.

## Conséquences

- `pnpm typecheck`, `lint` et `depcruise` exigent que les validateurs aient été générés (`pnpm generate`) : `verify` le fait en premier.
- Le fichier généré est exclu du lint, du format et de la couverture. Les contrôles négatifs sont `scripts/generate-validators.test.ts` et `tools/gate-tests/lint-gate.test.ts`.
- **Point à surveiller** : la taille du fichier généré croît avec les schémas ; budget du Runtime de base : 250 Ko compressé (§ 8.3), à mesurer au jalon J1.
- `unicode: false` dépend d'une option qu'Ajv déprécie : si une version future la retire, il faudra une autre manière d'éviter `ucs2length` (le test de fichier autonome le signalerait).
