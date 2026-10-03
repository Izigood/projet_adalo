import { MAX_PAGE_SIZE } from '@acs/domain';
import type { Draft, FilterCondition, QuerySpec, RecordEnvelope } from '@acs/domain';
import { entityOf } from '@acs/testing';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import fc from 'fast-check';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createRecordAccess } from '../repository/record-access.js';
import { openEnvironment } from '../storage/database.js';
import type { OpenEnvironment } from '../storage/database.js';
import { buildLayout } from '../storage/layout.js';
import { runQuery } from './run.js';
import type { QueryRow } from './run.js';

type Row = RecordEnvelope & Record<string, unknown>;

const item = entityOf(
  'item',
  {
    name: { type: 'string', required: true },
    qty: { type: 'integer', required: true },
    category: { type: 'string', required: true },
    price: { type: 'decimal', options: { precision: 10, scale: 2 } },
    done: { type: 'boolean' },
    tags: {
      type: 'multiChoice',
      options: {
        source: {
          kind: 'list',
          values: [
            { value: 'x', label: 'X' },
            { value: 'y', label: 'Y' },
          ],
        },
      },
    },
  },
  [
    { name: 'byCategory', fields: ['category'] },
    { name: 'byQty', fields: ['qty'] },
    { name: 'byPrice', fields: ['price'] },
    { name: 'byDone', fields: ['done'] },
    { name: 'byTag', fields: ['tags'] },
    { name: 'byCatQty', fields: ['category', 'qty'] },
  ],
);

const COUNT = 40;
let environment: OpenEnvironment;
const rows: Row[] = [];

beforeAll(async () => {
  const layout = buildLayout([item], []);
  if (!layout.ok) throw new Error(JSON.stringify(layout.error.details));
  const opened = await openEnvironment({
    projectKey: 'DEMO',
    environment: 'test',
    layout: layout.value,
    source: { indexedDB: new IDBFactory(), IDBKeyRange },
  });
  if (!opened.ok) throw new Error(opened.error.message);
  environment = opened.value;
  const items = createRecordAccess(environment).entity<Row>('item');
  for (let i = 0; i < COUNT; i += 1) {
    const saved = await items.save({
      name: `item-${String(i).padStart(2, '0')}`,
      qty: i,
      category: ['a', 'b', 'c'][i % 3],
      ...(i % 4 === 0 ? {} : { price: (i * 1.25).toFixed(2) }),
      done: i % 2 === 0,
      tags: i % 5 === 0 ? ['x'] : i % 7 === 0 ? ['x', 'y'] : [],
    } as Draft<Row>);
    if (!saved.ok) throw new Error(JSON.stringify(saved.error));
    rows.push(saved.value);
  }
});
afterAll(() => environment.close());

async function run(spec: Omit<QuerySpec, 'source'>) {
  const result = await runQuery(environment, { source: 'item', ...spec });
  if (!result.ok) throw new Error(`${result.error.code}: ${result.error.message}`);
  return result.value;
}

async function refused(spec: Omit<QuerySpec, 'source'>): Promise<string> {
  const result = await runQuery(environment, { source: 'item', ...spec });
  if (result.ok) throw new Error('expected QUERY_INVALID');
  expect(result.error.code).toBe('QUERY_INVALID');
  return result.error.message;
}

const where = (...and: FilterCondition[]) => ({ filter: { and } });
const cond = (field: string, op: FilterCondition['op'], value: FilterCondition['value']) => ({
  field,
  op,
  value,
});
const names = (items: readonly QueryRow[]) => items.map((row) => String(row['name']));

