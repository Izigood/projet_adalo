import type { DomainError, Draft, RecordEnvelope } from '@acs/domain';
import { dataFixture, dataTestData, schemaOf } from '@acs/testing';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { afterEach, describe, expect, it } from 'vitest';
import { createDataStore } from '../repository/data-store.js';
import { openEnvironment } from '../storage/database.js';
import type { DataEnvironment, IndexedDbSource, OpenEnvironment } from '../storage/database.js';
import { buildLayout } from '../storage/layout.js';
import { exportEnvironment } from './export.js';
import { seedTestData } from './test-data.js';

/**
 * Exit criterion of lot 4, engine side (AC-01): a project of two linked entities, with test data
 * loaded through the API, answers as the dossier says: queries on indexes, exact decimals, the
 * version lock (`VERSION_CONFLICT`), the protection of what is referenced (`REFERENCE_BLOCKED`),
 * constraints checked by the Repository, test and production kept apart.
 */
type Row = RecordEnvelope & Record<string, unknown>;

const { entities, relations } = schemaOf(dataFixture());
const built = buildLayout([...entities], [...relations]);
if (!built.ok) throw new Error('the data fixture has no layout');
const layout = built.value;

const opened: OpenEnvironment[] = [];
afterEach(() => {
  for (const environment of opened.splice(0)) environment.close();
});

async function open(source: IndexedDbSource, environment: DataEnvironment) {
  const result = await openEnvironment({ projectKey: 'DATA', environment, layout, source });
  if (!result.ok) throw new Error(`${result.error.code}: ${result.error.message}`);
  opened.push(result.value);
  return result.value;
}

async function project() {
  const source: IndexedDbSource = { indexedDB: new IDBFactory(), IDBKeyRange };
  const environment = await open(source, 'test');
  const store = createDataStore(environment, { actor: () => 'designer' });
  const seeded = await seedTestData(store, environment, dataTestData());
  if (!seeded.ok) throw new Error(JSON.stringify(seeded.error));
  return {
    source,
    environment,
    store,
    customers: store.repository<Row>('customer'),
    purchases: store.repository<Row>('purchase'),
  };
}

function failure(result: { ok: boolean; error?: unknown }): DomainError {
  if (result.ok) throw new Error('expected a failure');
  return result.error as DomainError;
}

function value<T>(result: { ok: true; value: T } | { ok: false; error: unknown }): T {
  if (!result.ok) throw new Error(JSON.stringify(result.error));
  return result.value;
}

const ADA = dataTestData()['customer']?.[0]?.['id'] as never;
const GRACE = dataTestData()['customer']?.[1]?.['id'] as never;

