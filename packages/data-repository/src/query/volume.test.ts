import type { Draft, RecordEnvelope } from '@acs/domain';
import { BENCH_BUDGET_MS, BENCH_QUERIES, BENCH_ROWS, benchEntity, benchRow } from '@acs/testing';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDataStore } from '../repository/data-store.js';
import type { LocalDataStore } from '../repository/data-store.js';
import { openEnvironment } from '../storage/database.js';
import type { OpenEnvironment } from '../storage/database.js';
import { buildLayout } from '../storage/layout.js';
import { runQuery } from './run.js';

/**
 * The criterion of lot 4: an indexed query on 10 000 records in under 100 ms. Here under
 * fake-indexeddb, which is not a browser; the same bench runs in the three real browsers
 * (e2e/data-bench.spec.ts). The plan and the number of records read prove the index; the clock
 * proves the budget.
 */
type Row = RecordEnvelope & Record<string, unknown>;

const RUNS = 5;
/** A page reads at most one record more than it returns (50 or 100, and one to know there is more). */
const PAGE_READ_LIMIT = 101;
let environment: OpenEnvironment;
let store: LocalDataStore;
const seeding = { ms: 0, rows: 0 };

async function fill(
  indexed: boolean,
  rows: number,
  measure?: { ms: number; rows: number },
): Promise<OpenEnvironment> {
  const layout = buildLayout([benchEntity({ indexed })], []);
  if (!layout.ok) throw new Error(JSON.stringify(layout.error.details));
  const opened = await openEnvironment({
    projectKey: 'BENCH',
    environment: 'test',
    layout: layout.value,
    source: { indexedDB: new IDBFactory(), IDBKeyRange },
  });
  if (!opened.ok) throw new Error(opened.error.message);
  store = createDataStore(opened.value);
  const started = performance.now();
  // The rows go in through the Repository, in transactions of 500: all the constraints are checked.
  for (let from = 0; from < rows; from += 500) {
    await store.access.transaction(async (uow) => {
      for (let i = from; i < Math.min(from + 500, rows); i += 1) {
        const saved = await uow.of<Row>('item').save(benchRow(i) as Draft<Row>);
        if (!saved.ok) throw new Error(JSON.stringify(saved.error));
      }
    });
  }
  if (measure !== undefined) {
    measure.ms = performance.now() - started;
    measure.rows = rows;
  }
  return opened.value;
}

beforeAll(async () => {
  environment = await fill(true, BENCH_ROWS, seeding);
}, 120_000);
afterAll(() => environment.close());

describe(`${BENCH_ROWS} records`, () => {
  it('are all there', async () => {
    const found = await runQuery(environment, {
      source: 'item',
      aggregate: [{ fn: 'count', as: 'n' }],
      page: { size: 1 },
    });
    expect(found.ok && found.value.page.aggregates).toEqual({ n: BENCH_ROWS });
  });

  it.each(BENCH_QUERIES.filter((query) => query.budgeted))(
    'go through the index, and a page comes in under the budget: $name',
    async ({ spec, expect: wanted }) => {
      const durations: number[] = [];
      for (let run = 0; run < RUNS; run += 1) {
        const started = performance.now();
        const result = await runQuery(environment, { source: 'item', ...spec });
        durations.push(performance.now() - started);
        if (!result.ok) throw new Error(result.error.message);
        expect(result.value.plan.access).toBe(wanted.access);
        if (wanted.index !== undefined) expect(result.value.plan.index).toBe(wanted.index);
        expect(result.value.page.items).toHaveLength(wanted.items);
        expect(result.value.examined).toBeLessThanOrEqual(wanted.examined);
        if (wanted.aggregates !== undefined) {
          expect(result.value.page.aggregates).toEqual(wanted.aggregates);
        }
      }
      // The clock is held to the budget for a page (at most 101 records read). The queries that
      // build 500 records take 60 to 75 ms under fake-indexeddb, which is JavaScript and not a
      // browser, too close to 100 ms to be a fair test on a loaded machine: their time is held to
      // the budget in the real browsers (e2e/data-bench.spec.ts). Their plan and the records they
      // read are checked here, as for all of them.
      if (wanted.examined <= PAGE_READ_LIMIT) {
        expect(Math.max(...durations)).toBeLessThan(BENCH_BUDGET_MS);
      }
    },
  );

  it('negative control: a field with no index is read record by record, which the examined count shows', async () => {
    const control = BENCH_QUERIES.find((query) => !query.budgeted);
    if (control === undefined) throw new Error('the bench has no control');
    const result = await runQuery(environment, { source: 'item', ...control.spec });
    if (!result.ok) throw new Error(result.error.message);
    expect(result.value.plan.access).toBe('scan');
    expect(result.value.examined).toBe(BENCH_ROWS);
    expect(result.value.page.items).toHaveLength(1);
  });
});

describe('the bench measures the index and not the machine', () => {
  it('the same queries against records with no index declared do not come back as index lookups', async () => {
    const bare = await fill(false, 1000);
    try {
      const equality = BENCH_QUERIES[0];
      if (equality === undefined) throw new Error('no query');
      const result = await runQuery(bare, { source: 'item', ...equality.spec });
      if (!result.ok) throw new Error(result.error.message);
      expect(result.value.plan.access).toBe('scan');
      expect(result.value.examined).toBeGreaterThan(equality.expect.examined);
    } finally {
      bare.close();
    }
  }, 120_000);

  it('went in through the Repository, all of them', () => {
    expect(seeding.rows).toBe(BENCH_ROWS);
  });
});
