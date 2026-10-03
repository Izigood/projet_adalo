# ADR-0036 — Données locales : port Repository, stockage et relations

- **Statut** : acceptée (complétée au fil du lot 4)
- **Date** : 2026-10-03
- **Source** : dossier § 6.3 à 6.5, § 7.1, § 7.7, § 4.2 (EF-DAT-02, 03, 06, EF-BND-03), RG-02, RG-04 ; décisions D-07, D-09, D-10 ; ADR-0017, ADR-0019, ADR-0020, ADR-0023

## Contexte

Le § 7.1 donne `Repository` et `QuerySpec`, mais laisse plusieurs points ouverts : le `Repository` n'est lié à aucune entité alors que `get(id)` n'en désigne pas ; une `Relation` du manifeste ne dit pas quel champ porte la clé étrangère ; le store de jonction `j_{relation}` n'a pas de nom stable, la relation n'ayant pas de `key` ; `where` suppose le moteur d'expressions (lot 8) ; le catalogue d'erreurs du § 7.7 ne couvre ni une requête impossible, ni une migration bloquée, ni l'absence d'IndexedDB.

## Décision

**Port** (dans `packages/domain`, sans dépendance) : `RecordEnvelope`, `Draft`, `Page`, `QuerySpec`, `FilterSpec`, `UnitOfWork`, `Repository`, `DataStore`, `Observable`. `domain` ne peut importer ni `project-schema` ni TypeBox : les formes du manifeste y sont recopiées, et un test de `data-repository` (qui voit les deux) vérifie qu'elles ne dérivent pas (mêmes opérateurs, mêmes directions, mêmes fonctions d'agrégat, même taille de page maximale, une `Query` du manifeste est une `QuerySpec` pour le compilateur).

**Écart avec le § 7.1** : un `Repository` est lié à une entité (`repository.entity`), obtenue par `DataStore.repository(entity)`. Sans cela `get(id)` et `delete(id)` ne savent pas où chercher. `query` refuse une `source` qui n'est pas cette entité (`QUERY_INVALID`). `UnitOfWork.of(entity)` donne les opérations d'une entité dans la transaction. `Observable` est un type minimal (`subscribe` renvoie le désabonnement), sans RxJS.

**`Draft`** : un enregistrement à écrire n'a ni `_v`, ni dates, ni auteurs : ils appartiennent au Repository. Sans `id`, c'est une création.

**Erreurs** : trois codes complètent le catalogue, comme `COMPONENT_INVALID` au lot 3 : `QUERY_INVALID`, `MIGRATION_BLOCKED`, `STORAGE_UNAVAILABLE`.

**Relations** (précisé aux étapes 5 et 7) : la clé étrangère d'une relation 1-1 ou 1-N est l'unique champ `reference` de l'entité `target` qui pointe vers `source` ; zéro ou plusieurs candidats sont une erreur à l'ouverture. Le côté « un » est `source`, et `onDelete` s'applique à la suppression d'un enregistrement `source`. N-N : store `j_<id de la relation>`, lignes `{ id, sourceId, targetId }`, et `cascade` ne touche que la jonction (I-05).

**`where`** : refusé tant que le moteur d'expressions n'existe pas, par `QUERY_INVALID`, jamais ignoré en silence.

**Valeurs** (étape 2) : `checkFieldValue(field, value)` vérifie la forme d'une valeur selon son type et ses options, et renvoie la valeur à stocker. Il ne vérifie ni la présence (obligatoire, défaut, unicité : contraintes du Repository), ni l'existence de ce que la valeur désigne (relations).

- **Décimaux** : chaîne canonique à l'échelle du champ (`1.5` devient `1.50`, pas de zéro négatif). Un nombre JavaScript est refusé. Une valeur qui aurait plus de décimales que l'échelle est refusée, pas arrondie. `decimalSortKey` donne une clé dont l'ordre textuel est l'ordre numérique (signe, chiffres sur `precision`, complément à 9 pour un négatif) ; c'est elle qui sera indexée. Somme et moyenne passent par big.js, la moyenne est arrondie à la demie supérieure. Le réglage `Big.DP = 80` et `Big.RM` est global à big.js : le futur moteur d'expressions qui l'utilisera partagera ce réglage.
- **Regex** : `safeRegExp` compile avec le drapeau `u` (comme Ajv) et refuse les répétitions imbriquées illimitées, les alternatives qui se chevauchent sous une répétition, les produits de répétitions supérieurs à 1000, les références arrière et le look-behind. C'est une heuristique prudente : elle refuse aussi `^([a-z]+-)+[a-z]+$`, qui est linéaire. Elle ne voit pas les cas polynomiaux (`.*.*.*x`), que borne la longueur de la valeur (255 pour un champ `string`). Un motif refusé donne `pattern-unsafe`, il n'est jamais exécuté.
- **Dates** : `date` doit être un vrai jour du calendrier grégorien (années bissextiles comprises) ; `datetime` est du ISO 8601 en UTC (`Z` obligatoire), avec une heure réelle.
- **`choice` sur un dictionnaire** : la valeur stockée est l'identifiant de l'enregistrement du dictionnaire (UUID v7), contrôlé comme une `reference` à l'étape 5. Le dossier ne dit pas ce que stocke ce choix ; c'est une lecture, que le Studio du lot 6 devra suivre.
- **`json`** : données simples seulement, 32 niveaux et 10 000 valeurs au plus, clé `__proto__` refusée. Le `schema` optionnel du champ est « recommandé » (§ 6.3) et n'est pas appliqué.
- **Longueurs** : comptées en points de code, comme JSON Schema, pas en unités UTF-16.

## Conséquences

- Le lot 8 branchera `where` sans changer le port.
- Les étapes suivantes complètent cet ADR : valeurs et décimaux, stockage et environnements, contraintes, requêtes, migrations de données.
