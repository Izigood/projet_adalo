# ADR-0031 — Chaîne de migration du manifeste et format v0

- **Statut** : acceptée
- **Date** : 2026-10-02
- **Source** : dossier § 6.5 ; `packages/project-schema/src/migrations*`

## Contexte

Le lot 1 exige une chaîne de migration de manifeste et sa preuve « migration v0 vers v1 testée ». Le dossier ne décrit pas v0.

## Décision

- **Mécanisme** : une suite de fonctions pures `migrate_v{n}_to_v{n+1}`. La version d'un paquet est le `manifestVersion` de son `project.json`, **0 s'il est absent** ; une valeur inutilisable est refusée (`MANIFEST_INVALID`). Conséquence assumée : un paquet v1 dont `manifestVersion` a été supprimé est pris pour un v0 et rejeté avec les erreurs de ce format (`required /project/code`...). Un paquet à la version courante est rendu tel quel (migration idempotente) ; un paquet plus récent est **refusé** (`MANIFEST_UNSUPPORTED`) ; une étape manquante dans la chaîne aussi. Une étape ne modifie jamais son entrée, et une étape qui n'avance pas la version est un bug : l'enchaînement lève une exception. `openPackage` migre puis valide tous les fichiers.
- **Format v0** (synthétique, défini faute de format historique réel) : un seul `project.json` sans `manifestVersion`, contenant `project` (`code`, `title`, `lang`, `version`), `entities` (`name`, `title`, champs aux types historiques `string longtext number bool date link`), `relations` (`kind`), `screens` (arbre imbriqué) et `theme` (`colors`, `dark`). Les identifiants y sont du texte libre.
- **Migration v0 vers v1** : renomme les propriétés, convertit les types, remplace chaque identifiant par un UUID v7 en propageant les références, aplatit l'arbre des écrans en carte de nœuds, éclate le document dans la disposition v1 et applique les valeurs par défaut (`interne`, `local`, `restrict`, version minimale du Runtime `1.0.0`, listes vides). Les identifiants sont demandés à un fournisseur injectable avec une **indication** (`entity:e1`, `field:e1.f2`, `node:s1/0`) : le fournisseur par défaut l'ignore, les tests l'utilisent pour obtenir des identifiants stables. Les défauts du document v0 sont signalés avec des chemins **dans le document v0**.
- **Fixture de l'ancien format** : `packages/testing/src/fixtures/legacy-v0.ts`, accompagnée du v1 attendu **écrit à la main** (et non calculé par la migration). Elle ne sera jamais mise à jour.

## Conséquences

- Tout nouveau changement de format après la 1.0.0 ajoute une étape et conserve la fixture de l'ancien format (ADR-0028).
- Une migration ne valide pas son résultat ; c'est le rôle d'`openPackage`. Les erreurs de validation d'un paquet migré sont donc exprimées en termes du format v1.
- v0 étant synthétique, si un format historique réel existe, il faudra ajouter ou remplacer cette étape.
