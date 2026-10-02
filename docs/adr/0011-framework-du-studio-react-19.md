# ADR-0011 — Framework du Studio : React 19

- **Statut** : Acceptée : confirmée par l'utilisateur au lot 0 (le remplacement de React par Lit partout a été examiné et écarté)
- **Date** : 2026-10-02
- **Source** : dossier de création § 3, décision D-01

## Contexte

Il faut trancher le framework du Studio avant le lot 0. Options : A, React 19 pour le Studio et Lit pour les composants du Runtime ; B, Lit partout.

## Décision

**Option A.** Le Studio (`apps/studio`) est en React 19 ; les composants du Runtime restent des Web Components Lit (ADR-0002).

## Conséquences

L'éditeur (canvas, inspecteur, graphe) profite de l'écosystème React (dnd-kit, React Flow, Zustand). Le Runtime ne dépend pas de React. L'option B reste viable mais imposerait de réécrire graphe et glisser-déposer.
