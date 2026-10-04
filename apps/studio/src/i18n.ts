import fr from './locales/fr.json';

export type MessageKey = keyof typeof fr;
export type MessageParams = Readonly<Record<string, string | number>>;

/**
 * Interface labels live in locales/fr.json (ENF-10); never hard-code them in components. A `{name}`
 * in a label is replaced by the parameter of that name; one that is not given stays as it is, so
 * that a missing parameter shows instead of vanishing.
 */
export function t(key: MessageKey, params?: MessageParams): string {
  const text = fr[key];
  if (params === undefined) return text;
  return text.replace(/\{(\w+)\}/g, (whole, name: string) => {
    const value = params[name];
    return value === undefined ? whole : String(value);
  });
}
