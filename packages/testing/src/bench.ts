import type { QuerySpec } from '@acs/domain';
import type { Entity } from '@acs/project-schema';
import { entityOf } from './entity-builder.js';

/**
 * The volume bench of lot 4: 10 000 records of one entity and the queries the dossier asks to be
 * fast on them ("requête indexée sur 10 000 lignes en moins de 100 ms", § 10.1, § 8.3). The data
 * and what each query must do are here once; the runners (a unit test under fake-indexeddb, a page
 * in the three real browsers) are where the data engine can be imported.
 */
export const BENCH_ROWS = 10_000;
export const BENCH_CATEGORIES = 20;
/** The budget of a query on an index, in milliseconds. */
export const BENCH_BUDGET_MS = 100;

/** One entity, `item`, with the indexes the bench queries rely on (or none, for a negative control). */
export function benchEntity(options: { readonly indexed?: boolean } = {}): Entity {
  return entityOf(
    'item',
    {
      name: { type: 'string', required: true },
      qty: { type: 'integer', required: true },
      category: { type: 'string', required: true },
      price: { type: 'decimal', options: { precision: 10, scale: 2 } },
      done: { type: 'boolean' },
    },
    options.indexed === false
      ? []
      : [
          { name: 'byCategory', fields: ['category'] },
          { name: 'byQty', fields: ['qty'] },
          { name: 'byPrice', fields: ['price'] },
          { name: 'byCategoryAndQty', fields: ['category', 'qty'] },
        ],
  );
}

/**
 * The record number `i`: `qty` is `i`, the category is one of 20 in turn (so 500 records each of
 * 10 000), a quarter of the records have no price, the others `i / 4`.
 */
export function benchRow(i: number): Record<string, unknown> {
  return {
    name: `item-${String(i).padStart(5, '0')}`,
    qty: i,
    category: `c${String(i % BENCH_CATEGORIES).padStart(2, '0')}`,
    ...(i % 4 === 0 ? {} : { price: (i * 0.25).toFixed(2) }),
    done: i % 2 === 0,
  };
}

export type BenchQuery = {
  readonly name: string;
  readonly spec: Omit<QuerySpec, 'source'>;
  /** What the plan must be, how many records come back and how many may be read to find them. */
  readonly expect: {
    readonly access: string;
    readonly index?: string;
    readonly items: number;
    readonly examined: number;
    readonly aggregates?: Readonly<Record<string, unknown>>;
  };
  /** The query is held to the budget. The control that reads everything is not: it shows the cost. */
  readonly budgeted: boolean;
};

/**
 * The queries of the bench and what each must do on `rows` records (a multiple of 20, at least
 * 200): the plan, how many records come back, how many may be read to find them. For the 10 000 of
 * the dossier these are the figures of the analysis (50 of 51 read, 500 of 500, 100 of 100…); for a
 * smaller set they follow from the same data, so that a browser that cannot fill 10 000 records in
 * reasonable time still has its plans and its results checked.
 */
export function benchQueries(rows: number): readonly BenchQuery[] {
  const perCategory = Math.floor(rows / BENCH_CATEGORIES);
  /** What a page of `size` gives out of `available` matching records, and what it reads to know. */
  const page = (size: number, available: number) => ({
    items: Math.min(size, available),
    examined: Math.min(size, available) + (available > size ? 1 : 0),
  });
  const low = Math.floor(rows * 0.2);
  const width = Math.min(100, Math.floor(rows * 0.1));
  const priceFloor = (rows * 0.2).toFixed(2);
  let dear = 0;
  for (let i = 0; i < rows; i += 1) {
    if (i % 4 !== 0 && i * 0.25 > Number(priceFloor)) dear += 1;
  }
  const middleName = String(benchRow(Math.floor(rows / 2))['name']);

  return [
    {
      name: 'equality on an indexed field, first page',
      spec: {
        filter: { and: [{ field: 'category', op: 'eq', value: 'c07' }] },
        page: { size: 50 },
      },
      expect: { access: 'eq', index: 'category', ...page(50, perCategory) },
      budgeted: true,
    },
    {
      name: 'every record of a category',
      spec: {
        filter: { and: [{ field: 'category', op: 'eq', value: 'c07' }] },
        page: { size: 500 },
      },
      expect: { access: 'eq', index: 'category', ...page(500, perCategory) },
      budgeted: true,
    },
    {
      name: 'a range of an indexed integer',
      spec: {
        filter: {
          and: [
            { field: 'qty', op: 'gte', value: low },
            { field: 'qty', op: 'lt', value: low + width },
          ],
        },
      },
      expect: { access: 'range', index: 'qty', items: width, examined: width },
      budgeted: true,
    },
    {
      name: 'a page sorted by an indexed required field',
      spec: { sort: [{ field: 'qty', dir: 'asc' }], page: { size: 50 } },
      expect: { access: 'order', index: 'qty', ...page(50, rows) },
      budgeted: true,
    },
    {
      name: 'a decimal range, through its sort key',
      spec: {
        filter: { and: [{ field: 'price', op: 'gt', value: priceFloor }] },
        page: { size: 100 },
      },
      expect: { access: 'range', index: '_k_price', ...page(100, dear) },
      budgeted: true,
    },
    {
      name: 'equality on both fields of a compound index',
      spec: {
        filter: {
          and: [
            { field: 'category', op: 'eq', value: 'c07' },
            { field: 'qty', op: 'eq', value: 107 },
          ],
        },
      },
      expect: { access: 'eq', index: '[category+qty]', items: 1, examined: 1 },
      budgeted: true,
    },
    {
      name: 'a count over a category',
      spec: {
        filter: { and: [{ field: 'category', op: 'eq', value: 'c07' }] },
        aggregate: [{ fn: 'count', as: 'n' }],
        page: { size: 1 },
      },
      expect: {
        access: 'eq',
        index: 'category',
        items: 1,
        examined: perCategory,
        aggregates: { n: perCategory },
      },
      budgeted: true,
    },
    {
      name: 'control: equality on a field with no index reads every record',
      spec: { filter: { and: [{ field: 'name', op: 'eq', value: middleName }] } },
      expect: { access: 'scan', items: 1, examined: rows },
      budgeted: false,
    },
  ];
}

/** The queries on the 10 000 records of the dossier. */
export const BENCH_QUERIES: readonly BenchQuery[] = benchQueries(BENCH_ROWS);
