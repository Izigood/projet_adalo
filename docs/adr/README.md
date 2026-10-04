# Décisions d'architecture (ADR)

Une décision d'architecture = un fichier `NNNN-titre.md` (dossier § 9.3). Ne jamais contredire un ADR sans en écrire un nouveau.

- **0001 à 0010** : transcription du DAD. Seuls 0001 et 0002 sont décrits par le dossier ; **0003 à 0010 sont des emplacements réservés**, le DAD n'étant pas disponible lors du lot 0.
- **0011 à 0022** : décisions D-01 à D-12 du dossier (§ 3).
- **0023 à 0026** : choix faits pendant le lot 0.
- **0027 à 0032** : choix faits pendant le lot 1.

| ADR                                                                  | Titre                                                                          | Statut                                                       |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------ | ------------------------------------------------------------ |
| [0001](0001-aucun-code-genere-par-ecran.md)                          | Aucun code généré par écran                                                    | acceptée (transcription minimale, à compléter depuis le DAD) |
| [0002](0002-composants-runtime-en-web-components-lit.md)             | Composants du Runtime en Web Components (Lit 3)                                | acceptée (transcription minimale, à compléter depuis le DAD) |
| [0003](0003-a-transcrire-depuis-le-dad.md)                           | À transcrire depuis le DAD                                                     | à compléter (emplacement réservé)                            |
| [0004](0004-a-transcrire-depuis-le-dad.md)                           | À transcrire depuis le DAD                                                     | à compléter (emplacement réservé)                            |
| [0005](0005-a-transcrire-depuis-le-dad.md)                           | À transcrire depuis le DAD                                                     | à compléter (emplacement réservé)                            |
| [0006](0006-a-transcrire-depuis-le-dad.md)                           | À transcrire depuis le DAD                                                     | à compléter (emplacement réservé)                            |
| [0007](0007-a-transcrire-depuis-le-dad.md)                           | À transcrire depuis le DAD                                                     | à compléter (emplacement réservé)                            |
| [0008](0008-a-transcrire-depuis-le-dad.md)                           | À transcrire depuis le DAD                                                     | à compléter (emplacement réservé)                            |
| [0009](0009-a-transcrire-depuis-le-dad.md)                           | À transcrire depuis le DAD                                                     | à compléter (emplacement réservé)                            |
| [0010](0010-a-transcrire-depuis-le-dad.md)                           | À transcrire depuis le DAD                                                     | à compléter (emplacement réservé)                            |
| [0011](0011-framework-du-studio-react-19.md)                         | Framework du Studio : React 19                                                 | Acceptée (confirmée par l'utilisateur au lot 0)              |
| [0012](0012-disposition-des-ecrans-en-flux.md)                       | Disposition des écrans : modèle en flux                                        | Acceptée (recommandation du dossier)                         |
| [0013](0013-partage-local-strict-au-mvp.md)                          | Partage des données : local strict au MVP                                      | Validée (2 octobre 2026), définitive pour le MVP             |
| [0014](0014-moteur-d-expressions-jsep.md)                            | Moteur d'expressions : jsep et interpréteur maison                             | Acceptée (recommandation du dossier)                         |
| [0015](0015-pas-de-plugins-tiers-au-mvp.md)                          | Plugins tiers : aucun au MVP                                                   | Acceptée (recommandation du dossier)                         |
| [0016](0016-hebergement-de-la-pwa-publiee.md)                        | Hébergement de la PWA publiée : serveur statique HTTPS                         | Acceptée (recommandation du dossier)                         |
| [0017](0017-decimaux-en-chaine-canonique-et-big-js.md)               | Décimaux : chaîne canonique et big.js                                          | Acceptée (recommandation du dossier)                         |
| [0018](0018-graphe-de-workflows-avec-xyflow.md)                      | Graphe de l'éditeur de workflows : @xyflow/react                               | Acceptée (recommandation du dossier)                         |
| [0019](0019-dexie-pour-indexeddb.md)                                 | Bibliothèque IndexedDB : Dexie.js                                              | Acceptée (recommandation du dossier)                         |
| [0020](0020-classification-des-champs-et-chiffrement-au-lot-14.md)   | Chiffrement des données locales : classification au MVP, chiffrement au lot 14 | Acceptée (recommandation du dossier)                         |
| [0021](0021-matrice-des-navigateurs.md)                              | Matrice des navigateurs                                                        | Acceptée (recommandation du dossier)                         |
| [0022](0022-nom-licence-et-diffusion.md)                             | Nom, licence et diffusion                                                      | Acceptée (recommandation du dossier)                         |
| [0023](0023-lecture-du-tableau-des-dependances-9-2.md)               | Lecture du tableau des dépendances autorisées (§ 9.2)                          | acceptée                                                     |
| [0024](0024-interdits-eslint-et-exceptions.md)                       | Interdits ESLint : règles, exceptions et limites                               | acceptée                                                     |
| [0025](0025-chaine-de-qualification-pnpm-verify.md)                  | Chaîne de qualification `pnpm verify`                                          | acceptée                                                     |
| [0026](0026-injection-des-jetons-par-feuille-de-style-construite.md) | Injection des jetons de design par feuille de style construite                 | acceptée                                                     |
| [0027](0027-validateurs-ajv-standalone-generes-au-build.md)          | Validateurs Ajv standalone générés au build                                    | acceptée                                                     |
| [0028](0028-formes-du-manifeste-v1-et-politique-avant-la-1-0-0.md)   | Formes du manifeste v1 et politique avant la 1.0.0                             | acceptée (déroge à la lettre de CLAUDE.md)                   |
| [0029](0029-identifiants-uuid-v7-et-cles-lisibles.md)                | Identifiants UUID v7 et clés lisibles                                          | acceptée                                                     |
| [0030](0030-erreurs-de-manifeste-et-chemins-json.md)                 | Erreurs de manifeste et chemins JSON                                           | acceptée                                                     |
| [0031](0031-chaine-de-migration-du-manifeste.md)                     | Chaîne de migration du manifeste et format v0                                  | acceptée                                                     |
| [0032](0032-nodejs-26-comme-version-cible.md)                        | Node.js 26 comme version cible                                                 | acceptée (écart : Current, pas encore LTS)                   |
| [0033](0033-pipeline-de-demarrage-du-runtime.md)                     | Pipeline de démarrage du Runtime                                               | acceptée (pipeline provisoire : DAD § 8.1 absent)            |
| [0034](0034-contrat-de-composant-et-registre.md)                     | Contrat de composant, registre et plugins non chargés                          | acceptée                                                     |
| [0035](0035-axe-core-en-dependance-de-test.md)                       | axe-core en dépendance de test (MPL-2.0)                                       | acceptée (lève l'écart n° 2 du lot 0)                        |
| [0036](0036-donnees-locales-repository-et-stockage.md)               | Données locales : port Repository, stockage et relations                       | acceptée (complétée au fil du lot 4)                         |
| [0037](0037-studio-etat-commandes-et-stockage-des-projets.md)        | Studio : état, commandes et stockage des projets                               | acceptée (complétée au fil du lot 5)                         |
