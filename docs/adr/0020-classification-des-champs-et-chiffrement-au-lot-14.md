# ADR-0020 — Chiffrement des données locales : classification au MVP, chiffrement au lot 14

- **Statut** : Acceptée : recommandation du dossier appliquée telle quelle (dossier § 0, tant qu'un ADR ne la modifie pas)
- **Date** : 2026-10-02
- **Source** : dossier de création § 3, décision D-10

## Contexte

Options : A, classification des champs au MVP et chiffrement AES-GCM en lot dédié ; B, chiffrement dès le MVP ; C, jamais.

## Décision

**Option A.** Le champ porte dès le départ `classification: public / interne / sensible` ; le chiffrement WebCrypto des champs sensibles arrive au lot 14.

## Conséquences

Concerne le lot 4 (classification) puis le lot 14 (chiffrement).
