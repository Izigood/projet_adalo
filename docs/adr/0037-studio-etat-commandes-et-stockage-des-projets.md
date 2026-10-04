# ADR-0037 — Studio : état, commandes et stockage des projets

- **Statut** : acceptée (complétée au fil du lot 5)
- **Date** : 2026-10-04
- **Source** : dossier § 7.2, § 9.2, § 10.1 (lot 5), EF-PRJ-01, EF-PRJ-02, EF-UI-06, RG-13, REC-02 ; décision D-01 ; ADR-0011, ADR-0019, ADR-0023, ADR-0036

## Contexte

Le lot 5 demande un Studio dont toute modification passe par un bus de commandes annulables, un store normalisé, une sauvegarde automatique et un catalogue de projets. Trois points ne sont pas tranchés par le dossier :

- **ARC-STU-01 à 03 et la section 8.1 du cahier des charges (les 5 zones) ne sont pas dans le dépôt** : le dossier ne les cite que par leur identifiant.
- **Où vit un projet.** Dexie est confiné à `data-repository` (règle `dexie-only-in-data-repository`) et `localStorage` est réservé aux préférences d'interface (`CLAUDE.md`). Le Studio ne peut donc écrire ses projets ni dans l'un ni dans l'autre directement.
- **Ce que livre ce lot comme commandes.** Le schéma (lot 6) et le canvas (lot 7) n'existent pas encore, alors que EF-UI-06 vise « toutes les commandes de conception ».

## Décision

**Lecture de ARC-STU-01 à 03** (hypothèse écrite, à corriger si le texte du cahier des charges la contredit) : ARC-STU-01, état normalisé ; ARC-STU-02, commandes annulables ; ARC-STU-03, événements et sauvegarde automatique (§ 7.2 : les `EVT-*` sont consommés par le validateur et l'autosave). **Les cinq zones** : barre supérieure, navigation et catalogue à gauche, zone centrale de travail, inspecteur à droite, panneau inférieur (validation et historique).

**Port `ProjectStore`** dans `packages/domain` (`project-store.ts`), sans dépendance, comme le Repository : catalogue (`list`), projet (`load`, `create`, `save` avec verrou de révision), états `active`, `archived`, `trashed` (`setStatus`), purge de la corbeille (`purgeTrash`) et brouillon de récupération (`saveDraft`, `loadDraft`, `discardDraft`). Les erreurs sont des `Result` avec les codes existants : clé déjà prise `CONSTRAINT_VIOLATION`, révision périmée `VERSION_CONFLICT`, pas d'IndexedDB `STORAGE_UNAVAILABLE`. Aucun code n'est ajouté au catalogue du § 7.7. L'horloge est un paramètre (`at`) pour que la corbeille soit testable. Le résumé du catalogue (`CatalogSummary`) est fourni par l'appelant avec les fichiers ; le Studio le calcule d'un seul endroit à partir de l'état pour qu'il ne dérive pas.

**Corbeille** : 30 jours (`TRASH_RETENTION_DAYS`), un projet est purgé quand `at − trashedAt ≥ 30 jours` (`isPastTrashRetention`). La purge se fait à l'ouverture du catalogue, sans tâche de fond.

**Adaptateur** : il sera écrit dans `packages/data-repository` (module `studio-store`, base IndexedDB `acs-studio`), avec une version en mémoire pour les tests. Cela touche un paquet du lot 4 sans changer ses règles de dépendance : `apps/studio` peut déjà importer `data-repository` (§ 9.2).

**Dépendances** : `zustand` 5 (MIT) et `immer` 11 (MIT) dans `apps/studio`. `react-aria-components` et `dnd-kit` ne sont pas utilisés au lot 5 (éléments HTML natifs accessibles) ; ils entrent au lot 7.

**Commandes livrées** : métadonnées du projet (`CMD-PROJECT-UPDATE`) et pages (`CMD-PAGE-ADD`, `-RENAME`, `-REMOVE`, `-MOVE`). Le critère de sortie (200 modifications) est joué avec elles ; les commandes de schéma et de canvas viennent aux lots 6 et 7. **Historique** : 500 commandes au plus (le minimum exigé est 200) ; il n'est pas conservé au rechargement, seul l'état l'est.

**Duplication** : nouveaux identifiants pour tout le paquet, nouvelle clé (suffixe numérique, RG-11) et nom suffixé « (copie) ».

**État normalisé** (étape 2, `apps/studio/src/project/`) : `ProjectState` range chaque famille d'objets (entités, relations, rôles, requêtes, pages, thèmes, workflows) en `{ byId, order }`, plus les métadonnées, les routes, la page initiale et les menus du fichier d'index. Les fichiers que le Studio n'édite pas (médias, données de test, README) sont gardés tels quels dans `extraFiles`. `fromFiles` valide le paquet avec `validateFiles` puis lit ; il refuse un `project.json` qui nomme un fichier absent. `toFiles(fromFiles(fichiers))` redonne les mêmes fichiers : le test le tient pour les huit fixtures valides, sinon enregistrer changerait le projet. Les chemins de thèmes et de workflows sont recalculés (`themes/{id}.json`), seuls les quatre chemins d'entrée de `project.json` sont conservés. Une page absente de la liste des routes est gardée, après les autres, triée par identifiant.

**Création** (EF-PRJ-01) : `createProject` assemble un paquet (métadonnées, thème par défaut fait des jetons du système de design, une page `home` avec un titre) et le fait passer par `fromFiles`, donc par les mêmes schémas qu'un paquet importé : une clé, un nom ou une langue invalides donnent un `MANIFEST_INVALID` avec le fichier et le pointeur JSON du champ fautif. Le Studio n'importe pas `packages/testing` dans son code : le paquet de départ est écrit dans le Studio.

**Store** : un store Zustand (vanilla) coupé en deux côtés. `ProjectView` (`getState`, `subscribe`) est tout ce qu'un composant reçoit ; `ProjectWriter` (`replace`, `close`) n'ira qu'au bus de commandes (étape 3). `replace` fige le projet en profondeur (`freeze` d'Immer) : une modification en place lève une erreur.

