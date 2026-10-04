# Journal des modifications

Format inspiré de Keep a Changelog. Un lot terminé = une entrée et un tag `vX.Y.0` (dossier § 9.6).

## [0.4.0] — Lot 4 « Données locales » — 2026-10-04

Tag proposé : **`v0.4.0`** (non posé : à créer après validation du lot). Exigences : EF-DAT-02, EF-DAT-03, EF-DAT-06, EF-BND-03 (moteur), RG-02, RG-04.

### Ajouté

- **Port `Repository`** (`packages/domain`) : dépôt lié à une entité, `DataStore`, `UnitOfWork`, `QuerySpec`, pages, observateur ; codes d'erreur `QUERY_INVALID`, `MIGRATION_BLOCKED`, `STORAGE_UNAVAILABLE`, `ENVIRONMENT_FORBIDDEN`.
- **`data-repository`** (Dexie, confiné à ce paquet) : 13 types de champs, décimaux exacts (big.js), contraintes, verrou optimiste (`VERSION_CONFLICT`), relations 1-1, 1-N et N-N avec `onDelete` (`REFERENCE_BLOCKED`), transactions annulables, moteur de requêtes (planificateur sur index, recherche sans accents, agrégats exacts, curseur), `storage.persist()`.
- **Migrations de données** : plan (destructif ou non, renommage par identifiant), conversions, application atomique avec approbation du destructif, sauvegarde horodatée avec empreinte SHA-256, restauration, purge.
- **Environnements** : bases de test et de production séparées, chargement de données de test par l'API (réservé au test), export.
- **Tests partagés** : fixture `data` (empreinte épinglée), constructeurs d'entités, banc de volume (`benchQueries`).
- **ADR** : 0036 (dépôt et stockage, règle des transactions, migrations, banc).

### Critères de sortie du lot 4

| Critère                                                          | Preuve                                                                                                                                                                 |
| ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Fixture à 2 entités liées et données de test par l'API (AC-01)   | `environments/acceptance.test.ts` (8 tests) et `e2e/data-engine.spec.ts` (Chromium, Firefox, WebKit).                                                                  |
| `VERSION_CONFLICT` et `REFERENCE_BLOCKED` testés                 | Les mêmes, plus `data-store.test.ts` et `relations.test.ts`.                                                                                                           |
| Requête indexée sur 10 000 lignes en moins de 100 ms             | `query/volume.test.ts` (11) et `e2e/data-bench.spec.ts` : Chromium 0,8 à 7 ms, Firefox 1 à 7 ms ; sans index ≈ 130 ms. WebKit sous Windows : 600 lignes, sans horloge. |
| Migrations tenues à 90 % des lignes et 85 % des branches (§ 9.4) | Gate de couverture étendue à `packages/data-repository/src/migrations/**`.                                                                                             |
| Contrôles négatifs (REC-10)                                      | `e2e-gate.test.ts` : `no-index`, `few-rows`, `slow` (banc) et `no-restrict` (moteur).                                                                                  |
| `pnpm verify` vert                                               | 1365 tests unitaires, 132 tests de gates, 198 tests E2E, 14 contrôles de la gate E2E (exécution avant le commit ccedfc0).                                              |

### Ce que la revue et les E2E ont trouvé (et qui est corrigé)

- **Index composé qui perd des enregistrements (revue)** : l'égalité sur le premier champ d'un index `[a, b]` perdait les enregistrements sans `b`. Le préfixe n'est utilisé que si tous les champs de l'index sont présents.
- **Expressions régulières qui se recouvrent (revue)** : `^([a-z]|[a-m])*$` explosait ; les alternatives sont comparées comme ensembles de caractères.
- **Champs nommés comme `Object.prototype` (revue)** : toute lecture passe par `own()`.
- **Sauvegardes (revue)** : restauration limitée à l'environnement propre, réutilisation seulement pour les mêmes données, purge avec la base.
- **Banc qui ne prouvait rien (revue)** : une requête qui ignorait son filtre restait verte ; chaque requête dit maintenant si les enregistrements rendus sont les bons, et le budget a un contrôle négatif.
- **Filtre compteur (banc navigateur)** : il forçait des curseurs ; il n'est posé que s'il le faut.
- **Plage vide (test de propriété)** : `< a ET > a` faisait lever IndexedDB ; cas permanent.
- **Gate E2E vacue** : des specs ignorées comptaient comme réussies ; la gate lit le vrai statut.