describe('the data project of two linked entities, with its test data', () => {
  it('has the test data loaded through the API, customers before the purchases that point at them', async () => {
    const { store, environment } = await project();
    const seeded = value(await seedTestData(store, environment, {}));
    expect(seeded.counts).toEqual({});
    const customers = await store.repository<Row>('customer').query({ source: 'customer' });
    const purchases = await store.repository<Row>('purchase').query({ source: 'purchase' });
    expect([customers.items.length, purchases.items.length]).toEqual([3, 7]);
    const ada = customers.items.find((row) => row.id === ADA);
    expect(ada).toMatchObject({ _v: 1, _createdBy: 'designer', vip: true });
  });

  it('answers on its indexes: the customers of a city, the purchases of one status, a range of dates', async () => {
    const { customers, purchases } = await project();
    const paris = await customers.query({
      source: 'customer',
      filter: { and: [{ field: 'city', op: 'eq', value: 'Paris' }] },
      sort: [{ field: 'name', dir: 'asc' }],
    });
    expect(paris.items.map((row) => row['name'])).toEqual(['Ada Lovelace', 'Linus Torvalds']);
    const shipped = await purchases.query({
      source: 'purchase',
      filter: { and: [{ field: 'status', op: 'eq', value: 'shipped' }] },
      sort: [{ field: 'orderedOn', dir: 'desc' }],
    });
    expect(shipped.items.map((row) => row['number'])).toEqual(['PO-0006', 'PO-0002']);
    const september = await purchases.query({
      source: 'purchase',
      filter: {
        and: [
          { field: 'orderedOn', op: 'gte', value: '2026-09-20' },
          { field: 'orderedOn', op: 'lt', value: '2026-09-26' },
        ],
      },
    });
    expect(september.items).toHaveLength(4);
  });

  it('adds money exactly: what a customer owes, and the total, to the cent', async () => {
    const { purchases } = await project();
    const total = async (customer?: string) =>
      (
        await purchases.query({
          source: 'purchase',
          ...(customer === undefined
            ? {}
            : { filter: { and: [{ field: 'customer', op: 'eq' as const, value: customer }] } }),
          aggregate: [
            { fn: 'sum', field: 'total', as: 'sum' },
            { fn: 'count', as: 'n' },
          ],
          page: { size: 1 },
        })
      ).aggregates;
    expect(await total(ADA)).toEqual({ sum: '125.00', n: 3 });
    // 0.10 + 0.20: not 0.30000000000000004.
    expect(await total(GRACE)).toEqual({ sum: '0.30', n: 2 });
    expect((await total())?.['sum']).toBe('385.79');
  });

  it('refuses a stale write: VERSION_CONFLICT, and the other writer wins', async () => {
    const { customers } = await project();
    const read = (await customers.get(ADA)) as Row;
    value(await customers.save({ ...read, name: 'Ada King' } as Draft<Row>, read._v));
    const stale = failure(
      await customers.save({ ...read, name: 'Ada Byron' } as Draft<Row>, read._v),
    );
    expect(stale.code).toBe('VERSION_CONFLICT');
    expect(stale.details).toMatchObject({ expected: 1, found: 2 });
    expect((await customers.get(ADA))?.['name']).toBe('Ada King');
  });

  it('refuses to delete a customer that has purchases: REFERENCE_BLOCKED lists them', async () => {
    const { customers, purchases } = await project();
    const blocked = failure(await customers.delete(ADA));
    expect(blocked.code).toBe('REFERENCE_BLOCKED');
    expect(blocked.message).toContain('3 in purchase.customer');
    expect(blocked.details).toMatchObject({ entity: 'customer', total: 3 });
    expect((blocked.details?.['dependents'] as { field: string }[]).map((d) => d.field)).toEqual([
      'customer',
      'customer',
      'customer',
    ]);
    expect(await customers.get(ADA)).not.toBeNull();
    // Once its purchases are gone, it can be.
    for (const row of (
      await purchases.query({
        source: 'purchase',
        filter: { and: [{ field: 'customer', op: 'eq', value: ADA }] },
      })
    ).items) {
      value(await purchases.delete(row.id));
    }
    expect((await customers.delete(ADA)).ok).toBe(true);
  });

  it('checks the constraints in the Repository, not in a form', async () => {
    const { customers, purchases } = await project();
    const violations = async (result: { ok: boolean; error?: unknown }) =>
      ((failure(result).details?.['violations'] ?? []) as { field: string; rule: string }[]).map(
        (v) => `${v.field}:${v.rule}`,
      );
    expect(
      await violations(
        await customers.save({ name: 'Twin', email: 'ada@example.org' } as Draft<Row>),
      ),
    ).toEqual(['email:unique']);
    expect(
      await violations(
        await purchases.save({
          number: 'PO-12',
          customer: ADA,
          total: '1.005',
          status: 'lost',
          orderedOn: '2026-02-30',
        } as Draft<Row>),
      ),
    ).toEqual(['number:pattern', 'total:scale', 'status:choice', 'orderedOn:format']);
    expect(
      await violations(await purchases.save({ number: 'PO-0100', total: '1.00' } as Draft<Row>)),
    ).toEqual(['customer:required', 'orderedOn:required']);
  });

  it('keeps the test data base apart from production, and from being passed off as it', async () => {
    const { source, store, environment } = await project();
    const prod = await open(source, 'prod');
    const prodStore = createDataStore(prod);
    expect(
      (await prodStore.repository<Row>('customer').query({ source: 'customer' })).items,
    ).toEqual([]);
    expect(failure(await seedTestData(prodStore, prod, dataTestData())).code).toBe(
      'ENVIRONMENT_FORBIDDEN',
    );
    expect(failure(await exportEnvironment(environment, { as: 'production' })).code).toBe(
      'ENVIRONMENT_FORBIDDEN',
    );
    const asTest = value(await exportEnvironment(environment, { as: 'test' }));
    expect(asTest.entities['purchase']).toHaveLength(7);
    expect(store.repository<Row>('customer').entity).toBe('customer');
  });

  it('is still there when the data base is closed and opened again', async () => {
    const { source, environment } = await project();
    environment.close();
    const again = await open(source, 'test');
    const customers = createDataStore(again).repository<Row>('customer');
    expect((await customers.query({ source: 'customer' })).items).toHaveLength(3);
  });
});
