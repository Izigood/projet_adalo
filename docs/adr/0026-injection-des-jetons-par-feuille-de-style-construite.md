# ADR-0026 — Injection des jetons de design par feuille de style construite

- **Statut** : acceptée
- **Date** : 2026-10-02
- **Source** : EF-THM-01 ; dossier § 5.1 (CSP sans `unsafe-eval`) ; `packages/design-system`

## Contexte

Les jetons de design sont exposés en propriétés CSS personnalisées (`--acs-*`) pour le Studio et le Runtime. Le Studio ne peut pas importer `apps/runtime` (§ 9.2), et une balise `<style>` exigerait `unsafe-inline` sous une CSP stricte.

## Décision

`applyTheme(document)` vit dans `@acs/design-system` : il crée une feuille de style construite (`CSSStyleSheet.replaceSync`) et l'ajoute à `adoptedStyleSheets`, de façon idempotente. `themeCss()` génère la feuille : clair par défaut, sombre via `data-theme="dark"` ou la préférence système, sauf si `data-theme="light"` est forcé.

## Conséquences

- Compatible avec une CSP sans `unsafe-inline` ; pris en charge par Safari 16.4 et plus, Firefox 101 et plus, Chrome 73 et plus, ce qui couvre la matrice D-11.
- `design-system` n'importe pas `domain` (§ 9.2) : il n'utilise pas `Result`. Il ne reçoit aujourd'hui que des jetons typés internes. Quand des thèmes personnalisés arriveront (lots 1 et 7), la validation des valeurs, pour éviter l'injection CSS, devra se faire côté `project-schema` ou `validator`.
- Les paires de couleurs des thèmes de base respectent 4,5:1 (texte) et 3:1 (éléments d'interface) : test de contraste dans `packages/design-system`. Le contrôle dans l'éditeur (EF-THM-02) reste du lot 7.
