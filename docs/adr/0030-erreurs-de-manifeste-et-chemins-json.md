# ADR-0030 — Erreurs de manifeste et chemins JSON

- **Statut** : acceptée
- **Date** : 2026-10-02
- **Source** : dossier § 6.5, § 7.7 ; `packages/domain`, `packages/project-schema`

## Contexte

Le critère de sortie du lot 1 demande des fixtures corrompues « rejetées avec le chemin JSON de l'erreur ». Le catalogue d'erreurs du § 7.7 n'avait pas de code pour un manifeste invalide, et `MANIFEST_UNSUPPORTED` n'apparaît qu'au § 6.5.

## Décision

- Deux codes sont ajoutés au catalogue de `domain` : `MANIFEST_INVALID` (le document ne respecte pas le schéma) et `MANIFEST_UNSUPPORTED` (version de format plus récente que le code, ou aucune migration disponible).
- Le chemin d'une erreur est un **JSON Pointer** (RFC 6901), la racine s'écrivant `/`. Pour une propriété manquante ou inattendue, le chemin désigne **la propriété elle-même** (`/entities/0/fields/1/key`) et non son parent, ce qu'Ajv rapporte autrement. Les `/` et `~` d'un nom de propriété sont échappés (`~1`, `~0`).
- Une erreur de validation porte `details: { issues: [{ file?, path, keyword, message, params }] }` ; la validation d'un paquet ajoute le fichier (`file`) et la liste des fichiers sans schéma (`skipped`). Toutes les erreurs d'un document sont rapportées d'un coup, pas seulement la première. Les messages (`message`) sont ceux d'Ajv, en anglais : la traduction française passera par le mot-clé et les paramètres, au lot 5.
- Un `MANIFEST_UNSUPPORTED` indique `{ found, supported }`.
- Un paquet sans `project.json` est signalé par un problème de mot-clé `missing-file`.

## Conséquences

- Un document dont plusieurs propriétés sont fausses produit plusieurs problèmes au même endroit possible (une valeur d'énumération invalide donne un seul problème `enum` ; un `anyOf` en donnerait un par branche, d'où l'usage de `enum` et de `discriminator`).
- La vérification de la sécurité de l'import (SEC-01 : taille, chemins, empreintes) reste au lot 12 : ici, les chemins du manifeste (`entries`) sont seulement contrôlés par un motif.
