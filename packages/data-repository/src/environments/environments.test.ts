import type { DomainError, Draft, Page, RecordEnvelope } from '@acs/domain';
import type { Entity, Relation } from '@acs/project-schema';
import { entityOf, referenceTo, relationOf, stableId } from '@acs/testing';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { afterEach, describe, expect, it } from 'vitest';
import { createDataStore } from '../repository/data-store.js';
import { openEnvironment } from '../storage/database.js';
import type { DataEnvironment, IndexedDbSource, OpenEnvironment } from '../storage/database.js';
import { buildLayout } from '../storage/layout.js';
import { exportEnvironment } from './export.js';
import { seedTestData } from './test-data.js';

type Row = RecordEnvelope & Record<string, unknown>;

const customer = entityOf('customer', { name: { type: 'string', required: true } });
const order = entityOf('order', {
  customer: referenceTo(customer, { required: true }),
  total: { type: 'decimal', options: { precision: 8, scale: 2 } },
});
const tag = entityOf('tag', { name: { type: 'string' } });
const nn = relationOf(customer, tag, 'N-N', 'cascade');

const opened: OpenEnvironment[] = [];
afterEach(() => {
  for (const environment of opened.splice(0)) environment.close();
});

const ID = (kind: string, n: number) =>
  `0192f1c4-${kind}00-7000-8000-${String(n).padStart(12, '0')}`;

