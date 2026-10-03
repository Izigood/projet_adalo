import { err, isUuidV7, ok } from '@acs/domain';
import type { JsonValue, Result } from '@acs/domain';
import type { Field } from '@acs/project-schema';
import { canonicalDecimal } from './decimal.js';
import { safeRegExp } from './regex-safety.js';

export type ValueRule =
  | 'type'
  | 'format'
  | 'maxLength'
  | 'pattern'
  | 'pattern-unsafe'
  | 'min'
  | 'max'
  | 'scale'
  | 'precision'
  | 'choice'
  | 'count'
  | 'unique'
  | 'depth';

export type ValueIssue = { readonly rule: ValueRule; readonly message: string };

const fail = (rule: ValueRule, message: string) => err<ValueIssue>({ rule, message });

/** Defaults of dossier 6.3. */
const DEFAULT_STRING_LENGTH = 255;
const DEFAULT_TEXT_LENGTH = 10_000;
/** A `json` value is data a person typed in, not a document store: bounded in depth and size. */
const MAX_JSON_DEPTH = 32;
const MAX_JSON_NODES = 10_000;

/** Length in characters as a person counts them (a code point), as JSON Schema does. */
const lengthOf = (text: string): number => [...text].length;

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

function isCalendarDate(year: number, month: number, day: number): boolean {
  if (month < 1 || month > 12 || day < 1) return false;
  const days = [31, isLeapYear(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day <= (days[month - 1] ?? 0);
}

const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const DATETIME = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,9})?Z$/;

function checkDate(value: unknown): Result<JsonValue, ValueIssue> {
  if (typeof value !== 'string') return fail('type', 'a date is a string YYYY-MM-DD');
  const found = DATE.exec(value);
  if (found === null || !isCalendarDate(Number(found[1]), Number(found[2]), Number(found[3]))) {
    return fail('format', 'a date is a real day written YYYY-MM-DD');
  }
  return ok(value);
}

function checkDatetime(value: unknown): Result<JsonValue, ValueIssue> {
  if (typeof value !== 'string') return fail('type', 'a datetime is a string');
  const found = DATETIME.exec(value);
  const [, year, month, day, hour, minute, second] = found ?? [];
  const valid =
    found !== null &&
    isCalendarDate(Number(year), Number(month), Number(day)) &&
    Number(hour) < 24 &&
    Number(minute) < 60 &&
    Number(second) < 60;
  return valid ? ok(value) : fail('format', 'a datetime is ISO 8601 in UTC: 2026-10-03T14:30:00Z');
}

const patterns = new Map<string, ReturnType<typeof safeRegExp>>();

function checkString(
  value: unknown,
  maxLength: number,
  pattern: string | undefined,
): Result<JsonValue, ValueIssue> {
  if (typeof value !== 'string') return fail('type', 'a string is expected');
  if (lengthOf(value) > maxLength) return fail('maxLength', `at most ${maxLength} characters`);
  if (pattern !== undefined) {
    let compiled = patterns.get(pattern);
    if (compiled === undefined) {
      compiled = safeRegExp(pattern);
      patterns.set(pattern, compiled);
    }
    if (!compiled.ok) return fail('pattern-unsafe', compiled.error);
    if (!compiled.value.test(value)) return fail('pattern', 'the value does not match the pattern');
  }
  return ok(value);
}

function checkInteger(
  value: unknown,
  min: number | undefined,
  max: number | undefined,
): Result<JsonValue, ValueIssue> {
  if (typeof value !== 'number' || !Number.isSafeInteger(value)) {
    return fail('type', 'an integer between -2^53 and 2^53 is expected');
  }
  if (min !== undefined && value < min) return fail('min', `at least ${min}`);
  if (max !== undefined && value > max) return fail('max', `at most ${max}`);
  return ok(value);
}

