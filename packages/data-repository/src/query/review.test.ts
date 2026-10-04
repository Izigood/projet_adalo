import type { Draft, RecordEnvelope } from '@acs/domain';
import { entityOf } from '@acs/testing';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { afterEach, describe, expect, it } from 'vitest';
import { createDataStore } from '../repository/data-store.js';
import { openEnvironment } from '../storage/database.js';
import type { OpenEnvironment } from '../storage/database.js';
import { buildLayout } from '../storage/layout.js';
import { runQuery } from './run.js';

/** Findings of the review of lot 4 that concern the engine of queries and the records it reads. */
type Row = RecordEnvelope & Record<string, unknown>;

const opened: OpenEnvironment[] = [];
afterEach(() => {
  for (const environment of opened.splice(0)) environment.close();
});

async function boot(entity: ReturnType<typeof entityOf>, rows: Record<string, unknown>[]) {
  const layout = buildLayout([entity], []);
  if (!layout.ok) throw new Error(JSON.stringify(layout.error.details));
  const result = await openEnvironment({
    projectKey: 'DEMO',
    environment: 'test',
    layout: layout.value,
    source: { indexedDB: new IDBFactory(), IDBKeyRange },
  });
  if (!result.ok) throw new Error(result.error.message);
  opened.push(result.value);
  const store = createDataStore(result.value);
  for (const row of rows) {
    const saved = await store.repository<Row>(entity.key).save(row as Draft<Row>);
    if (!saved.ok) throw new Error(JSON.stringify(saved.error));
  }
  return { environment: result.value, store };
}

const ask = async (environment: OpenEnvironment, source: string, spec: Record<string, unknown>) => {
  const result = await runQuery(environment, { source, ...spec });
  if (!result.ok) throw new Error(`${result.error.code}: ${result.error.message}`);
  return result.value;
};

describe('a compound index is not a way into the rows when a field of it can be missing', () => {
  // `b` is optional: IndexedDB does not index a record that has no `b`, so an index on [a, b]
  // does not hold every record that has an `a`.
  const loose = entityOf(
    'loose',
    { a: { type: 'string', required: true }, b: { type: 'integer' } },
    [{ name: 'byAB', fields: ['a', 'b'] }],
  );
  const tight = entityOf(
    'tight',
    { a: { type: 'string', required: true }, b: { type: 'integer', required: true } },
    [{ name: 'byAB', fields: ['a', 'b'] }],
  );

  it('finds every record of an `a`, those with no `b` too', async () => {
    const { environment } = await boot(loose, [{ a: 'x', b: 1 }, { a: 'x' }, { a: 'y', b: 2 }]);
    const found = await ask(environment, 'loose', {
      filter: { and: [{ field: 'a', op: 'eq', value: 'x' }] },
    });
    expect(found.page.items).toHaveLength(2);
    expect(found.plan.access).not.toBe('prefix');
  });

  it('still uses the index when both its fields are in every record', async () => {
    const { environment } = await boot(tight, [
      { a: 'x', b: 1 },
      { a: 'x', b: 2 },
      { a: 'y', b: 3 },
    ]);
    const found = await ask(environment, 'tight', {
      filter: { and: [{ field: 'a', op: 'eq', value: 'x' }] },
    });
    expect(found.page.items).toHaveLength(2);
    expect(found.plan).toMatchObject({ access: 'prefix', index: '[a+b]' });
  });

  it('uses it for an equality on both fields, which no record without a `b` can satisfy', async () => {
    const { environment } = await boot(loose, [{ a: 'x', b: 1 }, { a: 'x' }]);
    const found = await ask(environment, 'loose', {
      filter: {
        and: [
          { field: 'a', op: 'eq', value: 'x' },
          { field: 'b', op: 'eq', value: 1 },
        ],
      },
    });
    expect(found.plan).toMatchObject({ access: 'eq', index: '[a+b]' });
    expect(found.page.items).toHaveLength(1);
  });
});

