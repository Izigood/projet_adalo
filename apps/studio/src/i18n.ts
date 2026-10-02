import fr from './locales/fr.json';

export type MessageKey = keyof typeof fr;

/** Interface labels live in locales/fr.json (ENF-10); never hard-code them in components. */
export function t(key: MessageKey): string {
  return fr[key];
}
