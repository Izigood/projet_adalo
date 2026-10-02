# ADR-0029 — Identifiants UUID v7 et clés lisibles

- **Statut** : acceptée
- **Date** : 2026-10-02
- **Source** : dossier § 6.4, § 9.3, RG-11 ; `packages/domain`, `packages/project-schema`, `packages/testing`

## Contexte

Les objets du manifeste et les enregistrements sont identifiés par un UUID v7, triable par date (§ 6.4). Une référence ne désigne jamais un objet par son libellé (§ 9.3).

## Décision

- **Générateur** dans `packages/domain`, sans dépendance externe : horodatage de 48 bits, version 7, compteur de 12 bits, variante 10, puis 62 bits aléatoires (RFC 9562). Les identifiants d'un même générateur sont **strictement croissants**, même dans la même milliseconde (le compteur s'incrémente, et l'horodatage avance d'une milliseconde s'il est épuisé) et même si l'horloge recule. L'horloge et l'aléa sont injectables.
- Le type `Id<Kind>` marque l'objet désigné à la compilation ; le motif du schéma vient d'une seule source (`UUID_V7_PATTERN` du paquet `domain`).
- Les objets se désignent par identifiant (`Relation.source`, `UINode.children`, `Page.rootNodeId`...) ; les requêtes et les rôles parlent en **clés** lisibles. RG-11 : `^[a-z][a-zA-Z0-9_]{0,63}$` (entités, champs, pages, workflows, requêtes) et `^[A-Z][A-Z0-9]{1,15}$` (projet).
- Les fixtures de référence utilisent `stableId(nom)` : un UUID v7 valide dérivé d'un nom, à horodatage fixe, donc stable quel que soit l'ordre de construction.

## Conséquences

- Un identifiant n'est pas un secret ni une preuve de non-collision entre générateurs indépendants : l'aléa des 62 bits la rend improbable (testé sur 2 000 identifiants à horloge égale).
- Les clés peuvent changer (`renameField` explicite, § 6.5) : les identifiants sont la référence stable.