describe('the way into the rows: an index when one serves the filter (EF-BND-03)', () => {
  it('equality on an indexed field reads only the rows it returns', async () => {
    const found = await run(where(cond('category', 'eq', 'a')));
    expect(found.plan).toEqual({ access: 'eq', index: 'category', residual: 0, sort: 'none' });
    expect(found.page.items).toHaveLength(14);
    expect(found.examined).toBe(14);
  });

  it('negative control: the same on a field with no index reads the whole store', async () => {
    const found = await run(where(cond('name', 'eq', 'item-05')));
    expect(found.plan).toMatchObject({ access: 'scan', residual: 1 });
    expect(found.page.items).toHaveLength(1);
    expect(found.examined).toBe(COUNT);
  });

  it('a list, a range and a prefix go through the index too', async () => {
    const list = await run(where(cond('qty', 'in', [1, 2, 3])));
    expect(list.plan).toMatchObject({ access: 'in', index: 'qty' });
    expect([list.page.items.length, list.examined]).toEqual([3, 3]);

    const range = await run(where(cond('qty', 'gte', 10), cond('qty', 'lt', 20)));
    expect(range.plan).toMatchObject({ access: 'range', index: 'qty', residual: 0 });
    expect(range.page.items.map((row) => row['qty'])).toEqual([
      10, 11, 12, 13, 14, 15, 16, 17, 18, 19,
    ]);
    expect(range.examined).toBe(10);

    const prefix = await run(where(cond('category', 'startsWith', 'b')));
    expect(prefix.plan).toMatchObject({ access: 'startsWith', index: 'category' });
    expect(prefix.examined).toBe(13);
  });

  it('a compound index serves equality on all its fields, and on its first', async () => {
    const both = await run(where(cond('category', 'eq', 'a'), cond('qty', 'eq', 3)));
    expect(both.plan).toMatchObject({ access: 'eq', index: '[category+qty]', residual: 0 });
    expect([both.page.items.length, both.examined]).toEqual([1, 1]);

    const first = await run(
      where(cond('category', 'eq', 'b'), cond('name', 'startsWith', 'item-1')),
    );
    expect(first.plan).toMatchObject({ access: 'eq', index: 'category', residual: 1 });
  });

  it('a multiple choice is searched by element', async () => {
    const found = await run(where(cond('tags', 'eq', 'x')));
    expect(found.plan).toMatchObject({ access: 'eq', index: 'tags' });
    expect(found.page.items).toHaveLength(12);
    expect(found.examined).toBe(12);
    const either = await run(where(cond('tags', 'in', ['x', 'y'])));
    expect(either.page.items).toHaveLength(12);
  });

  it('a multiple choice checked row by row still means "contains" (the index serves another condition)', async () => {
    const held = (row: Row) => (row['tags'] as string[] | undefined) ?? [];
    const has = await run(where(cond('category', 'eq', 'b'), cond('tags', 'eq', 'y')));
    expect(has.plan).toMatchObject({ index: 'category', residual: 1 });
    expect(has.page.items.map((row) => row['qty'])).toEqual(
      rows
        .filter((row) => row['category'] === 'b' && held(row).includes('y'))
        .map((row) => row['qty']),
    );
    expect(has.page.items.length).toBeGreaterThan(0);
    const lacks = await run(where(cond('category', 'eq', 'b'), cond('tags', 'ne', 'x')));
    expect(lacks.page.items).toHaveLength(
      rows.filter((row) => row['category'] === 'b' && !held(row).includes('x')).length,
    );
    const either = await run(where(cond('category', 'eq', 'b'), cond('tags', 'in', ['y', 'q'])));
    expect(either.page.items.length).toBe(has.page.items.length);
  });

  it('a decimal goes through its sort key: the order is numeric, not textual', async () => {
    const found = await run(where(cond('price', 'gt', '10')));
    expect(found.plan).toMatchObject({ access: 'range', index: '_k_price', residual: 0 });
    const expected = rows.filter((row) => row['price'] !== undefined && Number(row['price']) > 10);
    expect(found.page.items).toHaveLength(expected.length);
    expect(found.examined).toBe(expected.length);
    expect('9.00' > '10.00').toBe(true);
    // A value the field cannot hold (3 decimals) is not an index key: it is checked row by row.
    const fine = await run(where(cond('price', 'gt', '9.995')));
    expect(fine.plan).toMatchObject({ access: 'scan', residual: 1 });
    expect(fine.page.items.length).toBe(rows.filter((r) => Number(r['price']) > 9.995).length);
  });

  it('a boolean goes through its key', async () => {
    const found = await run(where(cond('done', 'eq', true)));
    expect(found.plan).toMatchObject({ access: 'eq', index: '_k_done' });
    expect([found.page.items.length, found.examined]).toEqual([20, 20]);
  });

  it('not-equal cannot use an index: it is checked row by row, and keeps absent values', async () => {
    const found = await run(where(cond('qty', 'ne', 5)));
    expect(found.plan).toMatchObject({ access: 'scan', residual: 1 });
    expect(found.page.items).toHaveLength(COUNT - 1);
    const noPrice = await run(where(cond('price', 'ne', '1.25')));
    expect(noPrice.page.items).toHaveLength(COUNT - 1);
  });

  it('an empty list matches nothing', async () => {
    expect((await run(where(cond('qty', 'in', [])))).page.items).toEqual([]);
  });
});