### Écarts par rapport au dossier

1. **ADR-0036** seul ; aucune dépendance hors licences autorisées (Dexie, fake-indexeddb : Apache-2.0 ; big.js : MIT ; esbuild : MIT, développement).
2. **Quatre codes d'erreur ajoutés** au catalogue du § 7.7.
3. **Banc WebKit sous Windows** : 600 lignes et pas d'horloge (15,6 ms par requête IndexedDB mesurés) ; les 10 000 lignes sont jouées sous Chromium et Firefox.

### Dette et points ouverts

- **Règle des transactions** : le mécanisme de la fermeture précoce n'est pas élucidé (Dexie, fake-indexeddb, `await` natif) ; la règle est vérifiée dans les trois navigateurs, pas expliquée.
- **Toujours ouverts depuis les lots précédents** : captures `win32` seulement, pas de contrôle des licences, osv-scanner non exécuté, pas de CI, Node 26 non LTS.

## [0.3.0] — Lot 3 « Registre et composants de base » — 2026-10-03

Tag proposé : **`v0.3.0`** (non posé : à créer après validation du lot). Exigences : EF-CMP-01, EF-CMP-03, EF-UI-04 (rendu).

### Ajouté

- **`component-sdk`** : le contrat `ComponentDefinition` et les types que le § 7.3 cite sans les définir (ADR-0034), une validation à l'enregistrement (34 règles, chacune avec un cas négatif ; erreur `COMPONENT_INVALID`), le registre par identifiant et par majeure (deux majeures coexistent, chacune avec sa balise), les props validées par `Value` de TypeBox (interprété, sans génération de code) avec les valeurs par défaut du schéma, les points de rupture (600 et 1024 px) et les surcharges `responsive` limitées aux props que le composant déclare, la détection des dépréciations, et le plan de migration avec son diff.
- **Kit de contrat** (`contractFindings`) : il vérifie la définition puis l'élément réellement rendu (rôle présent, nom accessible, focalisable pour un rôle interactif, ni attribut `style` ni gestionnaire en ligne, compatibles avec la CSP du § 8.1).
- **23 composants** dans `packages/components` : structure (page, section, pile, grille, onglets, panneau latéral, accordéon), navigation (menu, barre d'onglets, fil d'Ariane, bouton retour, lien), information (texte, titre, badge, alerte, carte, indicateur, progression) et actions (bouton, menu d'actions, confirmation, notification). Les textes visibles et les noms de palette sont dans `locales/fr.json`.
- **Plugin** : le schéma `PluginManifest` est spécifié et validé, et aucun code ne charge un plugin (D-05). Un plugin ne peut pas prendre la place d'une famille de composants de base, ses éléments sont `acs-x-…`.
- **Runtime** : il dessine les pages avec le registre. Chaque nœud est l'élément de son composant, avec les props du point de rupture courant, suivi en direct par `matchMedia` ; des props invalides donnent un repère sur ce nœud ; un composant inconnu donne un repère neutre ; les dépréciations sont signalées une fois au démarrage. Bundle : 384 Ko bruts, 64 Ko en gzip (45 Ko avant le lot ; budget du § 8.3 : 250 Ko).
- **Tests partagés** : fixtures `responsive` et `interactive` (empreintes épinglées), `addPage`, `routingPage`.
- **ADR** : 0034 (contrat, registre, rendu) et 0035 (`axe-core` en dépendance de test, MPL-2.0).

### Critères de sortie du lot 3

| Critère                                                               | Preuve                                                                                                                                                                                                                                                                                                               |
| --------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Page responsive rendue à 360, 768 et 1280 px (captures de référence)  | `e2e/responsive.spec.ts` sur Chromium, Firefox et WebKit : colonnes de la grille mesurées sur le style calculé (1, 2, 4), aucun défilement horizontal, menu en colonne puis en ligne, redimensionnement à chaud, 9 captures de référence (0,1 % de pixels toléré), `axe-core` aux trois largeurs et en thème sombre. |
| Un composant sans métadonnées d'accessibilité fait échouer le contrat | `contract.test.ts` de `component-sdk` (rôle vide ou inconnu, source de nom absente, aucune touche pour un rôle interactif, prop requise inexistante) ; `contract.test.ts` de `components` applique le kit aux 23 composants.                                                                                         |
| EF-CMP-01, EF-CMP-03                                                  | `registry.test.ts` (34 règles), `lifecycle.test.ts` (dépréciation, migration en chaîne sur copies, diff), `runtime-root.test.ts` (avertissement une fois au démarrage).                                                                                                                                              |
| Contrôles négatifs (REC-10)                                           | `e2e-gate.test.ts` : une page qui ignore le projet fait échouer toutes les specs ; une page qui ignore seulement la fenêtre fait échouer exactement les specs de points de rupture ; une page qui a tout le balisage mais aucun comportement fait échouer les 12 specs d'interaction.                                |
| `pnpm verify` vert                                                    | 990 tests unitaires, 129 tests de gates, 138 tests E2E sur 3 navigateurs, 10 contrôles de la gate E2E (exécution du commit e836e69).                                                                                                                                                                                 |

### Ce que la revue et les E2E ont trouvé (et qui est corrigé)

- **Onglets (revue, majeur)** : les onglets écrivaient `role="tabpanel"` sur leurs enfants, et une pile, une grille ou une page utilisée comme panneau réécrivait `role="none"` à sa mise à jour. Chaque panneau est maintenant une `<div>` du shadow DOM, remplie par un slot nommé, avec `aria-controls` et `aria-labelledby` (l'accordéon aussi).
- **Retour de focus de la confirmation (E2E, WebKit)** : un bouton cliqué à la souris ne prend pas le focus dans Safari, donc le `<dialog>` n'avait rien à restaurer. La confirmation rend elle-même le focus à son bouton.
- **État perdu à chaque rendu (E2E)** : le Runtime donne de nouveaux objets de props à chaque rendu ; les onglets revenaient au premier, l'accordéon se refermait, une notification fermée réapparaissait. L'état n'est réinitialisé que si le manifeste demande autre chose.
- **Specs qui ne prouvaient rien** : « sans défilement horizontal » et `axe-core` passaient sur une page vide ; la spec exige maintenant que la page entière soit rendue, et asserte l'état avant d'auditer.
- **Capture trop tolérante** : à 2 %, un bouton masqué (0,4 % de la page) passait ; le seuil est de 0,1 %.
- **Contrastes** : les paires de texte `success`, `warning`, `danger` et `primary` sur `surface-alt` sont verrouillées dans le test.

### Écarts par rapport au dossier

1. **`propsSchema` est un `TObject`**, pas un `TSchema` quelconque, et le registre refuse ce que le § 7.3 laissait implicite (ADR-0034).
2. **Types du § 7.3 définis par moi** : `EventDefinition`, `SlotDefinition`, `BindingDefinition`, `Capability`, `ComponentMigration`, absents du dossier.
3. **Nouveau code d'erreur `COMPONENT_INVALID`** dans le catalogue du § 7.7 (« repris et complété »).
4. **Composants statiques** : pas de données ni de liaison avant le lot 8, pas d'événements consommés avant le lot 10 ; ils émettent des `CustomEvent` `acs-<événement>`.
5. **`axe-core` (MPL-2.0)** autorisé en dépendance de développement par l'ADR-0035, ce qui lève l'écart n° 2 du lot 0.
6. **Plugins** : spécifiés, validés, jamais chargés ; un plugin s'affiche comme un composant non disponible.

### Dette et points ouverts

- **Le kit de contrat ne joue aucune touche** : il vérifie que `keyboard` est déclaré et non vide pour un rôle interactif, pas que les touches déclarées fonctionnent. Le comportement clavier est couvert par les tests des composants (happy-dom) et par les E2E d'interaction (vrais navigateurs), composant par composant.
- **Captures non portables** : les neuf références portent le suffixe `win32` ; sur un autre système il faut les régénérer (`pnpm exec playwright test responsive --update-snapshots`). Aucune CI n'existe encore pour en produire.
- **Piège de focus de `<dialog>`** : sur WebKit, `Tab` depuis le dernier bouton d'une boîte modale sort vers l'interface du navigateur au lieu de boucler (Chromium et Firefox bouclent) ; la spécification l'autorise. Le test vérifie que le focus ne tombe jamais sur la page derrière.
- **`info.alert` a toujours `role="alert"`** : plusieurs alertes présentes à l'ouverture d'une page seront toutes annoncées. C'est un choix : la définition n'a qu'un rôle. À reprendre si un composant doit choisir `status` ou `alert` selon le ton.
- **Pas de recherche par frappe** dans le menu d'actions (non exigée).
- **Toujours ouverts depuis les lots précédents** : pas de contrôle des licences, osv-scanner jamais exécuté (avertissement), pas de CI, Node 26 non LTS, `pnpm --filter <paquet> test` échoue pour les paquets sans configuration Vitest locale.

### Erreurs reconnues

- **Timeout de worker Vitest, deuxième round** : mon correctif du lot 2 (découper le test de propriété en lots) ne suffisait pas, et son commentaire affirmait à tort qu'il rendait la main à la boucle d'événements. Le vrai remède est un `setTimeout(0)` après chaque lot ; ADR-0025 corrigé au lot 2, correctif `fcfdffd`.
- **Mutation laissée en place** : pendant l'étape 9, une commande de mutations s'est interrompue avant de restaurer `alert.ts`. Je l'ai vu en contrôlant `git status`, restauré, et les mutations passent depuis par un `try/finally`.
- **Espace insécable** : l'étape 8b a échoué au lint à cause d'un caractère brut produit par Prettier ; le caractère est construit à partir de son code.
- **Brief du reviewer inexact** : j'avais cité `packages/design-system` dans le diff du lot alors qu'il n'y a aucune modification.

### Revue indépendante (sous-agent `reviewer`)

Verdict : « lot à reprendre » pour un seul défaut majeur (onglets), aucun bloquant. Le sous-agent a exécuté `verify` et neuf mutations, toutes détectées, et confirmé qu'`unsafeStatic` et `unsafeCSS` sont employés de façon correcte et bornée.

- **Corrigés avec test** : M1, m1, m2 (panneaux), m5 (seuil des captures), m6 (contrastes, `axe-core` à 768 px et en sombre), m3 (E2E d'interaction dans les trois navigateurs).
- **Documentés** : m4 (ce que couvre le kit), m5 (régénération des captures), m7 (rôle de l'alerte).

## [0.2.0] — Lot 2 « Runtime shell » — 2026-10-02

Tag proposé : **`v0.2.0`** (non posé : à créer après validation du lot). Exigences : EF-NAV-01, EF-NAV-03 (partiel), EF-THM-01, EF-SEC-02.

### Ajouté

- **Pipeline de démarrage** (`apps/runtime/src/boot`, ADR-0033) : lecture de `project.json` et des fichiers qu'il nomme depuis `./project/` (un chemin hors du dossier n'est jamais lu), migration et validation (lot 1), contrôles de cohérence (page initiale, routes, thème par défaut), identité. Chaque échec est une `DomainError` qui nomme le fichier et le chemin JSON, affichée à l'écran.
- **Routeur par hash** (`router/`) : table de routes, paramètres typés (`string`, `integer`, `uuid`), segment littéral avant paramètre, première route déclarée en cas d'égalité, redirection de `#/` vers la page initiale, 404, refus propre d'un paramètre invalide. Un index qui contredit les fichiers de pages est refusé avec son chemin JSON.
- **Guards** : `role` évalué ; `expression` refusé par défaut jusqu'au moteur du lot 8 (fail-closed).
- **Identité** : port `IdentityProvider`, `UserContext`, `RoleKey`, `hasRole` dans `domain` ; adaptateur local (« Utilisateur local », aucun rôle par défaut).
- **Rendu et error boundaries** : chaque nœud est sa propre boundary (renderer qui lève, enfant absent, cycle, profondeur > 64) ; le shell affiche une référence plutôt qu'une page blanche si le démarrage ou le rendu échoue ; les props passent par des liaisons de texte Lit.
- **Thème du projet** : `themeCss` et `applyTheme` superposent les jetons du thème (communs, clair, sombre) aux jetons de base. Les valeurs qui peuvent sortir de leur déclaration ou charger une ressource sont refusées par le schéma et par `design-system`, avec un cas négatif par contrôle ; un test de `apps/runtime` garde les deux listes alignées.
- **Tests partagés** : `addPage`, `routingPage`, `routingIndex` dans `packages/testing`.
- **ADR** : 0033 ; ADR-0025 corrigé (cause du timeout de worker).

### Critères de sortie du lot 2

| Critère                                       | Preuve                                                                                                                                                                                                     |
| --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| La fixture minimale s'affiche (3 navigateurs) | `e2e/runtime.spec.ts` et `e2e/runtime-shell.spec.ts` sur Chromium, Firefox et WebKit (51 tests) ; `boot.test.ts` démarre les 3 fixtures valides et la v0 migrée.                                           |
| Un jeton modifié change le rendu              | `e2e/runtime-shell.spec.ts` : `color.surface` modifié en clair puis en sombre change la couleur de fond (valeurs exactes) ; `css.test.ts`. Mutation : ne plus appliquer le thème fait échouer ces 2 specs. |
| Liens profonds, 404, paramètres typés         | `match-route.test.ts` (dont 1 000 tirages), `route-table.test.ts`, specs E2E du shell.                                                                                                                     |
| Contrôle négatif (REC-10)                     | `e2e-gate.test.ts` : une page qui affiche le titre mais ignore le projet, le hash, les guards et le thème fait échouer les 9 specs du shell.                                                               |
| `pnpm verify` vert                            | 624 tests unitaires, 129 tests de gates, 51 tests E2E, 6 contrôles négatifs E2E.                                                                                                                           |

Mutations appliquées puis annulées : thème du projet non appliqué, guards ignorés (specs E2E visées en échec) ; guard `expression` laissé passer, contrôle de sortie du dossier retiré, boundary de nœud retirée, garde de cycle retiré, chaque contrôle de `themeCss` retiré un à un (tests visés en échec).

### Écarts par rapport au dossier

1. **DAD § 8.1 absent** : le pipeline de démarrage est défini par l'ADR-0033, pas transcrit. À confronter au DAD dès qu'il est disponible.
2. **EF-NAV-03 partiel** : la route et le paramètre sont ouverts ; l'ouverture d'un enregistrement et son refus propre s'il est absent attendent le Repository (lots 4 et 9).
3. **Redirections** : seule celle de la racine vers la page initiale ; le manifeste n'a pas de champ de redirection.
4. **Rendu provisoire** : `info.title@1` est rendu par un substitut, tout autre composant par un repère neutre ; le registre arrive au lot 3.
5. **Guards d'expression refusés** jusqu'au lot 8 ; en local, une page gardée par un rôle est refusée (aucun rôle par défaut) jusqu'au profil local du lot 11.
6. **Intégrité non vérifiée** (`integrity.json`) avant les lots 12 et 13.
7. **Jetons : liste noire, pas liste blanche.** Une fonction CSS de chargement inconnue ou future passerait. À étudier avant la 1.0.0 (ADR-0033).
8. **Poids** : bundle du Runtime de 291 899 octets (44 971 gzip) ; le budget du § 8.3 est contrôlé au lot 14.

### Dette et points ouverts

- **`pnpm --filter <paquet> test`** échoue pour tout paquet sans configuration Vitest locale (la configuration racine est résolue depuis le mauvais dossier). Corrigé pour `@acs/testing` ; les autres paquets se testent depuis la racine (`pnpm test`).
- **Un seul bouchon négatif E2E par suite** : aucune spec n'est éprouvée contre une implémentation partielle par la gate ; les mutations ci-dessus ont été faites à la main, pas automatisées (revue m1).
- **Toujours ouverts depuis le lot 0** : pas de contrôle des licences, osv-scanner jamais exécuté, pas de CI, `axe-core` absent (MPL-2.0), Node 26 non LTS (ADR-0032).

### Erreur reconnue

Au lot 1, j'avais attribué le timeout de worker de Vitest (« Timeout calling onTaskUpdate ») à la seule contention entre tests de gates et tests unitaires, et je l'avais déclaré réglé par la phase `test:gates`. Il est revenu. La cause première est un test de propriété de 1 000 documents d'un seul bloc ; il est découpé en lots de 100 (totaux inchangés) et l'ADR-0025 est corrigé.

### Revue indépendante (sous-agent `reviewer`)

Verdict : lot acceptable sous réserve de M1 et M2, aucun bloquant. Le sous-agent a cette fois exécuté `pnpm verify` et des mutations.

- **Corrigés avec test** : M1 (contrôles de `themeCss` non prouvés : un cas négatif par contrôle, chacun confirmé par mutation), M2 (`/*` et fonctions de chargement ; écart 7 consigné), m2 (règle de la première route déclarée, documentée et testée), m5 (ordre identité et thème aligné dans l'ADR, poids mesuré, `MINIMAL_TITLE` lié à la fixture par un test).
- **Corrigé sans test dédié** : m3 (cette entrée), m4 (ADR-0025 committé à part).
- **Accepté** : m1 (un seul bouchon négatif E2E par suite, voir la dette).

## [0.1.0] — Lot 1 « Modèle de projet » — 2026-10-02

Tag proposé : **`v0.1.0`** (non posé : à créer après validation du lot). Exigences : ET-FMT-01, ET-FMT-02, EF-SEC-04.

### Ajouté

- **Schémas du paquet projet v1** (`packages/project-schema`) : TypeBox, compilés par Ajv en mode _standalone_ au build (`pnpm generate`, sorties dans `generated/`, non versionnées) ; aucun `import`, `require`, `new Function` ni `eval` dans le code généré (contrôlé par `forbiddenConstructs`, avec un contrôle négatif par motif). 39 validateurs, environ 288 Ko bruts (environ 25 Ko gzip).
- **Validation** : `validate(nom, donnée)` et `validateFiles(paquet)` renvoient un `Result` ; l'erreur `MANIFEST_INVALID` porte la liste des problèmes avec le fichier, le mot-clé et le chemin JSON Pointer (échappement `~0`/`~1`).
- **Migration** : `detectManifestVersion` (version absente = 0), `migratePackage`, `openPackage`, chaîne `MIGRATIONS` ; v0 → v1 pure, sans partage de données avec l'entrée, qui refuse les identifiants dupliqués. Une étape qui n'avance pas la version échoue.
- **`domain`** : générateur UUID v7 monotone (horloge et aléa injectables), `UUID_V7_PATTERN`, `isUuidV7`, `asId`, codes `MANIFEST_INVALID` et `MANIFEST_UNSUPPORTED`.
- **`packages/testing`** : fixtures déterministes (minimale, de référence, complète), format v0 historique avec le v1 attendu écrit à la main, 43 fixtures corrompues avec le chemin d'erreur exact attendu, `consistencyProblems` pour les références entre fichiers, test de propriété de la migration (1 000 documents), empreinte SHA-256 de chaque fixture de référence.
- **Garde-fou thème** : `THEME_TOKEN_VALUE_PATTERN` refuse toute valeur de jeton capable d'injecter du CSS.
- **Seuils de couverture** : les fichiers de migration sont tenus à 90 % de lignes et 85 % de branches (§ 9.4).
- **ADR** : 0027 à 0032.

### Critères de sortie du lot 1

| Critère                                          | Preuve                                                                                                                                                                                                      |
| ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Fixtures valides acceptées                       | `packages/testing/src/fixtures.test.ts` (minimale, de référence, complète) ; `consistency.test.ts`.                                                                                                         |
| Fixtures corrompues rejetées avec le chemin JSON | `packages/testing/src/corrupted.test.ts` : 43 cas, chacun avec `fichier mot-clé /chemin` exact.                                                                                                             |
| Migration v0 → v1 testée                         | `migration.test.ts` (fixture historique contre le v1 écrit à la main), `migration-property.test.ts` (1 000 documents : v1 valide et cohérent, entrée intacte, déterminisme), `migrations/v0-to-v1.test.ts`. |
| Fixtures de référence non modifiées              | `fixture-digests.test.ts`, avec un contrôle que l'empreinte mesure le contenu.                                                                                                                              |
| `pnpm verify` vert                               | Trois exécutions consécutives vertes : 419 tests unitaires, 129 tests de gates, 24 tests E2E, 4 contrôles négatifs E2E ; seuils de couverture respectés.                                                    |

### Changement d'outillage

- **Node 26** remplace Node 24 (ADR-0032). Node 26 est une version _Current_, pas LTS : écart assumé à la demande de l'utilisateur, et l'IT l'a installé de son côté en cours de lot.
- **Phase `pnpm test:gates`** : un échec intermittent (« Timeout calling onTaskUpdate ») est apparu pendant le passage à Node 26. Cause : les tests de gates lancent ESLint, dependency-cruiser et Playwright et saturent le processeur des workers des tests unitaires. Une comparaison A/B montre qu'elle ne dépend pas de Node. Les gates ont donc leur propre phase de `verify` (ADR-0025), et `verify-gate.test.ts` exige les quatre phases de test.
- `packages/testing` a sa propre configuration Vitest : sans elle, `pnpm --filter @acs/testing test` échouait (la configuration racine était résolue depuis le mauvais dossier).

### Écarts et points ouverts

1. **ADR-0028 et CLAUDE.md** : la règle « tout changement de format du manifeste = migration + fixture de l'ancien format » est appliquée à partir de la 1.0.0 ; avant, la politique de l'ADR-0028 s'applique. CLAUDE.md n'a pas été modifié : à l'utilisateur de décider s'il y transcrit cette politique.
2. **Secrets dans les charges ouvertes** : les secrets placés dans `props`, `bindings`, `events`, `params` et valeurs par défaut ne sont pas détectés (EF-SEC-04 n'est couvert que pour les champs typés). Le trou est figé par `open-payloads.test.ts` ; le balayage en profondeur est prévu aux lots 12 et 13 (ADR-0028).
3. **Format v0 synthétique** : aucun format v0 réel n'existe ; la migration est démontrée sur un v0 que j'ai défini (ADR-0031). À remplacer par un vrai v0 s'il en existe un.
4. **Toujours ouverts depuis le lot 0** : pas de contrôle automatique des licences, osv-scanner jamais exécuté (avertissement en local), pas de CI, `axe-core` non installé (MPL-2.0).
5. **Node 26 non LTS** (voir ci-dessus).

### Revue indépendante (sous-agent `reviewer`)

Le sous-agent n'avait que des outils de lecture : il n'a ni lancé `pnpm verify` ni appliqué de mutation, et ses prédictions ont été vérifiées par moi. Constats traités : M1, m1 à m5, m6 (empreintes des fixtures), m7 (test autonome de `@acs/testing`).

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
