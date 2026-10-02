# ADR-0024 — Interdits ESLint : règles, exceptions et limites

- **Statut** : acceptée
- **Date** : 2026-10-02
- **Source** : CLAUDE.md « Interdits » ; dossier § 9.3 ; `eslint.config.js`

## Contexte

Les interdits de CLAUDE.md doivent faire échouer la CI. Plusieurs ne se traduisent pas directement en règle ESLint.

## Décision

Erreurs bloquantes : `eval` (y compris `window.eval`), `new Function`, `setTimeout`/`setInterval` avec chaîne, `any` explicite, `innerHTML`/`outerHTML` avec valeur dynamique (l'affectation d'un littéral reste permise), `export default`, `localStorage` (global ou via `window`, `globalThis`, `self`), import d'`ajv` (compilation à l'exécution), directives Lit `unsafeHTML` et `unsafeSVG`. Les globales navigateur et Node sont déclarées : sans elles, `no-eval` et `no-implied-eval` ne reconnaissent pas `window` ni `setTimeout`.

Exceptions explicites :

- `export default` autorisé dans les fichiers `*.config.*` (Vite, Vitest, Playwright, ESLint l'exigent) ; les autres règles s'y appliquent.
- `localStorage` autorisé uniquement dans `apps/*/src/preferences/**` : interprétation de « préférences d'interface ».

## Conséquences

- Limites connues : `setTimeout` n'est détecté qu'avec une chaîne littérale, un gabarit ou une concaténation (pas une chaîne stockée dans une variable : cela demanderait ESLint typé). `insertAdjacentHTML` et `document.write` ne sont pas couverts, car absents de CLAUDE.md.
- Contrôles négatifs : `tools/gate-tests/lint-gate.test.ts` (code conforme accepté, code interdit refusé par la règle prévue, règle désactivée laisse passer).

## Mise à jour (lot 1)

L'interdit d'importer `ajv` admet une exception : `packages/project-schema/scripts/**`, où l'on génère les validateurs au build (ADR-0027). Les points d'entrée d'Ajv listés (`ajv`, `ajv/dist/ajv`, `/2019`, `/2020`, `/jtd`) restent interdits partout ailleurs, y compris sous `src/` du même paquet, et les directives Lit restent interdites dans `scripts/`. `ajv/dist/runtime/*` et `ajv/dist/standalone` ne sont pas interdits.
