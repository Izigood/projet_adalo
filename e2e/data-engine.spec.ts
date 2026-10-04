import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import type { EngineOptions, EngineReport } from './bench/engine-page.js';
import { engineBundle } from './bench/bundle.js';
import { RUNTIME_URL } from './targets.js';

/**
 * The data engine played on a real IndexedDB in the three browsers (D-11): what the unit tests
 * play on fake-indexeddb, which is not a browser. The rule of ADR-0036 (inside a transaction, wait
 * for nothing but requests) was observed on fake-indexeddb only: here are a transaction that deletes
 * with a cascade and throws, one that writes and deletes and commits, N-N links, an observer, a
 * destructive migration with its backup, its restoration and a purge. The page only reports; the
 * judgement is here. Records are few, on purpose: the WebKit of Windows takes 15 ms per request.
 *
 * E2E_ENGINE_SABOTAGE=no-restrict (negative control of the gate) turns the `restrict` of the data
 * project into a `cascade`: the protection of what is referenced must then be seen to fail.
 */
const options: EngineOptions =
  process.env['E2E_ENGINE_SABOTAGE'] === 'no-restrict' ? { restrictAs: 'cascade' } : {};

async function serve(page: Page): Promise<void> {
  const script = await engineBundle();
  await page.route(`${RUNTIME_URL}/__engine__/**`, async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/engine.js')) {
      await route.fulfill({ status: 200, contentType: 'text/javascript', body: script });
    } else {
      await route.fulfill({
        status: 200,
        contentType: 'text/html',
        body: '<!doctype html><html><head><meta charset="utf-8"><title>engine</title></head><body><script src="/__engine__/engine.js"></script></body></html>',
      });
    }
  });
}

test.describe('Data engine', () => {
  test.describe.configure({ mode: 'serial' });
  let report: EngineReport;

  test.beforeAll(async ({ browser }) => {
    const page = await browser.newPage();
    try {
      await serve(page);
      await page.goto(`${RUNTIME_URL}/__engine__/index.html`);
      report = await page.evaluate((given) => window.__engine.run(given), options);
    } finally {
      await page.close();
    }
  });

  test('loads the test data through the API, customers before their purchases', () => {
    expect(report.seed).toEqual({ purchase: 7, customer: 3 });
  });

  test('answers on its indexes and adds money exactly', () => {
    expect(report.parisCustomers).toBe(2);
    // 0.10 + 0.20 is 0.30000000000000004 in floating point.
    expect(report.sums).toEqual({ total: '385.79', ada: '125.00', grace: '0.30' });
  });

  test('refuses a stale write: VERSION_CONFLICT, and the first writer wins', () => {
    expect(report.stale).toEqual({ code: 'VERSION_CONFLICT', found: 2, winner: 'Ada King' });
  });

  test('refuses to delete what is referenced: REFERENCE_BLOCKED, and nothing is deleted', () => {
    expect(report.blocked.code).toBe('REFERENCE_BLOCKED');
    expect(report.blocked.total).toBe(3);
    expect(report.blocked.message).toContain('3 in purchase.customer');
    expect(report.blocked.stillThere).toBe(true);
  });

  test('undoes a transaction that deletes with a cascade and throws', () => {
    expect(report.rollback).toEqual({ threw: true, customers: 1, orders: 2, links: 1 });
  });

  test('cascades: the orders and the link go with the customer, the tag stays', () => {
    expect(report.cascade).toEqual({ customers: 0, orders: 0, links: 0, tags: 1 });
  });

  test('commits a transaction that writes and deletes with a cascade', () => {
    expect(report.committed).toEqual({ customers: 0, orders: 0, tags: 2 });
  });

  test('tells an observer of a write', () => {
    // Three customers were loaded, and one is written: the observer is given 3, then 4.
    expect(report.observed).toEqual([3, 4]);
  });

  test('refuses a destructive migration until it is approved, then backs the data up first', () => {
    expect(report.migration.refused).toBe('MIGRATION_BLOCKED');
    expect(report.migration.applied).toBe(true);
    expect(report.migration.backupCreated).toBe(true);
    expect(report.migration.priceGone).toBe(true);
  });

  test('puts the data back from the backup', () => {
    expect(report.migration.restored).toBe(true);
    expect(report.migration.priceBack).toBe(true);
  });

  test('purges the data base and its backups, and nothing is left', () => {
    expect(report.purge).toEqual({ ok: true, left: [] });
  });
});
