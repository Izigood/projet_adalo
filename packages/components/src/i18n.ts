import fr from './locales/fr.json';

/** The keys of the texts a component shows (not the palette names, which start with `component.`). */
export type TextKey = Extract<keyof typeof fr, `text.${string}`>;

/** A French text of the library (ENF-10): components never hard-code what they show. */
export function t(key: TextKey): string {
  return fr[key];
}