describe('sort', () => {
  it('walks the index of a required field and stops as soon as the page is full', async () => {
    const found = await run({ sort: [{ field: 'qty', dir: 'asc' }], page: { size: 5 } });
    expect(found.plan).toEqual({ access: 'order', index: 'qty', residual: 0, sort: 'index' });
    expect(found.page.items.map((row) => row['qty'])).toEqual([0, 1, 2, 3, 4]);
    expect(found.examined).toBe(6);
    const down = await run({ sort: [{ field: 'qty', dir: 'desc' }], page: { size: 3 } });
    expect(down.page.items.map((row) => row['qty'])).toEqual([39, 38, 37]);
  });

  it('sorts in memory on an optional field, absent values first, numbers as numbers', async () => {
    const found = await run({ sort: [{ field: 'price', dir: 'asc' }], page: { size: 14 } });
    expect(found.plan.sort).toBe('memory');
    expect(found.page.items.slice(0, 10).every((row) => row['price'] === undefined)).toBe(true);
    const priced = (await run({ sort: [{ field: 'price', dir: 'asc' }] })).page.items
      .filter((row) => row['price'] !== undefined)
      .map((row) => Number(row['price']));
    expect(priced).toEqual([...priced].sort((a, b) => a - b));
  });

  it('keeps the order when the filter uses another index', async () => {
    const found = await run({
      ...where(cond('category', 'eq', 'a')),
      sort: [{ field: 'qty', dir: 'desc' }],
    });
    expect(found.plan).toMatchObject({ access: 'eq', index: 'category', sort: 'memory' });
    const qty = found.page.items.map((row) => Number(row['qty']));
    expect(qty).toEqual([...qty].sort((a, b) => b - a));
  });

  it('sorts on several fields', async () => {
    const found = await run({
      sort: [
        { field: 'category', dir: 'desc' },
        { field: 'qty', dir: 'asc' },
      ],
      page: { size: 4 },
    });
    expect(
      found.page.items.map((row) => `${String(row['category'])}${String(row['qty'])}`),
    ).toEqual(['c2', 'c5', 'c8', 'c11']);
  });
});

describe('pages', () => {
  const sorted = { sort: [{ field: 'qty', dir: 'asc' as const }] };

  it('a cursor leads to the next page, and the last page has none', async () => {
    const seen: string[] = [];
    let cursor: string | undefined;
    let pages = 0;
    do {
      const found = await run({ ...sorted, page: { size: 7, ...(cursor ? { cursor } : {}) } });
      expect(found.page.items.length).toBeLessThanOrEqual(7);
      seen.push(...names(found.page.items));
      cursor = found.page.nextCursor;
      pages += 1;
    } while (cursor !== undefined && pages < 20);
    expect(pages).toBe(6);
    expect(seen).toEqual(rows.map((row) => String(row['name'])));
  });

  it('gives the first 500 rows when no page is asked for, and refuses a size out of range', async () => {
    const all = await run({});
    expect(all.page.items).toHaveLength(COUNT);
    expect(all.page.nextCursor).toBeUndefined();
    for (const size of [0, -1, MAX_PAGE_SIZE + 1, 1.5]) {
      expect(await refused({ page: { size } })).toContain('between 1 and 500');
    }
    expect((await run({ page: { size: MAX_PAGE_SIZE } })).page.items).toHaveLength(COUNT);
  });

  it('refuses a cursor that is garbage or belongs to another query', async () => {
    const first = await run({ ...sorted, page: { size: 5 } });
    const cursor = first.page.nextCursor ?? '';
    expect(await refused({ ...sorted, page: { size: 5, cursor: 'not a cursor' } })).toContain(
      'not valid',
    );
    expect(
      await refused({ ...where(cond('qty', 'gt', 3)), ...sorted, page: { size: 5, cursor } }),
    ).toContain('another query');
    expect((await run({ ...sorted, page: { size: 9, cursor } })).page.items).toHaveLength(9);
  });
});

