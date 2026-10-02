---
description: Démarre un lot du plan App Canvas Studio (analyse d'abord, code après validation)
argument-hint: <numéro du lot, 0 à 20>
---

Lot $ARGUMENTS. Référence : docs/dossier-creation.md, section 10.1 (ou 10.2 pour les lots 15 à 20), ligne du lot $ARGUMENTS.

1. Analyse (sans code) :
   - relis la ligne du lot : contenu, exigences, critère de sortie, dépendances ;
   - relis les précisions de chaque exigence citée en section 4.2, les contrats concernés (sections 6 et 7), les dépendances autorisées (9.2) et les décisions de la section 3 qui s'appliquent ;
   - vérifie que les lots dont celui-ci dépend sont terminés (tags présents) ; sinon, arrête-toi et signale-le.
   Produis : liste des fichiers à créer ou modifier, découpage en étapes commitables de moins de 400 lignes de diff, tests prévus pour chaque critère de sortie (y compris les contrôles négatifs, règle REC-10), risques et questions.
2. Attends ma validation explicite avant d'écrire du code.
3. Réalise étape par étape, un commit par étape (Conventional Commits), avec `pnpm verify` vert à chaque commit.
4. Fin de lot :
   - démontre chaque critère de sortie par la commande ou le test qui le prouve ;
   - lance le sous-agent `reviewer` sur le diff du lot et traite ses constats ;
   - mets à jour CHANGELOG.md et propose le tag v0.$ARGUMENTS.0 (v1.0.0 pour le lot 14) ;
   - liste les écarts éventuels par rapport au dossier et les ADR écrits.
