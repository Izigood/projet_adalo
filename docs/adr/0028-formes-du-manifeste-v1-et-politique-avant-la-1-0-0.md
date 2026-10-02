# ADR-0028 — Formes du manifeste v1 et politique avant la 1.0.0

- **Statut** : acceptée (déroge sciemment à la lettre de CLAUDE.md, voir ci-dessous)
- **Date** : 2026-10-02
- **Source** : dossier § 6.2, § 6.3 ; lot 1 ; décisions 3 et 4 de l'analyse du lot 1

## Contexte

Le § 6.2 liste les attributs de premier niveau des 12 objets du manifeste, mais pas leur contenu détaillé. Plusieurs sous-structures sont décidées par des lots ultérieurs (composants au lot 3, expressions au lot 8, workflows au lot 10, politiques au lot 11).

## Décision

**Formes retenues quand le dossier ne dit rien** (toutes sujettes à révision par un lot ultérieur) :

- `Field.options`, discriminé par `type`, porte les règles du § 6.3 : précision et échelle du décimal (obligatoires, D-07), longueur max, motif, source d'un choix (dictionnaire ou liste fixe), cible d'une référence, types et taille des fichiers. C'est une extension du § 6.2. Il n'existe **aucun type `secret`** (EF-SEC-04).
- `Relation.onDelete` : `restrict` (nommé au § 7.7), `cascade`, `setNull` (supposés). Opérateurs de `FilterSpec` : `eq ne gt gte lt lte in startsWith`. Validateurs de champ : seule la sorte `expression` (exemple du § 6.3). Déclencheurs de workflow : `manual` et `event`. Journal : `none error info debug`. Politique d'erreur : essais 0 à 10, délai 1 ms à 10 min.
- `props`, `bindings` et `events` d'un `UINode`, `params` d'un nœud de workflow et `default` d'un champ sont des **objets JSON ouverts** : le manifeste exige un objet, rien de plus, jusqu'aux lots concernés. La structure de l'arbre (identifiants, enfants, points de rupture, routes, gardes) est en revanche strictement contrôlée.
- `Role.permissions` : pages, actions, entités avec opérations (`read create update delete`) et règles par champ (`hidden readonly editable`). `project.json` : `manifestVersion`, `project`, `runtime.minVersion`, `entries` (chemins des fichiers), `dependencies.components`, et `secretRefs` optionnel. `ProjectVersion` : somme de contrôle et date de publication facultatives (un brouillon n'en a pas).
- Tout objet rejette les propriétés inconnues (`additionalProperties: false`) : un `password` glissé dans le manifeste est refusé avec son chemin (EF-SEC-04, SEC-06 au niveau du schéma). Les valeurs d'un thème sont contraintes contre l'injection CSS (voir ADR-0026). Les 22 types de nœuds sont ceux du § 4.6 ; les nœuds post-MVP sont refusés.
- La cohérence **entre** fichiers (un enfant d'un nœud qui existe, une relation vers une entité réelle, `defaultThemeId`, les chemins de `entries`) relève du validateur du lot 13. `packages/testing` en contient une version minimale (`consistencyProblems`) pour que les fixtures de référence soient fiables.

**Politique de version avant la 1.0.0** : `manifestVersion` reste à 1 jusqu'au lot 14 (version 1.0.0). Tant qu'aucun paquet n'a été publié, une évolution du format v1 n'exige pas de migration : les fixtures v1 sont mises à jour par un commit explicite qui le dit. La fixture de l'ancien format (v0) n'est **jamais** modifiée.

## Conséquences

- Écart assumé avec CLAUDE.md (« tout changement de format du manifeste = migration + fixture de l'ancien format ») : la règle s'applique intégralement à partir de la 1.0.0 ; avant, seule la chaîne v0 vers v1 existe, avec sa fixture. À transcrire dans CLAUDE.md si cette politique est confirmée.
- Les lots 3, 8, 10 et 11 précisent les charges utiles ouvertes en adaptant les schémas et les fixtures, sans migration.
- Les suppositions ci-dessus sont les premières à relire si une exigence du dossier les contredit.
