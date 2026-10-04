/**
 * The value a record has for a field, and nothing for a field it does not have. `record[key]`
 * alone also finds what a record inherits: a field may be named `constructor` or `toString`
 * (the pattern of a key allows it, and a manifest that is imported is not trusted), and a record
 * that has no such field would be read as having the function of every object.
 */
export function own(record: Readonly<Record<string, unknown>>, key: string): unknown {
  return Object.hasOwn(record, key) ? record[key] : undefined;
}
