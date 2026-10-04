import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { BENCH_BUDGET_MS, BENCH_ROWS, benchQueries } from '../packages/testing/src/bench.js';
import type { BenchOptions, BenchResult } from './bench/bench-page.js';
import { benchBundle } from './bench/bundle.js';
import { RUNTIME_URL } from './targets.js';

/**
 * The criterion of lot 4 in the three real browsers (D-11): an indexed query on 10 000 records in
 * under 100 ms. The page fills a real IndexedDB through the Repository and runs the queries of the
 * bench (packages/testing/src/bench.ts); the plan and the records read prove the index, the clock
 * proves the budget.
 *
 * Scale: the WebKit that Playwright ships for Windows waits for a 15.6 ms timer tick for each
 * IndexedDB request (measured with raw IndexedDB, with no Dexie and no engine: 200 sequential
 * get and put took 6.1 s, against 49 ms in Chromium and 92 ms in Firefox), so 10 000 records take
 * minutes to write and a record at a time costs 14 ms to read through a cursor. There the bench
 * runs on 600 records: the plans, the records read and the results are checked, the clock is not
 * (it would measure the timer, not the index). Everywhere else it is the 10 000 records and the
 * clock.
 *
 * E2E_BENCH_SABOTAGE makes the negative controls of the gate (tools/gate-tests): `no-index`
 * declares no index (and runs only the query that needs one and the control that does not, once:\n * on a slow IndexedDB every other query would be a full scan), `few-rows` loads 100 records\n * instead of the scale of the run.
 */
const REDUCED_ROWS = 600;
const FIRST = benchQueries(BENCH_ROWS)[0]?.name ?? '';
const CONTROL = benchQueries(BENCH_ROWS).find((query) => !query.budgeted)?.name ?? '';
/** What the 
o-index sabotage runs. */
const UNINDEXED_RUN = [FIRST, CONTROL];
const sabotage = process.env['E2E_BENCH_SABOTAGE'];

async function serveBench(page: Page): Promise<void> {
  const script = await benchBundle();
  await page.route(`${RUNTIME_URL}/__bench__/**`, async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/bench.js')) {
      await route.fulfill({ status: 200, contentType: 'text/javascript', body: script });
    } else {
      await route.fulfill({
        status: 200,
        contentType: 'text/html',
        body: '<!doctype html><html><head><meta charset="utf-8"><title>bench</title></head><body><script src="/__bench__/bench.js"></script></body></html>',
      });
    }
  });
}

test.describe('Data bench', () => {
  test.describe.configure({ mode: 'serial' });
  // The bench of the dossier, then the one the browser could do: the same names, other figures.
  let scale = BENCH_ROWS;
  let result: BenchResult;

  test.beforeAll(async ({ browser }) => {
    const slowTimer = browser.browserType().name() === 'webkit' && process.platform === 'win32';
    scale = slowTimer ? REDUCED_ROWS : BENCH_ROWS;
    const options: BenchOptions =
      sabotage === 'no-index'
        ? { rows: scale, indexed: false, runs: 1, queries: UNINDEXED_RUN }
        : sabotage === 'few-rows'
          ? { rows: 100 }
          : { rows: scale };
    // The test timeout (120 s) covers this hook.
    const page = await browser.newPage();
    try {
      await serveBench(page);
      await page.goto(`${RUNTIME_URL}/__bench__/index.html`);
      result = await page.evaluate((given) => window.__bench.run(given), options);
    } finally {
      await page.close();
    }
  });

  test('holds the records it was filled with', () => {
    test.info().annotations.push({
      type: 'scale',
      description: `${String(scale)} records, filled in ${result.seedMs.toFixed(0)} ms`,
    });
    expect(result.rows).toBe(scale);
  });

  // The control comes first: in a serial group nothing runs after a failure, and the negative control
  // of the gate needs to see it run (and pass) when the spec of the index fails.
  const queries = [...benchQueries(BENCH_ROWS)].sort(
    (a, b) => Number(a.budgeted) - Number(b.budgeted),
  );
  for (const query of queries) {
    test(`${query.name}`, () => {
      const wanted = benchQueries(scale).find((item) => item.name === query.name);
      const found = result.queries.find((item) => item.name === query.name);
      test.skip(
        sabotage === 'no-index' && !UNINDEXED_RUN.includes(query.name),
        'not run by this control',
      );
      expect(wanted, 'the bench has this query').toBeDefined();
      expect(found, 'the page ran this query').toBeDefined();
      if (wanted === undefined || found === undefined) return;
      const maximum = Math.max(...found.durations);
      test.info().annotations.push({
        type: 'time',
        description: `max ${maximum.toFixed(1)} ms of ${String(found.durations.length)}, cold ${(found.durations[0] ?? 0).toFixed(1)} ms, read ${String(found.examined)} records, ${String(scale)} records`,
      });

      expect(found.plan.access).toBe(wanted.expect.access);
      if (wanted.expect.index !== undefined) expect(found.plan.index).toBe(wanted.expect.index);
      expect(found.items).toBe(wanted.expect.items);
      // An index reads about what it returns; the control, with none, reads everything.
      expect(found.examined).toBeLessThanOrEqual(wanted.expect.examined);
      if (wanted.expect.aggregates !== undefined) {
        expect(found.aggregates).toEqual(wanted.expect.aggregates);
      }
      if (wanted.budgeted && scale === BENCH_ROWS) expect(maximum).toBeLessThan(BENCH_BUDGET_MS);
    });
  }
});
