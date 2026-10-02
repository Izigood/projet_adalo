# App Canvas Studio — règles du dépôt

Référence fonctionnelle et technique : docs/dossier-creation.md (sections citées ci-dessous).
Décisions d'architecture : docs/adr/. Ne jamais contredire un ADR sans en écrire un nouveau.

## Produit
Studio low-code piloté par métadonnées. Le Studio (apps/studio, React 19) écrit un paquet projet
déclaratif ; le Runtime (apps/runtime, Web Components Lit 3) l'interprète. Aucun code n'est généré
par écran. MVP local/PWA sans backend.

## Manière de travailler
- Toujours commencer par une analyse écrite : fichiers concernés, exigences couvertes (ID), risques,
  plan de tests. Attendre validation avant d'écrire du code.
- Travailler uniquement dans le périmètre du lot demandé. Signaler tout écart au lieu de l'implémenter.
- Si une erreur est commise ou détectée, la nommer explicitement, en expliquer la cause, la corriger.
- Ne jamais déclarer un lot terminé sans `pnpm verify` vert. Ne jamais désactiver un test,
  abaisser un seuil ou ajouter `// @ts-ignore` pour y parvenir.
- Fin de lot : résumé des exigences couvertes, tests ajoutés, écarts, entrée CHANGELOG, tag proposé.

## Commandes
- pnpm install --frozen-lockfile
- pnpm dev:studio | pnpm dev:runtime
- pnpm test (unitaires) | pnpm test:e2e (Playwright) | pnpm verify (toutes les gates)

## Architecture (dossier § 5, § 9.2)
- Les dépendances entre paquets suivent .dependency-cruiser.cjs. Ne pas le modifier pour faire passer un import.
- packages/components : aucun I/O. Données par binding, actions par événements.
- Accès aux données uniquement via le port Repository (packages/domain).
- Toute modification du projet dans le Studio passe par une commande (CMD-*) annulable.
- Le manifeste ne contient jamais de secret ni de donnée métier réelle.

## Interdits (bloquants)
- eval, new Function, setTimeout avec chaîne, innerHTML/outerHTML avec donnée dynamique, unsafeHTML Lit.
- Ajv en mode compilation à l'exécution (utiliser les validateurs standalone générés).
- localStorage pour autre chose que des préférences d'interface.
- Dépendance sous licence autre que MIT, Apache-2.0, BSD, ISC sans ADR.
- any explicite, export default.

## Conventions (dossier § 9.3)
- TypeScript strict + noUncheckedIndexedAccess. Erreurs métier en Result<T, DomainError>.
- Code et identifiants en anglais ; libellés d'interface en français dans locales/fr.json.
- Identifiants UUID v7 ; clés lisibles selon RG-11 ; jamais de référence par libellé.
- Tout changement de format du manifeste = migration + fixture de l'ancien format.

## Tests (dossier § 9.4)
- Chaque exigence livrée a au moins un test qui échoue si la fonctionnalité est retirée.
- Chaque nouvelle gate de qualification est livrée avec son contrôle négatif.
- Un contrôle doit mesurer un comportement, jamais un nom de fichier ou un objet enveloppe.
- Fixtures de référence dans packages/testing ; ne jamais les modifier pour faire passer un test.
