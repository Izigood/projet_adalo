import type { DomainError, Page, QuerySpec, Result } from '@acs/domain';
import { err, ok } from '@acs/domain';
import type { Collection, Table } from 'dexie';
import type { OpenEnvironment } from '../storage/database.js';
import { storageError } from '../storage/database.js';
import { compareWithAbsent, matches } from './compare.js';
import { encodeCursor } from './cursor.js';
import { describePlan, planQuery } from './plan.js';
import type { Access, QueryPlan } from './plan.js';
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
 * Runs a query on one entity (EF-BND-03): the filter goes through an index when one serves it, the
 * rest is checked row by row, the sort uses an index when it can and is done in memory otherwise,
 * and a page of at most 500 rows comes with the cursor of the next one. Without `page`, the first
 * 500 rows are returned.
 */
export async function runQuery(
  environment: OpenEnvironment,
  spec: QuerySpec,
): Promise<Result<QueryRun, DomainError>> {
  const layout = environment.layout.entities.get(spec.source);
  if (layout === undefined) {
    return err(storageError(new RangeError(`the project has no entity ${spec.source}`)));
  }
  const resolved = resolveQuery(layout, spec);
  if (!resolved.ok) return resolved;
  const query = resolved.value;
  const planned = planQuery(query);

  let examined = 0;
  try {
    let collection = open(environment.db.table(layout.storeName), planned.access);
    if (planned.reverse) collection = collection.reverse();
    collection = collection.filter((row: QueryRow) => {
      examined += 1;
      return planned.residual.every((condition) => matches(row, condition));
    });
    const rows: QueryRow[] =
      planned.sort === 'memory'
        ? (await collection.toArray())
            .sort(sorter(query))
            .slice(query.offset, query.offset + query.size + 1)
        : await collection
            .offset(query.offset)
            .limit(query.size + 1)
            .toArray();

    const more = rows.length > query.size;
    const items = rows.slice(0, query.size).map((row) => present(row, query.projection));
    return ok({
      page: {
        items,
        ...(more ? { nextCursor: encodeCursor(query.offset + query.size, query.fingerprint) } : {}),
      },
      plan: describePlan(planned),
      examined,
    });
  } catch (error) {
    return err(storageError(error));
  }
}
