import type { Draft, FilterCondition, QuerySpec, RecordEnvelope } from '@acs/domain';
import { entityOf } from '@acs/testing';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createRecordAccess } from '../repository/record-access.js';
import { openEnvironment } from '../storage/database.js';
import type { OpenEnvironment } from '../storage/database.js';
import type { FieldInfo } from '../storage/layout.js';
import { buildLayout } from '../storage/layout.js';
import { computeAggregates } from './aggregate.js';
import { runQuery } from './run.js';

type Row = RecordEnvelope & Record<string, unknown>;

const article = entityOf(
  'article',
  {
    title: { type: 'string', required: true },
    body: { type: 'text' },
    qty: { type: 'integer', required: true },
    price: { type: 'decimal', options: { precision: 8, scale: 2 } },
  },
  [{ name: 'byQty', fields: ['qty'] }],
);

const DATA = [
  { title: 'Éléphant rose', body: 'grand animal gris', qty: 3, price: '10.50' },
  { title: 'Elephant bleu', body: 'petit', qty: 5, price: '0.10' },
  { title: 'Zèbre', body: 'rayé comme un éléphant', qty: 7, price: '0.20' },
  { title: 'Girafe', body: 'cou long', qty: 11 },
  { title: 'Lion rose', qty: 13, price: '19.99' },
];

let environment: OpenEnvironment;

beforeAll(async () => {
  const layout = buildLayout([article], []);
  if (!layout.ok) throw new Error(JSON.stringify(layout.error.details));
  const opened = await openEnvironment({
    projectKey: 'DEMO',
    environment: 'test',
    layout: layout.value,
    source: { indexedDB: new IDBFactory(), IDBKeyRange },
  });
  if (!opened.ok) throw new Error(opened.error.message);
  environment = opened.value;
  const articles = createRecordAccess(environment).entity<Row>('article');
  for (const data of DATA) {
    const saved = await articles.save(data as Draft<Row>);
    if (!saved.ok) throw new Error(JSON.stringify(saved.error));
  }
});
afterAll(() => environment.close());

async function run(spec: Omit<QuerySpec, 'source'>) {
  const result = await runQuery(environment, { source: 'article', ...spec });
  if (!result.ok) throw new Error(`${result.error.code}: ${result.error.message}`);
  return result.value;
}

async function refused(spec: Omit<QuerySpec, 'source'>): Promise<string> {
  const result = await runQuery(environment, { source: 'article', ...spec });
  if (result.ok) throw new Error('expected QUERY_INVALID');
  expect(result.error.code).toBe('QUERY_INVALID');
  return result.error.message;
}

const titles = (found: Awaited<ReturnType<typeof run>>) =>
  found.page.items.map((row) => String(row['title']));
const cond = (field: string, op: FilterCondition['op'], value: FilterCondition['value']) => ({
  field,
  op,
  value,
});
const search = (text: string, ...fields: string[]) => ({ search: { text, fields } });

describe('text search', () => {
  it('ignores case and accents, in the fields it is told to look in', async () => {
    expect(titles(await run(search('elephant', 'title')))).toEqual([
      'Éléphant rose',
      'Elephant bleu',
    ]);
    expect(titles(await run(search('ÉLÉPHANT', 'title')))).toEqual([
      'Éléphant rose',
      'Elephant bleu',
    ]);
    expect(titles(await run(search('elephant', 'title', 'body')))).toEqual([
      'Éléphant rose',
      'Elephant bleu',
      'Zèbre',
    ]);
  });

  it('wants every word, each in any of the fields', async () => {
    expect(titles(await run(search('rose elephant', 'title')))).toEqual(['Éléphant rose']);
    expect(titles(await run(search('rose', 'title')))).toEqual(['Éléphant rose', 'Lion rose']);
    expect(titles(await run(search('rayé zèbre', 'title', 'body')))).toEqual(['Zèbre']);
    expect(titles(await run(search('nothing', 'title', 'body')))).toEqual([]);
  });

  it('finds a part of a word, and skips a record that has no value in the field', async () => {
    expect(titles(await run(search('iraf', 'title')))).toEqual(['Girafe']);
    expect(titles(await run(search('rose', 'body')))).toEqual([]);
  });

  it('goes with a filter, a sort and pages', async () => {
    const found = await run({
      ...search('rose', 'title'),
      filter: { and: [cond('qty', 'gt', 3)] },
    });
    expect(titles(found)).toEqual(['Lion rose']);
    const sorted = await run({
      ...search('elephant', 'title', 'body'),
      sort: [{ field: 'qty', dir: 'desc' }],
      page: { size: 2 },
    });
    expect(titles(sorted)).toEqual(['Zèbre', 'Elephant bleu']);
    expect(sorted.page.nextCursor).toBeDefined();
  });

  it('is checked row by row, and the plan says so', async () => {
    const found = await run({
      ...search('rose', 'title'),
      filter: { and: [cond('qty', 'eq', 13)] },
    });
    expect(found.plan).toMatchObject({ access: 'eq', index: 'qty', residual: 1 });
    expect(found.examined).toBe(1);
    const alone = await run(search('rose', 'title'));
    expect(alone.plan).toMatchObject({ access: 'scan', residual: 1 });
    expect(alone.examined).toBe(DATA.length);
  });

  it.each([
    [search('   ', 'title'), 'between 1 and 10 words'],
    [search('a b c d e f g h i j k', 'title'), 'between 1 and 10 words'],
    [search('x'.repeat(201), 'title'), 'up to 200 characters'],
    [{ search: { text: 'x', fields: [] } }, 'between 1 and 10 fields'],
    [search('x', ...Array.from({ length: 11 }, () => 'title')), 'between 1 and 10 fields'],
    [search('x', 'zzz'), 'article.zzz: a search looks in string and text fields'],
    [search('x', 'qty'), 'article.qty: a search looks in string and text fields'],
  ])('refuses a bad search: %j', async (spec, message) => {
    expect(await refused(spec)).toContain(message);
  });
});