describe('projection', () => {
  it('returns the asked fields and the id, and never the derived keys', async () => {
    const found = await run({ projection: ['name', 'price'], page: { size: 3 } });
    for (const row of found.page.items) {
      expect(Object.keys(row).every((key) => ['id', 'name', 'price'].includes(key))).toBe(true);
    }
    const whole = await run({ page: { size: 1 } });
    expect(Object.keys(whole.page.items[0] ?? {}).some((key) => key.startsWith('_k_'))).toBe(false);
  });
});

describe('a query that cannot be run is QUERY_INVALID, with the field and the reason', () => {
  it.each([
    [where(cond('nothing', 'eq', 1)), 'item.nothing: the entity has no such field'],
    [where(cond('done', 'gt', true)), 'a boolean field cannot be filtered with gt'],
    [where(cond('qty', 'startsWith', '1')), 'an integer field cannot be filtered with startsWith'],
    [where(cond('qty', 'eq', '3')), 'the value is not an integer'],
    [where(cond('qty', 'in', 3)), 'in takes a list'],
    [where(cond('qty', 'in', [1, 'a'])), 'a value of the list is not an integer'],
    [where(cond('tags', 'gt', 'x')), 'a multiChoice field cannot be filtered with gt'],
    [where(cond('price', 'gt', 'abc')), 'the value is not a decimal'],
    [{ sort: [{ field: 'tags', dir: 'asc' as const }] }, 'cannot be sorted on'],
    [{ sort: [{ field: 'zzz', dir: 'asc' as const }] }, 'cannot be sorted on'],
    [{ projection: ['zzz'] }, 'item.zzz: the entity has no such field'],
    [{ where: 'qty > 3' }, 'expression engine'],
    [{ search: { text: 'x', fields: ['name'] } }, 'not available yet'],
    [{ aggregate: [{ fn: 'count' as const, as: 'n' }] }, 'not available yet'],
  ])('%j', async (spec, message) => {
    expect(await refused(spec as Omit<QuerySpec, 'source'>)).toContain(message);
  });

  it('names an entity the project does not have', async () => {
    const result = await runQuery(environment, { source: 'nothing' });
    expect(result.ok).toBe(false);
  });
});

// A brute-force oracle written independently of the engine, from the raw rows.
type Atom = { field: string; op: FilterCondition['op']; value: FilterCondition['value'] };

function numeric(field: string, value: unknown): number | string | boolean {
  return field === 'price' ? Number(value) : (value as number | string | boolean);
}

function oracleMatch(row: Row, atom: Atom): boolean {
  const actual = row[atom.field];
  if (actual === undefined) return atom.op === 'ne';
  const held = Array.isArray(actual) ? actual : [actual];
  const wanted = Array.isArray(atom.value) ? atom.value : [atom.value];
  const one = (a: unknown, b: unknown) => numeric(atom.field, a) === numeric(atom.field, b);
  const v = numeric(atom.field, actual);
  const w = numeric(atom.field, atom.value);
  switch (atom.op) {
    case 'eq':
      return held.some((a) => one(a, atom.value));
    case 'ne':
      return !held.some((a) => one(a, atom.value));
    case 'in':
      return held.some((a) => wanted.some((b) => one(a, b)));
    case 'gt':
      return v > w;
    case 'gte':
      return v >= w;
    case 'lt':
      return v < w;
    case 'lte':
      return v <= w;
    case 'startsWith':
      return String(actual).startsWith(String(atom.value));
  }
}

