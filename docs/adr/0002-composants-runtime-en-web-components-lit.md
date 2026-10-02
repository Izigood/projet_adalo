# ADR-0002 — Composants du Runtime en Web Components (Lit 3)

- **Statut** : acceptée (transcription minimale, à compléter depuis le DAD)
- **Date** : 2026-10-02
- **Source** : DAD v1.0, ADR-002 ; dossier de création § 5.2

## Contexte

Les composants que le Runtime assemble à partir du manifeste doivent fonctionner sans dépendre du framework de l'éditeur, et être isolés les uns des autres.

## Décision

Les composants du Runtime sont des **Web Components** écrits avec **Lit 3**. Le Runtime ne dépend pas de React (voir ADR-0011 pour le Studio).

## Conséquences

- `apps/runtime` et `packages/components` utilisent Lit ; `packages/components` n'effectue aucune entrée/sortie : données par binding, actions par événements (CLAUDE.md).
- Le style passe par des propriétés CSS personnalisées (`--acs-*`) qui traversent le Shadow DOM (vérifié en E2E au lot 0).
- Interdit : `unsafeHTML` de Lit, `innerHTML` avec donnée dynamique (règles ESLint, ADR-0024).

## Note de transcription

Texte reconstitué à partir du dossier de création ; le DAD d'origine n'était pas disponible lors du lot 0. À relire contre le DAD.