describe('aggregates (EF-BND-03)', () => {
  const aggregate = async (
    items: NonNullable<QuerySpec['aggregate']>,
    extra: Omit<QuerySpec, 'source' | 'aggregate'> = {},
  ) => (await run({ aggregate: items, ...extra })).page.aggregates;

  it('counts the records, or those that have a value', async () => {
    expect(
      await aggregate([
        { fn: 'count', as: 'all' },
        { fn: 'count', field: 'price', as: 'priced' },
      ]),
    ).toEqual({ all: 5, priced: 4 });
  });

  it('adds integers as a number, and decimals without the error of floating point', async () => {
    expect(await aggregate([{ fn: 'sum', field: 'qty', as: 'total' }])).toEqual({ total: 39 });
    expect(await aggregate([{ fn: 'sum', field: 'price', as: 'total' }])).toEqual({
      total: '30.79',
    });
    // 0.1 + 0.2 is not 0.3 in JavaScript: it is here.
    expect(0.1 + 0.2).not.toBe(0.3);
    expect(
      await aggregate([{ fn: 'sum', field: 'price', as: 'total' }], {
        filter: { and: [cond('qty', 'in', [5, 7])] },
      }),
    ).toEqual({ total: '0.30' });
  });

  it('averages at the scale of the field, half up; an integer average has two digits', async () => {
    expect(await aggregate([{ fn: 'avg', field: 'price', as: 'mean' }])).toEqual({ mean: '7.70' });
    expect(await aggregate([{ fn: 'avg', field: 'qty', as: 'mean' }])).toEqual({ mean: '7.80' });
  });

  it('finds the smallest and the largest, whatever the type', async () => {
    expect(
      await aggregate([
        { fn: 'min', field: 'qty', as: 'fewest' },
        { fn: 'max', field: 'qty', as: 'most' },
        { fn: 'min', field: 'price', as: 'cheapest' },
        { fn: 'max', field: 'price', as: 'dearest' },
        { fn: 'min', field: 'title', as: 'first' },
      ]),
    ).toEqual({ fewest: 3, most: 13, cheapest: '0.10', dearest: '19.99', first: 'Elephant bleu' });
  });

  it('is over everything that matches, not over the page, on every page', async () => {
    const spec = {
      aggregate: [
        { fn: 'count' as const, as: 'n' },
        { fn: 'sum' as const, field: 'qty', as: 'total' },
      ],
      sort: [{ field: 'qty', dir: 'asc' as const }],
    };
    const first = await run({ ...spec, page: { size: 2 } });
    expect(first.page.items).toHaveLength(2);
    expect(first.page.aggregates).toEqual({ n: 5, total: 39 });
    const second = await run({ ...spec, page: { size: 2, cursor: first.page.nextCursor ?? '' } });
    expect(second.page.items.map((row) => row['qty'])).toEqual([7, 11]);
    expect(second.page.aggregates).toEqual({ n: 5, total: 39 });
    const filtered = await run({ ...spec, filter: { and: [cond('qty', 'gt', 5)] } });
    expect(filtered.page.aggregates).toEqual({ n: 3, total: 31 });
  });

  it('says what there is to say about nothing', async () => {
    expect(
      await aggregate(
        [
          { fn: 'count', as: 'n' },
          { fn: 'sum', field: 'qty', as: 'qty' },
          { fn: 'sum', field: 'price', as: 'price' },
          { fn: 'avg', field: 'price', as: 'mean' },
          { fn: 'min', field: 'qty', as: 'least' },
          { fn: 'max', field: 'title', as: 'last' },
        ],
        { filter: { and: [cond('qty', 'gt', 100)] } },
      ),
    ).toEqual({ n: 0, qty: 0, price: '0.00', mean: null, least: null, last: null });
  });

  it('keeps the digits of an integer sum that does not fit a number', () => {
    const info = { key: 'n', type: 'integer' } as FieldInfo;
    const rows = [{ n: Number.MAX_SAFE_INTEGER }, { n: Number.MAX_SAFE_INTEGER }];
    expect(computeAggregates(rows, [{ fn: 'sum', info, as: 's' }])).toEqual({
      s: '18014398509481982',
    });
  });

  it('adds no aggregate when none is asked for', async () => {
    expect((await run({})).page.aggregates).toBeUndefined();
  });

  it.each([
    [
      [
        { fn: 'count', as: 'n' },
        { fn: 'sum', field: 'qty', as: 'n' },
      ],
      'a result is named',
    ],
    [[{ fn: 'count', as: 'Total!' }], 'a result is named'],
    [[{ fn: 'sum', as: 'total' }], 'sum needs a field'],
    [[{ fn: 'sum', field: 'title', as: 'total' }], 'sum needs an integer or a decimal field'],
    [[{ fn: 'avg', field: 'body', as: 'mean' }], 'avg needs an integer or a decimal field'],
    [[{ fn: 'min', field: 'zzz', as: 'least' }], 'article.zzz: the entity has no such field'],
    [[{ fn: 'count', field: 'zzz', as: 'n' }], 'article.zzz: the entity has no such field'],
  ])('refuses a bad aggregate: %j', async (items, message) => {
    expect(await refused({ aggregate: items as NonNullable<QuerySpec['aggregate']> })).toContain(
      message,
    );
  });
});
