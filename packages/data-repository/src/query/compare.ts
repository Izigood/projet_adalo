import type { FilterOperator, JsonValue } from '@acs/domain';
import type { FieldInfo } from '../storage/layout.js';
import { compareDecimals } from '../values/decimal.js';
import { own } from '../values/own.js';

/** A condition of a filter, checked against its field and ready to run. */
export type ResolvedCondition = {
  readonly info: FieldInfo;
  readonly op: FilterOperator;
  /** Normalised: a decimal in plain notation; for `in`, an array of such values. */
  readonly value: JsonValue;
  /** The index keys that stand for the value(s), when an index can serve the condition. */
  readonly keys?: readonly (string | number)[];
};

/** Natural order of two values of a field; neither is absent. Strings compare by UTF-16 unit, as IndexedDB does. */
export function compareValues(info: FieldInfo, a: unknown, b: unknown): number {
  if (info.type === 'decimal') return compareDecimals(String(a), String(b));
  if (typeof a === 'boolean' && typeof b === 'boolean') return Number(a) - Number(b);
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  const x = String(a);
  const y = String(b);
  return x < y ? -1 : x > y ? 1 : 0;
}

/** Absent values come first in ascending order. */
export function compareWithAbsent(info: FieldInfo, a: unknown, b: unknown): number {
  const missingA = a === undefined || a === null;
  const missingB = b === undefined || b === null;
  if (missingA || missingB) return Number(!missingA) - Number(!missingB);
  return compareValues(info, a, b);
}

const same = (info: FieldInfo, a: unknown, b: unknown): boolean => compareValues(info, a, b) === 0;

/**
 * Whether a record satisfies a condition. An absent value satisfies nothing but `ne`. On a
 * multiple choice `eq` means "contains", `in` "contains one of", `ne` "does not contain".
 */
export function matches(
  row: Readonly<Record<string, unknown>>,
  condition: ResolvedCondition,
): boolean {
  const { info, op, value } = condition;
  const actual = own(row, info.key);
  const absent = actual === undefined || actual === null;
  if (absent) return op === 'ne';
  const held = Array.isArray(actual) ? actual : [actual];
  const wanted = Array.isArray(value) ? value : [value];
  switch (op) {
    case 'eq':
      return held.some((item) => same(info, item, value));
    case 'ne':
      return !held.some((item) => same(info, item, value));
    case 'in':
      return held.some((item) => wanted.some((candidate) => same(info, item, candidate)));
    case 'gt':
      return compareValues(info, actual, value) > 0;
    case 'gte':
      return compareValues(info, actual, value) >= 0;
    case 'lt':
      return compareValues(info, actual, value) < 0;
    case 'lte':
      return compareValues(info, actual, value) <= 0;
    case 'startsWith':
      return typeof actual === 'string' && actual.startsWith(String(value));
  }
}

/** A text as a search sees it: no accents, no case ("Éléphant" is found by "elephant"). */
export function foldText(text: string): string {
  return text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
}

/** The words of a search and the text fields they are looked for in. */
export type ResolvedSearch = {
  readonly tokens: readonly string[];
  readonly fields: readonly FieldInfo[];
};

/** Every word must be found, in any of the fields (substring, accents and case ignored). */
export function matchesSearch(
  row: Readonly<Record<string, unknown>>,
  search: ResolvedSearch,
): boolean {
  const texts = search.fields
    .map((info) => own(row, info.key))
    .filter((v) => typeof v === 'string');
  const folded = texts.map((text) => foldText(text as string));
  return search.tokens.every((token) => folded.some((text) => text.includes(token)));
}
