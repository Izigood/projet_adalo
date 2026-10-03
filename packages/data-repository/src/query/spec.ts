import { MAX_PAGE_SIZE, domainError, err, ok } from '@acs/domain';
import type { DomainError, FilterOperator, JsonValue, QuerySpec, Result } from '@acs/domain';
import type { EntityLayout, FieldInfo } from '../storage/layout.js';
import { canonicalDecimal, decimalSortKey, looseDecimal } from '../values/decimal.js';
import type { ResolvedCondition } from './compare.js';
import { decodeCursor, fingerprint } from './cursor.js';

export type ResolvedQuery = {
  readonly layout: EntityLayout;
  readonly conditions: readonly ResolvedCondition[];
  readonly sort: readonly { readonly info: FieldInfo; readonly dir: 'asc' | 'desc' }[];
  readonly projection?: readonly string[];
  readonly size: number;
  readonly offset: number;
  /** Identifies the query without its page, so that a cursor cannot be used with another one. */
  readonly fingerprint: string;
};

const fail = (message: string, details?: Record<string, unknown>): Result<never, DomainError> =>
  err(domainError('QUERY_INVALID', message, details === undefined ? {} : { details }));

const ORDERED = new Set(['string', 'text', 'choice', 'integer', 'decimal', 'date', 'datetime']);
const PREFIXED = new Set(['string', 'text', 'choice', 'date', 'datetime']);
const EQUALITY = new Set(['boolean', 'reference', 'file', 'image', 'multiChoice']);
const SORTABLE_NOT = new Set(['json', 'multiChoice']);
const MAX_IN = 500;

/** "a boolean", "an integer": the name of a type with its article. */
const a = (type: string): string => (/^[aeiou]/.test(type) ? 'an ' : 'a ') + type;

function allows(info: FieldInfo, op: FilterOperator): boolean {
  if (info.type === 'json') return false;
  if (op === 'eq' || op === 'ne' || op === 'in') return true;
  if (op === 'startsWith') return PREFIXED.has(info.type);
  return ORDERED.has(info.type) && !EQUALITY.has(info.type);
}

/** One value of a condition as the field stores it, or why it cannot be one. */
function scalar(info: FieldInfo, value: unknown): JsonValue | undefined {
  if (info.type === 'integer') return Number.isSafeInteger(value) ? (value as number) : undefined;
  if (info.type === 'boolean') return typeof value === 'boolean' ? value : undefined;
  if (info.type === 'decimal') {
    const loose = looseDecimal(value);
    const format = info.derived?.format;
    const canonical = format === undefined ? undefined : canonicalDecimal(loose, format);
    return canonical?.ok ? canonical.value : loose;
  }
  return typeof value === 'string' ? value : undefined;
}

/** The index key that stands for a normalised value, if the key space can hold it. */
function keyOf(info: FieldInfo, value: JsonValue): string | number | undefined {
  if (info.type === 'boolean') return value === true ? 1 : 0;
  if (info.type === 'decimal') {
    const format = info.derived?.format;
    const canonical = format === undefined ? undefined : canonicalDecimal(value, format);
    return canonical?.ok && format !== undefined
      ? decimalSortKey(canonical.value, format)
      : undefined;
  }
  return typeof value === 'string' || typeof value === 'number' ? value : undefined;
}

function resolveCondition(
  layout: EntityLayout,
  condition: { field: string; op: FilterOperator; value: JsonValue },
): Result<ResolvedCondition, DomainError> {
  const info = layout.fields.get(condition.field);
  const where = `${layout.key}.${condition.field}`;
  if (info === undefined) return fail(`${where}: the entity has no such field`);
  if (!allows(info, condition.op)) {
    return fail(`${where}: ${a(info.type)} field cannot be filtered with ${condition.op}`);
  }
  if (condition.op === 'in') {
    const values = condition.value;
    if (!Array.isArray(values) || values.length > MAX_IN) {
      return fail(`${where}: in takes a list of at most ${MAX_IN} values`);
    }
    const normalised = values.map((item) => scalar(info, item));
    if (normalised.some((item) => item === undefined)) {
      return fail(`${where}: a value of the list is not ${a(info.type)}`);
    }
    const keys = (normalised as JsonValue[]).map((item) => keyOf(info, item));
    return ok({
      info,
      op: 'in',
      value: normalised as JsonValue[],
      ...(keys.every((key) => key !== undefined) ? { keys: keys as (string | number)[] } : {}),
    });
  }
  const value = scalar(info, condition.value);
  if (value === undefined) return fail(`${where}: the value is not ${a(info.type)}`);
  const key = keyOf(info, value);
  return ok({ info, op: condition.op, value, ...(key === undefined ? {} : { keys: [key] }) });
}

/**
 * Checks a query against its entity (QUERY_INVALID names the field and the problem) and turns it
 * into what the engine runs. `where`, `search` and `aggregate` are not supported yet.
 */
export function resolveQuery(
  layout: EntityLayout,
  spec: QuerySpec,
): Result<ResolvedQuery, DomainError> {
  if (spec.where !== undefined) {
    return fail('where needs the expression engine, which comes with lot 8');
  }
  if (spec.search !== undefined) return fail('search is not available yet');
  if (spec.aggregate !== undefined) return fail('aggregate is not available yet');

  const conditions: ResolvedCondition[] = [];
  for (const condition of spec.filter?.and ?? []) {
    const resolved = resolveCondition(layout, condition);
    if (!resolved.ok) return resolved;
    conditions.push(resolved.value);
  }

  const sort: { info: FieldInfo; dir: 'asc' | 'desc' }[] = [];
  for (const item of spec.sort ?? []) {
    const info = layout.fields.get(item.field);
    if (info === undefined || SORTABLE_NOT.has(info.type)) {
      return fail(`${layout.key}.${item.field}: this field cannot be sorted on`);
    }
    sort.push({ info, dir: item.dir });
  }

  for (const key of spec.projection ?? []) {
    if (!layout.fields.has(key)) return fail(`${layout.key}.${key}: the entity has no such field`);
  }

  const size = spec.page?.size ?? MAX_PAGE_SIZE;
  if (!Number.isInteger(size) || size < 1 || size > MAX_PAGE_SIZE) {
    return fail(`a page has between 1 and ${MAX_PAGE_SIZE} rows`);
  }
  const query = fingerprint(JSON.stringify({ ...spec, page: undefined }));
  let offset = 0;
  if (spec.page?.cursor !== undefined) {
    const decoded = decodeCursor(spec.page.cursor, query);
    if (!decoded.ok) return fail(decoded.error);
    offset = decoded.value;
  }
  return ok({
    layout,
    conditions,
    sort,
    ...(spec.projection === undefined ? {} : { projection: [...new Set(spec.projection)] }),
    size,
    offset,
    fingerprint: query,
  });
}
