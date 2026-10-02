# ADR-0033 — Pipeline de démarrage du Runtime

- **Statut** : acceptée (provisoire sur le pipeline : à confronter au DAD § 8.1 dès qu'il est disponible)
- **Date** : 2026-10-02
- **Source** : dossier § 10.1 (lot 2), § 4.2 (EF-NAV-01, EF-NAV-03, EF-THM-01, EF-SEC-02), § 5.1, § 7.4, § 7.7

## Contexte

Le lot 2 demande un « pipeline de démarrage (DAD § 8.1) ». Le DAD n'est pas dans le dépôt : les étapes ci-dessous sont définies ici, pas transcrites. Le Runtime ne peut dépendre ni de `packages/testing` ni d'un Studio : il lit un paquet projet servi à côté de lui.

## Décision

**Étapes du démarrage**, dans cet ordre ; chaque échec arrête le démarrage et affiche un écran d'erreur portant le code `DomainError` et, pour un manifeste invalide, le chemin JSON (jamais de page blanche) :

1. Récupérer `project.json`, puis les fichiers listés dans `entries`.
2. Détecter la version du manifeste et migrer (`openPackage`, ADR-0031).
3. Valider chaque fichier (`validateFiles`, ADR-0030).
4. Contrôles de cohérence minimaux : `initialPageId` existe, chaque route de l'index désigne une page existante, `defaultThemeId` désigne un thème fourni. Le validateur complet est au lot 13.
5. Appliquer le thème du projet (jetons du thème par-dessus les jetons de base, clair et sombre).
6. Interroger `IdentityProvider.current()`.
7. Démarrer le routeur par hash, puis rendre la page.

**Emplacement du paquet** : le Runtime le charge depuis `./project/` (même disposition que la release publiée au lot 13, § 8.2). Les tests E2E servent une fixture à cette adresse par interception réseau : aucune fixture n'entre dans le build de production.

**Navigation** (EF-NAV-01, EF-NAV-03)

- `#/` ou un hash vide redirige (remplacement d'historique) vers la route de la page initiale. C'est la seule redirection : le manifeste n'a pas de champ de redirection, et n'en reçoit pas.
- À correspondance égale, un segment littéral l'emporte sur un paramètre. Une route inconnue affiche la page 404.
- Les paramètres sont typés (`string`, `integer`, `uuid`) ; un paramètre invalide est refusé proprement, comme une route inconnue.
- **Écart** : le « refus propre si l'enregistrement est absent » (EF-NAV-03) suppose des données ; il est reporté aux lots 4 et 9.

**Guards** : un guard `role` passe si l'utilisateur détient le rôle. Un guard `expression` est **refusé par défaut** (fail-closed, message explicite) jusqu'au moteur d'expressions du lot 8. Une page refusée affiche « accès refusé » et ne rend pas son contenu.

**Identité** (EF-SEC-02) : le port `IdentityProvider` et `UserContext` (§ 7.4) vivent dans `domain`. L'adaptateur local est dans `apps/runtime` : nom « Utilisateur local », rôles fournis à la construction, **vides par défaut**. Une page gardée par un rôle est donc refusée en local tant que le lot 11 n'a pas de profil local.

**Rendu provisoire** : le registre de composants est au lot 3. Le lot 2 rend `info.title@1` par un rendu minimal et marqué provisoire ; tout autre composant s'affiche comme un repère neutre portant sa référence. Une exception levée par un nœud est contenue par une error boundary : le reste de la page reste affiché.

**Jetons** : `design-system` applique ce qu'il reçoit ; il ne peut pas importer `project-schema`. La validation du motif des valeurs (`THEME_TOKEN_VALUE_PATTERN`) a donc toujours lieu avant, à l'étape 3 : le pipeline n'appelle jamais l'application du thème sur un paquet non validé.

## Conséquences

- L'intégrité (`integrity.json`) n'est pas vérifiée avant les lots 12 et 13.
- Les décisions de rendu et de guard ci-dessus sont des substituts : le lot 3 remplace le rendu provisoire, le lot 8 les guards d'expression, le lot 11 le profil local.
- Le poids des validateurs dans le bundle du Runtime est mesuré à l'étape 5 du lot 2 ; le budget du § 8.3 n'est contrôlé qu'au lot 14.
