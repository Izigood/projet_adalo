import Dexie from 'dexie';
import type { IndexInfo } from '../storage/layout.js';
import type { ResolvedCondition } from './compare.js';
import type { ResolvedQuery } from './spec.js';

/** A key of an index: a value, or the values of a compound index. */
export type IndexKey = string | number | unknown[];

export type AccessKind = 'scan' | 'order' | 'eq' | 'prefix' | 'in' | 'range' | 'startsWith';

/** How the rows are reached: which index, between which keys. */
export type Access = {
  readonly kind: AccessKind;
  readonly index?: IndexInfo;
  readonly key?: IndexKey;
  readonly keys?: readonly IndexKey[];
  readonly lower?: IndexKey;
  readonly upper?: IndexKey;
  readonly includeLower?: boolean;
  readonly includeUpper?: boolean;
  readonly prefix?: string;
};

/** What `explain` says about a query: the way in, the conditions left to check one by one, the sort. */
export type QueryPlan = {
  readonly access: AccessKind;
  readonly index?: string;
  readonly residual: number;
  readonly sort: 'index' | 'memory' | 'none';
};

export type Planned = {
  readonly access: Access;
  readonly residual: readonly ResolvedCondition[];
  readonly sort: QueryPlan['sort'];
  /** The index order is walked backwards (the sort is descending and the index does it). */
  readonly reverse: boolean;
};

type Candidate = { score: number; access: Access; consumed: ResolvedCondition[] };

/**
 * Chooses the way into the rows (dossier 7.1: the structured filter "utilise les index"): the
 * most selective index that serves some conditions exactly (equality, a list, a range, a prefix, a
 * leading equality of a compound index), else the index of the sort, else the whole store. The
 * conditions it does not serve stay to be checked row by row.
 */
export function planQuery(query: ResolvedQuery): Planned {
  const { layout, conditions } = query;
  const candidates: Candidate[] = [];

  for (const index of layout.indexes) {
    if (index.keyPaths.length === 1 && index.fields.length === 1) {
      const field = index.fields[0];
      const here = conditions.filter((condition) => condition.info.key === field && condition.keys);
      const eq = here.find((condition) => condition.op === 'eq');
      if (eq?.keys?.[0] !== undefined) {
        candidates.push({
          score: index.unique ? 100 : 80,
          access: { kind: 'eq', index, key: eq.keys[0] },
          consumed: [eq],
        });
      }
      const list = here.find((condition) => condition.op === 'in');
      if (list?.keys !== undefined) {
        candidates.push({
          score: 50,
          access: { kind: 'in', index, keys: list.keys },
          consumed: [list],
        });
      }
      const lower = here.find((condition) => condition.op === 'gt' || condition.op === 'gte');
      const upper = here.find((condition) => condition.op === 'lt' || condition.op === 'lte');
      if (lower !== undefined || upper !== undefined) {
        candidates.push({
          score: lower !== undefined && upper !== undefined ? 40 : 30,
          access: {
            kind: 'range',
            index,
            lower: lower?.keys?.[0] ?? Dexie.minKey,
            upper: upper?.keys?.[0] ?? Dexie.maxKey,
            includeLower: lower === undefined || lower.op === 'gte',
            includeUpper: upper === undefined || upper.op === 'lte',
          },
          consumed: [lower, upper].filter((c): c is ResolvedCondition => c !== undefined),
        });
      }
      const start = here.find((condition) => condition.op === 'startsWith');
      if (start !== undefined && typeof start.value === 'string') {
        candidates.push({
          score: 25,
          access: { kind: 'startsWith', index, prefix: start.value },
          consumed: [start],
        });
      }
    } else if (index.keyPaths.length > 1) {
      const leading: ResolvedCondition[] = [];
      for (const field of index.fields) {
        const eq = conditions.find(
          (condition) => condition.info.key === field && condition.op === 'eq' && condition.keys,
        );
        if (eq === undefined) break;
        leading.push(eq);
      }
      const keys = leading.map((condition) => condition.keys?.[0] as IndexKey);
      if (leading.length === index.fields.length) {
        candidates.push({
          score: 85,
          access: { kind: 'eq', index, key: keys },
          consumed: leading,
        });
      } else if (leading.length > 0) {
        candidates.push({
          score: 60 + 5 * leading.length,
          access: {
            kind: 'prefix',
            index,
            lower: [...keys, Dexie.minKey],
            upper: [...keys, Dexie.maxKey],
          },
          consumed: leading,
        });
      }
    }
  }

  const best = candidates.reduce<Candidate | undefined>(
    (chosen, candidate) =>
      chosen === undefined || candidate.score > chosen.score ? candidate : chosen,
    undefined,
  );
  let access: Access = best?.access ?? { kind: 'scan' };
  const consumed = best?.consumed ?? [];
  const residual = conditions.filter((condition) => !consumed.includes(condition));

  let sort: Planned['sort'] = query.sort.length === 0 ? 'none' : 'memory';
  let reverse = false;
  const first = query.sort[0];
  if (query.sort.length === 1 && first !== undefined && first.info.required) {
    // Only a required field is in every row, so only its index holds every row.
    const sortIndex = layout.indexes.find(
      (index) =>
        index.keyPaths.length === 1 &&
        index.fields.length === 1 &&
        index.fields[0] === first.info.key,
    );
    if (sortIndex !== undefined && access.kind === 'scan') {
      access = { kind: 'order', index: sortIndex };
    }
    if (sortIndex !== undefined && access.index === sortIndex) {
      sort = 'index';
      reverse = first.dir === 'desc';
    }
  }
  return { access, residual, sort, reverse };
}

export function describePlan(planned: Planned): QueryPlan {
  return {
    access: planned.access.kind,
    ...(planned.access.index === undefined ? {} : { index: planned.access.index.dexieName }),
    residual: planned.residual.length,
    sort: planned.sort,
  };
}
