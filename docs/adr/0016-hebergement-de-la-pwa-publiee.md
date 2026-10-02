# ADR-0016 — Hébergement de la PWA publiée : serveur statique HTTPS

- **Statut** : Acceptée : recommandation du dossier appliquée telle quelle (dossier § 0, tant qu'un ADR ne la modifie pas)
- **Date** : 2026-10-02
- **Source** : dossier de création § 3, décision D-06

## Contexte

Options : serveur statique HTTPS intranet (IIS, Nginx) ou hébergement cloud privé.

## Décision

Dossier statique déployable sur tout serveur HTTPS ; le serveur cible reste à nommer par l'exploitant.

## Conséquences

Le routage par hash (`/#/route`) évite toute règle de réécriture côté serveur. Concerne le lot 13 et AC-06.