async function boot(
  entities: Entity[] = [customer, order, tag],
  relations: Relation[] = [relationOf(customer, order, '1-N', 'restrict'), nn],
  environment: DataEnvironment = 'test',
  source: IndexedDbSource = { indexedDB: new IDBFactory(), IDBKeyRange },
) {
  const layout = buildLayout(entities, relations);
  if (!layout.ok) throw new Error(JSON.stringify(layout.error.details));
  const result = await openEnvironment({
    projectKey: 'DEMO',
    environment,
    layout: layout.value,
    source,
  });
  if (!result.ok) throw new Error(result.error.message);
  opened.push(result.value);
  const store = createDataStore(result.value);
  return {
    source,
    environment: result.value,
    store,
    count: (name: string) => result.value.db.table(name).count(),
    open: async (which: DataEnvironment) => {
      const other = await openEnvironment({
        projectKey: 'DEMO',
        environment: which,
        layout: layout.value,
        source,
      });
      if (!other.ok) throw new Error(other.error.message);
      opened.push(other.value);
      return other.value;
    },
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

describe('seedTestData (EF-DAT-06)', () => {
  const data = () => ({
    // The orders come first: the loader has to put the customers before them.
    order: [
      { id: ID('0a', 1), customer: ID('0c', 1), total: '19.99' },
      { id: ID('0a', 2), customer: ID('0c', 2), total: '0.10' },
    ],
    customer: [
      { id: ID('0c', 1), name: 'Ada' },
      { id: ID('0c', 2), name: 'Grace' },
    ],
  });

  it('loads parents before children whatever the order, and keeps the ids it was given', async () => {
    const { store, environment } = await boot();
    const report = value(await seedTestData(store, environment, data()));
    expect(report.counts).toEqual({ order: 2, customer: 2 });
    const found = await store.repository<Row>('order').get(ID('0a', 1) as never);
    expect(found).toMatchObject({ customer: ID('0c', 1), total: '19.99', _v: 1 });
  });

  it('goes through the same checks as any write, and undoes everything when one row is refused', async () => {
    const { store, environment, count } = await boot();
    const bad = data();
    bad.order.push({ id: ID('0a', 3), customer: ID('0c', 99), total: '1.00' });
    const error = failure(await seedTestData(store, environment, bad));
    expect(error.code).toBe('CONSTRAINT_VIOLATION');
    expect(error.message).toContain('order[2]');
    expect(error.details).toMatchObject({ entity: 'order', index: 2 });
    expect([await count('e_customer'), await count('e_order')]).toEqual([0, 0]);
  });

  it('refuses any environment but the test one, and writes nothing (RG-04)', async () => {
    const { store, environment, count } = await boot(undefined, undefined, 'prod');
    const error = failure(await seedTestData(store, environment, data()));
    expect(error.code).toBe('ENVIRONMENT_FORBIDDEN');
    expect(error.details).toMatchObject({ environment: 'prod' });
    expect([await count('e_customer'), await count('e_order')]).toEqual([0, 0]);
  });

  it('keeps test and production apart: what is loaded in one is not in the other', async () => {
    const test = await boot();
    value(await seedTestData(test.store, test.environment, data()));
    const prod = await test.open('prod');
    expect(await prod.db.table('e_customer').count()).toBe(0);
    expect(await test.count('e_customer')).toBe(2);
  });

  it('names an entity the project does not have', async () => {
    const { store, environment } = await boot();
    const error = failure(await seedTestData(store, environment, { nothing: [{ x: 1 }] }));
    expect(error.message).toContain('no entity nothing');
  });

  it('puts the rows that others point at first within one entity', async () => {
    // An entity that points at itself: its own (stable) id is known before it is built.
    const self = stableId<'entity'>('builder.entity.category');
    const category = entityOf('category', {
      name: { type: 'string' },
      parent: { type: 'reference', options: { target: self } },
    });
    const { store, environment } = await boot(
      [category],
      [relationOf(category, category, '1-N', 'cascade')],
    );
    const rows = [
      { id: ID('0d', 3), name: 'leaf', parent: ID('0d', 2) },
      { id: ID('0d', 2), name: 'branch', parent: ID('0d', 1) },
      { id: ID('0d', 1), name: 'root' },
    ];
    expect(value(await seedTestData(store, environment, { category: rows })).counts).toEqual({
      category: 3,
    });
  });

  it('takes rows without an id: the Repository gives them one', async () => {
    const { store, environment } = await boot();
    value(await seedTestData(store, environment, { customer: [{ name: 'Anonymous' }] }));
    const page: Page<Row> = await store.repository<Row>('customer').query({ source: 'customer' });
    expect(page.items).toHaveLength(1);
  });

  it('is seen by what observes the data', async () => {
    const { store, environment } = await boot();
    const pages: Page<Row>[] = [];
    const stop = store
      .repository<Row>('customer')
      .observe({ source: 'customer' })
      .subscribe((page) => pages.push(page));
    await new Promise((resolve) => setTimeout(resolve, 30));
    value(await seedTestData(store, environment, data()));
    await new Promise((resolve) => setTimeout(resolve, 60));
    stop();
    expect(pages.map((page) => page.items.length)).toEqual([0, 2]);
  });
});

describe('exportEnvironment: the test data base is not production (RG-04)', () => {
  const seeded = async () => {
    const world = await boot();
    const c = value(
      await world.store.repository<Row>('customer').save({ name: 'Ada' } as Draft<Row>),
    );
    const t = value(await world.store.repository<Row>('tag').save({ name: 'vip' } as Draft<Row>));
    value(await world.store.links(nn.id).link(c.id, t.id));
    value(
      await world.store
        .repository<Row>('order')
        .save({ customer: c.id, total: '5.5' } as Draft<Row>),
    );
    return { ...world, c, t };
  };

  it('exports the test data base as test data, without the keys kept for the indexes', async () => {
    const { environment, c, t } = await seeded();
    const exported = value(await exportEnvironment(environment, { as: 'test' }));
    expect(exported).toMatchObject({
      format: 'acs-data-export',
      version: 1,
      environment: 'test',
      exportedAs: 'test',
      containsTestData: true,
      confirmedTestDataAsProduction: false,
    });
    expect(exported.entities['customer']).toEqual([
      expect.objectContaining({ id: c.id, name: 'Ada' }),
    ]);
    expect(
      Object.keys(exported.entities['order']?.[0] ?? {}).some((k) => k.startsWith('_k_')),
    ).toBe(false);
    expect(exported.links[nn.id]).toEqual([
      expect.objectContaining({ sourceId: c.id, targetId: t.id }),
    ]);
    expect(Object.keys(exported.entities).sort()).toEqual(['customer', 'order', 'tag']);
  });

  it('refuses to export it as production unless that is said, and says so when it is', async () => {
    const { environment } = await seeded();
    const refused = failure(await exportEnvironment(environment, { as: 'production' }));
    expect(refused.code).toBe('ENVIRONMENT_FORBIDDEN');
    expect(
      failure(
        await exportEnvironment(environment, {
          as: 'production',
          confirmTestDataAsProduction: false,
        }),
      ).code,
    ).toBe('ENVIRONMENT_FORBIDDEN');
    const confirmed = value(
      await exportEnvironment(environment, { as: 'production', confirmTestDataAsProduction: true }),
    );
    expect(confirmed).toMatchObject({
      exportedAs: 'production',
      containsTestData: true,
      confirmedTestDataAsProduction: true,
    });
  });

  it('exports production as production without any confirmation, and it is not test data', async () => {
    const test = await boot();
    const prod = await test.open('prod');
    const exported = value(await exportEnvironment(prod, { as: 'production' }));
    expect(exported).toMatchObject({
      environment: 'prod',
      containsTestData: false,
      confirmedTestDataAsProduction: false,
    });
    expect(exported.entities['customer']).toEqual([]);
  });

  it('changes nothing in the data base it reads', async () => {
    const { environment, count } = await seeded();
    const before = [await count('e_customer'), await count('e_order'), await count('j_' + nn.id)];
    value(await exportEnvironment(environment, { as: 'test' }));
    expect([await count('e_customer'), await count('e_order'), await count('j_' + nn.id)]).toEqual(
      before,
    );
  });

  it('stamps the export with the time it was made', async () => {
    const { environment } = await seeded();
    const exported = value(
      await exportEnvironment(environment, {
        as: 'test',
        now: () => new Date('2026-10-04T08:00:00Z'),
      }),
    );
    expect(exported.exportedAt).toBe('2026-10-04T08:00:00.000Z');
  });
});
