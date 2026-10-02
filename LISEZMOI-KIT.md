# Kit de démarrage Claude Code — App Canvas Studio

Décompresser l'archive à la racine d'un dépôt vide `app-canvas-studio`, puis lancer Claude Code dans ce dossier.

| Fichier | Rôle |
| --- | --- |
| `CLAUDE.md` | Règles permanentes, chargées automatiquement par Claude Code à chaque session |
| `docs/dossier-creation.md` | Dossier de création complet : référence fonctionnelle et technique |
| `.claude/commands/lot.md` | Commande `/lot N` : démarre le lot N (analyse d'abord, code après validation) |
| `.claude/agents/reviewer.md` | Sous-agent de revue indépendante en fin de lot |

Premier lancement : `/lot 0`.

Après le lot 0, quand `pnpm lint` et `pnpm typecheck` existent, on peut ajouter dans `.claude/settings.json` un hook qui les exécute après chaque modification de fichier (section 11.1, point 5).
