import { lightTokens, darkTokens } from '../packages/design-system/src/tokens.js';

export const STUDIO_URL = process.env['STUDIO_URL'] ?? 'http://127.0.0.1:4173';
export const RUNTIME_URL = process.env['RUNTIME_URL'] ?? 'http://127.0.0.1:4174';

/** The page background expected from the design tokens, as the browser reports it. */
export const SURFACE = {
  light: { token: lightTokens['color.surface'], rgb: 'rgb(255, 255, 255)' },
  dark: { token: darkTokens['color.surface'], rgb: 'rgb(18, 21, 27)' },
} as const;

/** The title of the page of the minimal fixture, which the Runtime shows (pinned by its digest). */
export const MINIMAL_TITLE = 'Bonjour';

/** The title of the page of the responsive fixture (pinned by its digest). */
export const RESPONSIVE_TITLE = 'Tableau de bord';

/** The title of the page of the interactive fixture (pinned by its digest). */
export const INTERACTIVE_TITLE = 'Interactions';
