# ADR-0034 — Contrat de composant, registre et plugins non chargés

- **Statut** : acceptée
- **Date** : 2026-10-02
- **Source** : dossier § 7.3, § 4.2 (EF-CMP-01, EF-CMP-03, EF-UI-04), § 4.5, § 8.1 (CSP), § 8.4, § 9.2 ; décisions D-02, D-05 ; ADR-0015, ADR-0028

## Contexte

Le § 7.3 donne `ComponentDefinition` mais cite cinq types qu'aucune section ne définit (`EventDefinition`, `SlotDefinition`, `BindingDefinition`, `Capability`, `ComponentMigration`). Le « manifeste de plugin » du lot 3 n'est défini nulle part. Le lot 3 livre le registre, le kit de contrat et les 23 composants des familles structure, navigation, information et actions.

## Décision

**Types complétés** (dans `component-sdk`)

- `Capability` : `data.read`, `data.write`, `files.read`, `files.write`. Refusées par défaut ; les composants du lot 3 n'en déclarent aucune.
- `EventDefinition` : `{ name, description, payload? }` ; `name` en camelCase. L'événement est émis comme `CustomEvent` nommé `acs-<name>`, qui traverse le shadow DOM (`bubbles`, `composed`). Le Runtime ne les consomme qu'au lot 10.
- `SlotDefinition` : `{ name, accepts?, max? }` ; `accepts` liste des identifiants ou des catégories de composants.
- `BindingDefinition` : `{ prop, kind: 'value' | 'collection' | 'record' }`. Les liaisons sont évaluées au lot 8 ; au lot 3 les props sont statiques.
- `ComponentMigration` : `{ from, to, description, migrate(props) }`, fonction pure d'une version majeure à la suivante.
- `propsSchema` est un objet TypeBox (`TObject`), non un `TSchema` quelconque : l'inspecteur du lot 7 génère son formulaire à partir de ses propriétés.

**Identité** : l'identifiant est `famille.nom` (`structure.stack`), la famille étant la catégorie ; la référence du manifeste est `id@majeure` (`structure.stack@1`). La majeure vient de `version` (SemVer). Plusieurs majeures d'un même identifiant peuvent coexister (la précédente étant dépréciée). La balise est `acs-<famille>-<nom-en-kebab>` pour la majeure 1, et `acs-<famille>-<nom-en-kebab>-v<majeure>` à partir de la majeure 2 : deux majeures qui coexistent ne peuvent pas définir le même élément personnalisé.

**Validation à l'enregistrement** (EF-CMP-01) : un identifiant, une version, une balise, un schéma de props, des événements, des capacités, des métadonnées d'accessibilité ou des surcharges responsives invalides refusent l'enregistrement par une erreur `COMPONENT_INVALID` (code ajouté au catalogue du § 7.7, qui est « repris et complété ») qui nomme la définition et la propriété fautives. Un doublon d'identifiant et de majeure est refusé.

**Accessibilité** : `nameFrom` vaut `content` (le texte du composant) ou `prop:<nom>` (une propriété requise). Un composant dont le rôle est interactif doit déclarer au moins une touche clavier. Le kit de contrat ne se contente pas de la présence des champs : il refuse les valeurs vides et vérifie le DOM rendu (le rôle déclaré est présent, le nom accessible existe).

**Rendu et CSP** (§ 8.1, `style-src 'self'`) : un composant ne pose aucun attribut `style` ni gestionnaire d'événement en ligne ; il se style par feuilles construites (jetons de design) et par attributs d'hôte. Le kit le vérifie sur le DOM rendu.