**Bus de commandes** (étape 3, `apps/studio/src/commands/`) : une commande est `{ type, payload, label }` (§ 7.2) ; son gestionnaire reçoit un brouillon Immer du projet et ne renvoie rien, ou l'erreur qui l'empêche (alors rien n'est gardé). Le bus exécute avec `produceWithPatches`, garde les patchs et leur inverse, et `undo` applique l'inverse : aucune commande n'écrit de `undo` (REC-02). Une commande qui ne change rien n'entre pas dans l'historique. L'historique garde 500 commandes (`HISTORY_LIMIT`), efface ce qu'on peut rétablir à chaque nouvelle commande, et repart de zéro quand un projet est chargé ou fermé. Le bus ne se construit qu'avec le côté écriture du store.

**Événement** : `EVT-PROJECT-CHANGED` avec sa cause (`loaded`, `command`, `undo`, `redo`, `closed`) est émis une fois le projet et l'historique à jour ; l'autosave (étape 5) et le validateur incrémental l'écouteront. `EVT-PROJECT-SAVED` viendra avec l'autosave. Un écouteur qui lève une erreur arrête les suivants pour cet événement, sans défaire le changement.

**Un projet peut devenir invalide** : une commande n'applique pas les schémas (une clé de page mal formée est acceptée) ; c'est la validation structurelle de l'autosave (RG-13) qui décide d'écrire le projet ou de garder un brouillon de récupération. Les commandes refusent en revanche ce qui n'a pas de sens (identifiant inconnu, doublon de clé).

## Conséquences

- Le Studio ne dépend pas d'IndexedDB : il parle au port, et les tests unitaires utilisent la version en mémoire.
- Le lot 6 ajoute ses commandes au même bus sans rien changer au port.
- Les étapes suivantes complètent cet ADR (état, bus, autosave, catalogue, interface, E2E).
