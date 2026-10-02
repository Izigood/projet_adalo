# ADR-0001 — Aucun code généré par écran

- **Statut** : acceptée (transcription minimale, à compléter depuis le DAD)
- **Date** : 2026-10-02
- **Source** : DAD v1.0, ADR-001 ; dossier de création § 1

## Contexte

App Canvas Studio est un atelier low-code piloté par métadonnées. Générer du code source pour chaque écran créerait un artefact à maintenir, à tester et à sécuriser pour chaque application produite.

## Décision

Le Studio produit un **manifeste de projet** déclaratif et versionné. Un **Runtime** stable et pré-construit l'interprète. Aucun code n'est généré écran par écran.

## Conséquences

- Le paquet projet (`.acs.zip`) est le seul contrat entre Studio et Runtime (dossier § 5).
- Toute évolution du format du manifeste exige une migration et une fixture de l'ancien format (CLAUDE.md).
- La publication au MVP est un assemblage (Runtime + paquet + service worker), pas une compilation.

## Note de transcription

Texte reconstitué à partir du dossier de création ; le DAD d'origine n'était pas disponible lors du lot 0. À relire contre le DAD.