describe('a field may be named like a member of Object.prototype', () => {
  // READABLE_KEY_PATTERN allows `constructor` and `toString`, and a manifest that is imported is
  // not trusted: reading `record[key]` finds the inherited member of a record that has no such field.
  const odd = entityOf(
    'odd',
    {
      name: { type: 'string', required: true },
      constructor: { type: 'string' },
      toString: { type: 'boolean' },
      valueOf: { type: 'decimal', options: { precision: 8, scale: 2 } },
      hasOwnProperty: { type: 'integer' },
    },
    [
      { name: 'byToString', fields: ['toString'] },
      { name: 'byValueOf', fields: ['valueOf'] },
    ],
  );
  const rows: Record<string, unknown>[] = [
    { name: 'none' },
    { name: 'some', constructor: 'c', toString: false, valueOf: '5.00', hasOwnProperty: 3 },
    { name: 'flagged', toString: true },
  ];

  it('saves a record that leaves such fields out, and gives back what was put in', async () => {
    const { store } = await boot(odd, rows);
    const page = await store.repository<Row>('odd').query({ source: 'odd' });
    const none = page.items.find((row) => row['name'] === 'none');
    expect(none && Object.hasOwn(none, 'constructor')).toBe(false);
    expect(none && Object.hasOwn(none, 'toString')).toBe(false);
    const some = page.items.find((row) => row['name'] === 'some');
    expect(some).toMatchObject({
      constructor: 'c',
      toString: false,
      valueOf: '5.00',
      hasOwnProperty: 3,
    });
  });

  it('does not index a value a record does not have', async () => {
    const { environment } = await boot(odd, rows);
    const none = await ask(environment, 'odd', {
      filter: { and: [{ field: 'toString', op: 'eq', value: false }] },
    });
    expect(none.page.items.map((row) => row['name'])).toEqual(['some']);
    const dear = await ask(environment, 'odd', {
      filter: { and: [{ field: 'valueOf', op: 'gte', value: '0' }] },
    });
    expect(dear.page.items.map((row) => row['name'])).toEqual(['some']);
  });

  it('filters, sorts, searches and aggregates on them', async () => {
    const { environment } = await boot(odd, rows);
    const without = await ask(environment, 'odd', {
      filter: { and: [{ field: 'constructor', op: 'ne', value: 'c' }] },
      sort: [{ field: 'name', dir: 'asc' }],
    });
    expect(without.page.items.map((row) => row['name'])).toEqual(['flagged', 'none']);
    // A comparison must not find the function a record inherits where it has no value.
    const above = await ask(environment, 'odd', {
      filter: { and: [{ field: 'hasOwnProperty', op: 'gt', value: 0 }] },
    });
    expect(above.page.items.map((row) => row['name'])).toEqual(['some']);
    const sorted = await ask(environment, 'odd', {
      sort: [{ field: 'hasOwnProperty', dir: 'asc' }],
    });
    // Records with no value come first, and are told apart by their id (their order of creation).
    expect(sorted.page.items.map((row) => row['name'])).toEqual(['none', 'flagged', 'some']);
    const found = await ask(environment, 'odd', {
      search: { text: 'c', fields: ['constructor'] },
    });
    expect(found.page.items.map((row) => row['name'])).toEqual(['some']);
    const counted = await ask(environment, 'odd', {
      aggregate: [
        { fn: 'count', field: 'hasOwnProperty', as: 'withCount' },
        { fn: 'sum', field: 'hasOwnProperty', as: 'total' },
        { fn: 'max', field: 'valueOf', as: 'top' },
      ],
    });
    expect(counted.page.aggregates).toEqual({ withCount: 1, total: 3, top: '5.00' });
  });
});

describe('a query on an entity the project does not have', () => {
  it('is a QUERY_INVALID, not a storage failure', async () => {
    const { environment } = await boot(entityOf('thing', { a: { type: 'string' } }), []);
    const result = await runQuery(environment, { source: 'nothing' });
    expect(result.ok ? '' : result.error.code).toBe('QUERY_INVALID');
    expect(result.ok ? '' : result.error.message).toContain('nothing');
  });
});
