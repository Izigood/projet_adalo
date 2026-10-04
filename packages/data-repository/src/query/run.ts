import { err, ok } from '@acs/domain';
import type { DomainError, JsonValue, Page, QuerySpec, Result } from '@acs/domain';
import type { Collection, Table } from 'dexie';
import type { OpenEnvironment } from '../storage/database.js';
import { storageError } from '../storage/database.js';
import { computeAggregates } from './aggregate.js';
import { compareWithAbsent, matches, matchesSearch } from './compare.js';
import { encodeCursor } from './cursor.js';
import { describePlan, planQuery } from './plan.js';
import type { Access, Planned, QueryPlan } from './plan.js';
import { resolveQuery } from './spec.js';
import type { ResolvedQuery } from './spec.js';

export type QueryRow = Record<string, unknown> & { id: string };

/** What a query returns, with how it was answered: the plan and the rows it had to read. */
export type QueryRun = {
  readonly page: Page<QueryRow>;
  readonly plan: QueryPlan;
  /** Rows read from the store, those returned and those only looked at: the proof of an index. */
  readonly examined: number;
};

/** A query that has been checked and planned, and has not read anything yet. */
export type PreparedQuery = {
  readonly query: ResolvedQuery;
  readonly planned: Planned;
  readonly store: string;
};

function open(table: Table, access: Access): Collection {
  const index = access.index?.dexieName ?? '';
  switch (access.kind) {
    case 'scan':
      return table.toCollection();
    case 'order':
      return table.orderBy(index);
    case 'eq':
      return table.where(index).equals(access.key as never);
    case 'in': {
      const found = table.where(index).anyOf([...(access.keys ?? [])] as never[]);
      return access.index?.multiEntry === true ? found.distinct() : found;
    }
    case 'prefix':
    case 'range':
      return table
        .where(index)
        .between(
          access.lower as never,
          access.upper as never,
          access.includeLower ?? true,
          access.includeUpper ?? true,
        );
    case 'startsWith':
      return table.where(index).startsWith(access.prefix ?? '');
  }
}

/** A record as the caller sees it: no derived keys, and only the projected fields (and the id). */
function present(row: QueryRow, projection: readonly string[] | undefined): QueryRow {
  const keep = projection === undefined ? undefined : new Set(['id', ...projection]);
  return Object.fromEntries(
    Object.entries(row).filter(
      ([key]) => !key.startsWith('_k_') && (keep === undefined || keep.has(key)),
    ),
  ) as QueryRow;
}

/** Ascending sort by the sort keys, ties by id; descending is the exact reverse (as an index walked backwards). */
function sorter(query: ResolvedQuery): (a: QueryRow, b: QueryRow) => number {
  return (a, b) => {
    for (const { info, dir } of query.sort) {
      const order = compareWithAbsent(info, a[info.key], b[info.key]);
      if (order !== 0) return dir === 'asc' ? order : -order;
    }
    const byId = a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    return query.sort[0]?.dir === 'desc' ? -byId : byId;
  };
}

/**
 * Checks a query and plans it, with no I/O: the part of `runQuery` that can fail on the query
 * itself. It is separate so that a caller inside a transaction can refuse a bad query without
 * awaiting anything (see `createRecordAccess`).
 */
export function prepareQuery(
  environment: OpenEnvironment,
  spec: QuerySpec,
): Result<PreparedQuery, DomainError> {
  const layout = environment.layout.entities.get(spec.source);
  if (layout === undefined) {
    return err(storageError(new RangeError(`the project has no entity ${spec.source}`)));
  }
  const resolved = resolveQuery(layout, spec);
  if (!resolved.ok) return resolved;
  return ok({ query: resolved.value, planned: planQuery(resolved.value), store: layout.storeName });
}

/** Reads what a prepared query asks for. Always makes at least one request. */
export async function executeQuery(
  environment: OpenEnvironment,
  { query, planned, store }: PreparedQuery,
): Promise<Result<QueryRun, DomainError>> {
  let examined = 0;
  try {
    let collection = open(environment.db.table(store), planned.access);
    if (planned.reverse) collection = collection.reverse();
    // A filter on the collection makes the browser walk a cursor, a record at a time; without one
    // (and with a limit, no offset) Dexie asks for the whole range at once with `getAll`, which is
    // how a page comes back in a few milliseconds (and, on a slow IndexedDB, in one request
    // instead of one per record). So the records read are counted by a filter only when there is
    // something to check record by record; otherwise they are the records fetched.
    const checked = planned.residual.length > 0 || query.search !== undefined;
    if (checked) {
      collection = collection.filter((row: QueryRow) => {
        examined += 1;
        return (
          planned.residual.every((condition) => matches(row, condition)) &&
          (query.search === undefined || matchesSearch(row, query.search))
        );
      });
    }

    let rows: QueryRow[];
    let aggregates: Record<string, JsonValue> | undefined;
    if (planned.sort === 'memory' || query.aggregates !== undefined) {
      // Everything that matches is needed: to sort it, or to aggregate it.
      const all: QueryRow[] = await collection.toArray();
      if (!checked) examined = all.length;
      if (query.aggregates !== undefined) aggregates = computeAggregates(all, query.aggregates);
      if (planned.sort === 'memory') all.sort(sorter(query));
      rows = all.slice(query.offset, query.offset + query.size + 1);
    } else {
      rows = await collection
        .offset(query.offset)
        .limit(query.size + 1)
        .toArray();
      if (!checked) examined = rows.length;
    }

    const more = rows.length > query.size;
    return ok({
      page: {
        items: rows.slice(0, query.size).map((row) => present(row, query.projection)),
        ...(more ? { nextCursor: encodeCursor(query.offset + query.size, query.fingerprint) } : {}),
        ...(aggregates === undefined ? {} : { aggregates }),
      },
      plan: describePlan(planned),
      examined,
    });
  } catch (error) {
    return err(storageError(error));
  }
}

/**
 * Runs a query on one entity (EF-BND-03): the filter goes through an index when one serves it, the
 * rest (and the text search) is checked row by row, the sort uses an index when it can and is
 * done in memory otherwise, and a page of at most 500 rows comes with the cursor of the next one.
 * Without `page`, the first 500 rows are returned. Aggregates are over every row that matches,
 * not over the page.
 */
export async function runQuery(
  environment: OpenEnvironment,
  spec: QuerySpec,
): Promise<Result<QueryRun, DomainError>> {
  const prepared = prepareQuery(environment, spec);
  return prepared.ok ? executeQuery(environment, prepared.value) : prepared;
}