**Props** : validées au rendu par `Value` de TypeBox (interprété, sans génération de code, donc compatible avec l'interdit sur `new Function`). Les valeurs par défaut du schéma sont appliquées. Des props invalides donnent un repère d'erreur sur le nœud (error boundary du lot 2), jamais un plantage.

**Points de rupture** (EF-UI-04) : mobile en dessous de 600 px, tablette de 600 à 1023 px, bureau à partir de 1024 px. `responsive.<point>` du nœud surcharge ses props, pour les seules propriétés que la définition déclare dans `responsive` ; les autres clés sont ignorées.

**Dépréciation et migration** (EF-CMP-03) : `deprecated: { since, replacement? }` est détecté par une fonction pure (réutilisable par le validateur du lot 13) et signalé par un avertissement en console côté Runtime. La migration est une fonction pure qui renvoie les nouvelles props et un diff ; la commande annulable qui l'applique relève du Studio (lots 5 et 7).

**Plugins** (D-05, ADR-0015) : le schéma `PluginManifest` (dans `project-schema`) est spécifié et validé, mais aucun code ne charge un plugin. Une référence à un composant de plugin s'affiche comme un composant non disponible, et le démarrage ne demande aucun fichier de plugin.

**Textes** : les libellés visibles des composants et les noms de la palette sont dans `packages/components/src/locales/fr.json` (ENF-10).

**Captures de référence** : la spec responsive du lot 3 enregistre des captures à 360, 768 et 1280 px sur les trois navigateurs, avec le suffixe de plateforme de Playwright. Elles dépendent du système et des polices ; une CI sur une autre plateforme produira ses propres références. Les assertions de structure (colonnes de la grille, absence de défilement horizontal) sont portables et restent le garde-fou principal.

**Rendu par le Runtime** (étape 10 du lot 3) : chaque nœud est dessiné par l'élément de son composant, avec les props du point de rupture courant (surcharges permises) validées par `validateProps` ; des props invalides font échouer le nœud, que sa boundary transforme en repère. Le nom de l'élément est la seule valeur mise dans un gabarit comme texte (`unsafeStatic` de `lit/static-html.js`, qui garde les éléments dans le DOM d'un rendu à l'autre, donc l'état d'un composant) : il vient d'une définition que le registre a validée, et le Runtime le contrôle encore par une expression stricte avant de l'utiliser. Le point de rupture suit la fenêtre par `matchMedia`, aux seuils de 600 et 1024 px. Les dépréciations sont signalées une fois au démarrage.

**Précisions de fin de lot** (revue du lot 3 et E2E)

- **Ce que mesure le kit de contrat** : la définition, puis l'élément rendu (rôle présent, nom accessible, focalisable pour un rôle interactif, ni `style` ni gestionnaire en ligne). Il ne joue **aucune touche** : `accessibility.keyboard` est vérifié comme déclaré et non vide pour un rôle interactif, pas comme fonctionnel. Le comportement clavier de chaque composant est prouvé par ses propres tests (happy-dom) et par les E2E d'interaction dans les trois navigateurs.
- **Panneaux** : un composant à panneaux (onglets, accordéon) ne pose aucun attribut sur ses enfants, hors le `slot` qui les place. Le rôle, le nom, le focus et la visibilité du panneau appartiennent à son shadow DOM : un enfant garde son propre rôle, qu'une mise à jour ne lui reprend pas.
- **État** : le Runtime donne de nouveaux objets de props à chaque rendu, avec les mêmes valeurs. Un composant qui a un état (onglet choisi, section ouverte, notification fermée) ne le réinitialise que si ce que le manifeste demande change, pas quand l'objet change. Sans cela un changement de point de rupture défaisait ce que l'utilisateur avait fait.
- **Boîte de confirmation** : le `<dialog>` natif doit rendre le focus à l'élément qui l'avait, mais un bouton cliqué à la souris ne prend pas le focus dans Safari. La confirmation rend donc elle-même le focus à son bouton, quel que soit le mode de fermeture. Sur WebKit, `Tab` depuis le dernier bouton d'une boîte modale sort vers l'interface du navigateur au lieu de boucler (Chromium et Firefox bouclent), ce que la spécification autorise : l'exigence testée est que le focus ne tombe jamais sur la page derrière.
- **Alerte** : `info.alert` a toujours `role="alert"` (la définition n'a qu'un rôle). Plusieurs alertes présentes à l'ouverture d'une page sont donc toutes annoncées. Un composant qui doit choisir `status` ou `alert` selon le ton demandera un rôle par ton dans le contrat.
- **Captures de référence** : elles sont enregistrées avec le suffixe de plateforme de Playwright (ici `win32`) et un seuil de 0,1 % de pixels. Sur un autre système il faut les régénérer : `pnpm exec playwright test responsive --update-snapshots`, puis relire les images avant de les committer. Les assertions de structure (colonnes, défilement, hauteur d'un texte) sont portables et restent le garde-fou principal.

## Conséquences

- Écart avec le § 7.3 : `propsSchema` est un `TObject`, et le registre refuse ce que le dossier laissait implicite.
- Le validateur du lot 13 réutilisera `validateProps`, la détection de dépréciation et le registre.
- **Poids mesuré** (étape 10) : le bundle du Runtime, avec les 23 composants, Lit et TypeBox, pèse 383 895 octets (63 896 octets en gzip), contre 45 Ko en gzip avant le lot. Le budget du § 8.3 (moins de 250 Ko compressés) est tenu avec de la marge ; le contrôle formel reste au lot 14.