/** Plain data only: no `undefined`, no NaN, no class instance, bounded in depth and size. */
function checkJson(value: unknown): Result<JsonValue, ValueIssue> {
  let nodes = 0;
  const walk = (item: unknown, depth: number): ValueIssue | undefined => {
    if (depth > MAX_JSON_DEPTH)
      return { rule: 'depth', message: `at most ${MAX_JSON_DEPTH} levels` };
    if (++nodes > MAX_JSON_NODES)
      return { rule: 'depth', message: `at most ${MAX_JSON_NODES} values` };
    if (item === null || typeof item === 'string' || typeof item === 'boolean') return undefined;
    if (typeof item === 'number') {
      return Number.isFinite(item) ? undefined : { rule: 'type', message: 'numbers are finite' };
    }
    if (Array.isArray(item)) {
      for (const element of item) {
        const issue = walk(element, depth + 1);
        if (issue !== undefined) return issue;
      }
      return undefined;
    }
    const prototype = typeof item === 'object' ? Object.getPrototypeOf(item) : undefined;
    if (typeof item !== 'object' || (prototype !== Object.prototype && prototype !== null)) {
      return { rule: 'type', message: 'only JSON data is allowed' };
    }
    for (const [key, member] of Object.entries(item)) {
      if (key === '__proto__') return { rule: 'type', message: 'the key __proto__ is not allowed' };
      const issue = walk(member, depth + 1);
      if (issue !== undefined) return issue;
    }
    return undefined;
  };
  const issue = walk(value, 0);
  return issue === undefined ? ok(value as JsonValue) : err(issue);
}

type ChoiceSource = Extract<Field, { type: 'choice' }>['options']['source'];

/** A fixed list is checked here; a dictionary choice is the id of a record of that dictionary. */
function checkChoice(value: unknown, source: ChoiceSource): Result<JsonValue, ValueIssue> {
  if (typeof value !== 'string') return fail('type', 'a choice is a string');
  if (source.kind === 'dictionary') {
    return isUuidV7(value) ? ok(value) : fail('format', 'a dictionary choice is a record id');
  }
  return source.values.some((entry) => entry.value === value)
    ? ok(value)
    : fail('choice', 'the value is not in the list');
}

function checkMultiChoice(
  value: unknown,
  source: ChoiceSource,
  min: number | undefined,
  max: number | undefined,
): Result<JsonValue, ValueIssue> {
  if (!Array.isArray(value)) return fail('type', 'a multiple choice is an array of strings');
  if (new Set(value).size !== value.length) return fail('unique', 'a choice is made once');
  if (min !== undefined && value.length < min) return fail('count', `at least ${min} choices`);
  if (max !== undefined && value.length > max) return fail('count', `at most ${max} choices`);
  for (const item of value) {
    const checked = checkChoice(item, source);
    if (!checked.ok) return checked;
  }
  return ok(value as JsonValue);
}

const checkId = (value: unknown, what: string): Result<JsonValue, ValueIssue> =>
  typeof value !== 'string'
    ? fail('type', `${what} is the id of a record, as a string`)
    : isUuidV7(value)
      ? ok(value)
      : fail('format', `${what} is a UUID v7`);

/**
 * Whether `value` is acceptable for the field, by its type and options (dossier 6.3): the shape of
 * the value, not whether it is there (obligatory, default and uniqueness belong to the constraints
 * of the Repository) nor whether what it points to exists (relations). Returns the value to
 * store: a decimal comes back in its canonical text, the others as they are. `null` is a value
 * only for a nullable boolean; an absent value is not checked here.
 */
export function checkFieldValue(field: Field, value: unknown): Result<JsonValue, ValueIssue> {
  switch (field.type) {
    case 'string':
      return checkString(
        value,
        field.options?.maxLength ?? DEFAULT_STRING_LENGTH,
        field.options?.pattern,
      );
    case 'text':
      return checkString(value, field.options?.maxLength ?? DEFAULT_TEXT_LENGTH, undefined);
    case 'integer':
      return checkInteger(value, field.options?.min, field.options?.max);
    case 'decimal': {
      const decimal = canonicalDecimal(value, field.options);
      return decimal.ok ? ok(decimal.value) : err(decimal.error);
    }
    case 'boolean':
      if (value === null && field.options?.nullable === true) return ok(null);
      return typeof value === 'boolean' ? ok(value) : fail('type', 'true or false is expected');
    case 'date':
      return checkDate(value);
    case 'datetime':
      return checkDatetime(value);
    case 'choice':
      return checkChoice(value, field.options.source);
    case 'multiChoice':
      return checkMultiChoice(value, field.options.source, field.options.min, field.options.max);
    case 'reference':
      return checkId(value, 'a reference');
    case 'file':
      return checkId(value, 'a file');
    case 'image':
      return checkId(value, 'an image');
    case 'json':
      return checkJson(value);
    default: {
      const unreachable: never = field;
      return unreachable;
    }
  }
}