const atoms: fc.Arbitrary<Atom> = fc.oneof(
  fc.record({
    field: fc.constant('category'),
    op: fc.constantFrom('eq', 'ne', 'gt', 'gte', 'lt', 'lte', 'startsWith') as fc.Arbitrary<
      Atom['op']
    >,
    value: fc.constantFrom('a', 'b', 'z'),
  }),
  fc.record({
    field: fc.constant('category'),
    op: fc.constant('in' as const),
    value: fc.constantFrom(['a', 'c'], ['b'], []),
  }),
  fc.record({
    field: fc.constant('qty'),
    op: fc.constantFrom('eq', 'ne', 'gt', 'gte', 'lt', 'lte') as fc.Arbitrary<Atom['op']>,
    value: fc.integer({ min: -1, max: 45 }),
  }),
  fc.record({
    field: fc.constant('qty'),
    op: fc.constant('in' as const),
    value: fc.array(fc.integer({ min: 0, max: 45 }), { maxLength: 4 }),
  }),
  fc.record({
    field: fc.constant('price'),
    op: fc.constantFrom('eq', 'ne', 'gt', 'gte', 'lt', 'lte') as fc.Arbitrary<Atom['op']>,
    value: fc.constantFrom('0.00', '5', '10.00', '12.5', '25', '49.375', '100'),
  }),
  fc.record({
    field: fc.constant('done'),
    op: fc.constantFrom('eq', 'ne') as fc.Arbitrary<Atom['op']>,
    value: fc.boolean(),
  }),
  fc.record({
    field: fc.constant('tags'),
    op: fc.constantFrom('eq', 'ne') as fc.Arbitrary<Atom['op']>,
    value: fc.constantFrom('x', 'y', 'q'),
  }),
  fc.record({
    field: fc.constant('name'),
    op: fc.constantFrom('eq', 'ne', 'gt', 'lte', 'startsWith') as fc.Arbitrary<Atom['op']>,
    value: fc.constantFrom('item-05', 'item-1', 'item-20', 'zz'),
  }),
);

const sortKeys = fc.array(
  fc.record({
    field: fc.constantFrom('qty', 'price', 'category', 'name', 'done'),
    dir: fc.constantFrom('asc', 'desc') as fc.Arbitrary<'asc' | 'desc'>,
  }),
  { maxLength: 2 },
);

function oracleOrder(matching: Row[], sort: { field: string; dir: 'asc' | 'desc' }[]): string[] {
  const cmp = (field: string, a: Row, b: Row): number => {
    const x = a[field];
    const y = b[field];
    if (x === undefined || y === undefined)
      return Number(x !== undefined) - Number(y !== undefined);
    const p = numeric(field, x);
    const q = numeric(field, y);
    return p < q ? -1 : p > q ? 1 : 0;
  };
  return [...matching]
    .sort((a, b) => {
      for (const key of sort) {
        const order = cmp(key.field, a, b);
        if (order !== 0) return key.dir === 'asc' ? order : -order;
      }
      const byId = a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
      return sort[0]?.dir === 'desc' ? -byId : byId;
    })
    .map((row) => row.id);
}

describe('against a brute-force oracle (property)', () => {
  it('every page of every query holds exactly the rows the oracle says, in order', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(atoms, { maxLength: 3 }),
        sortKeys,
        fc.integer({ min: 3, max: 17 }),
        async (filter, sort, size) => {
          const matching = rows.filter((row) => filter.every((atom) => oracleMatch(row, atom)));
          const ids: string[] = [];
          let cursor: string | undefined;
          let pages = 0;
          do {
            const found = await run({
              ...(filter.length > 0 ? { filter: { and: filter } } : {}),
              ...(sort.length > 0 ? { sort } : {}),
              page: { size, ...(cursor === undefined ? {} : { cursor }) },
            });
            expect(found.page.items.length).toBeLessThanOrEqual(size);
            ids.push(...found.page.items.map((row) => row.id));
            cursor = found.page.nextCursor;
            pages += 1;
          } while (cursor !== undefined && pages < 20);
          expect(new Set(ids).size).toBe(ids.length);
          if (sort.length > 0) expect(ids).toEqual(oracleOrder(matching, sort));
          else expect([...ids].sort()).toEqual(matching.map((row) => row.id).sort());
        },
      ),
      { numRuns: 120 },
    );
  }, 120_000);
});
