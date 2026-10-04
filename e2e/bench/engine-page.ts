import {
  buildLayout,
  createDataStore,
  migrateEnvironment,
  openEnvironment,
  purgeEnvironment,
  restoreBackup,
  seedTestData,
} from '../../packages/data-repository/src/index.js';
import type { DataLayout, OpenEnvironment } from '../../packages/data-repository/src/index.js';
import type { RecordEnvelope } from '../../packages/domain/src/index.js';
import { entityOf, referenceTo, relationOf } from '../../packages/testing/src/entity-builder.js';
import { dataFixture, dataTestData } from '../../packages/testing/src/fixtures/data.js';
import { schemaOf } from '../../packages/testing/src/schema-of.js';

/**
 * The page of the engine scenario, bundled and served to the three browsers by the spec (see
 * `bundle.ts`): it plays the data engine on a real IndexedDB, the parts that the unit tests play on
 * fake-indexeddb: loading test data, the version lock, protected deletion, a transaction that
 * throws, a cascade, N-N links, an observer, a destructive migration with its backup and its
 * restoration, and a purge. It decides nothing: the spec judges what it reports.
 */
export type EngineOptions = {
  /** Turns the `restrict` of the data project into a `cascade`: the negative control. */
  readonly restrictAs?: 'cascade';
};

export type EngineReport = {
  readonly seed: Readonly<Record<string, number>>;
  readonly parisCustomers: number;
  readonly sums: { readonly total: unknown; readonly ada: unknown; readonly grace: unknown };
  readonly stale: { readonly code: string; readonly found: unknown; readonly winner: unknown };
  readonly blocked: {
    readonly code: string;
    readonly total: unknown;
    readonly message: string;
    readonly stillThere: boolean;
  };
  readonly rollback: {
    readonly threw: boolean;
    readonly customers: number;
    readonly orders: number;
    readonly links: number;
  };
  readonly cascade: {
    readonly customers: number;
    readonly orders: number;
    readonly links: number;
    readonly tags: number;
  };
  readonly committed: {
    readonly customers: number;
    readonly orders: number;
    readonly tags: number;
  };
  readonly observed: readonly number[];
  readonly migration: {
    readonly refused: string;
    readonly applied: boolean;
    readonly backupCreated: boolean;
    readonly priceGone: boolean;
    readonly restored: boolean;
    readonly priceBack: boolean;
  };
  readonly purge: { readonly ok: boolean; readonly left: readonly string[] };
};

declare global {
  interface Window {
    __engine: { run(options: EngineOptions): Promise<EngineReport> };
  }
}

type Row = Record<string, unknown> & RecordEnvelope;

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function until(condition: () => boolean): Promise<void> {
  for (let waited = 0; waited < 10_000 && !condition(); waited += 25) await wait(25);
}

function layoutOf(
  entities: Parameters<typeof buildLayout>[0],
  relations: Parameters<typeof buildLayout>[1],
): DataLayout {
  const built = buildLayout(entities, relations);
  if (!built.ok) throw new Error(JSON.stringify(built.error.details));
  return built.value;
}

async function open(project: string, layout: DataLayout): Promise<OpenEnvironment> {
  await purgeEnvironment(project, 'test');
  const opened = await openEnvironment({ projectKey: project, environment: 'test', layout });
  if (!opened.ok) throw new Error(`${opened.error.code}: ${opened.error.message}`);
  return opened.value;
}

const failure = (result: { ok: boolean; error?: unknown }) =>
  (result.ok ? undefined : result.error) as
    { code: string; message: string; details?: Record<string, unknown> } | undefined;

async function dataProject(options: EngineOptions) {
  const { entities, relations } = schemaOf(dataFixture());
  const wanted = relations.map((relation) =>
    options.restrictAs === 'cascade' ? { ...relation, onDelete: 'cascade' as const } : relation,
  );
  const environment = await open('ENGA', layoutOf([...entities], [...wanted]));
  const store = createDataStore(environment);
  const customers = store.repository<Row>('customer');
  const purchases = store.repository<Row>('purchase');
  const seeded = await seedTestData(store, environment, dataTestData());
  if (!seeded.ok) throw new Error(`${seeded.error.code}: ${seeded.error.message}`);

  const ids = dataTestData()['customer']?.map((row) => String(row['id'])) ?? [];
  const [ada, grace] = [ids[0] ?? '', ids[1] ?? ''];
  const sumOf = async (customer?: string) =>
    (
      await purchases.query({
        source: 'purchase',
        ...(customer === undefined
          ? {}
          : { filter: { and: [{ field: 'customer', op: 'eq' as const, value: customer }] } }),
        aggregate: [{ fn: 'sum', field: 'total', as: 'sum' }],
        page: { size: 1 },
      })
    ).aggregates?.['sum'];
  const paris = await customers.query({
    source: 'customer',
    filter: { and: [{ field: 'city', op: 'eq', value: 'Paris' }] },
  });
  const sums = { total: await sumOf(), ada: await sumOf(ada), grace: await sumOf(grace) };

  // The version lock: two writers read version 1, the first wins.
  const read = (await customers.get(ada as never)) as Row;
  await customers.save({ ...read, name: 'Ada King' } as never, read._v);
  const lost = failure(await customers.save({ ...read, name: 'Ada Byron' } as never, read._v));
  const stale = {
    code: lost?.code ?? 'none',
    found: lost?.details?.['found'],
    winner: ((await customers.get(ada as never)) as Row | null)?.['name'],
  };

  // The protection of what is referenced.
  const refused = failure(await customers.delete(ada as never));
  const blocked = {
    code: refused?.code ?? 'none',
    total: refused?.details?.['total'],
    message: refused?.message ?? '',
    stillThere: (await customers.get(ada as never)) !== null,
  };

  // An observer that is told of a write.
  const observed: number[] = [];
  const stop = customers
    .observe({ source: 'customer' })
    .subscribe((page) => observed.push(page.items.length));
  await until(() => observed.length >= 1);
  await customers.save({ name: 'Observed', email: 'observed@example.org' } as never);
  await until(() => observed.length >= 2);
  stop();
  environment.close();
  return {
    seed: seeded.value.counts,
    parisCustomers: paris.items.length,
    sums,
    stale,
    blocked,
    observed,
  };
}

async function cascadeProject() {
  const customer = entityOf('customer', { name: { type: 'string', required: true } });
  const order = entityOf('order', { customer: referenceTo(customer, { required: true }) });
  const tag = entityOf('tag', { name: { type: 'string' } });
  const link = relationOf(customer, tag, 'N-N', 'cascade');
  const environment = await open(
    'ENGB',
    layoutOf([customer, order, tag], [relationOf(customer, order, '1-N', 'cascade'), link]),
  );
  const store = createDataStore(environment);
  const customers = store.repository<Row>('customer');
  const orders = store.repository<Row>('order');
  const tags = store.repository<Row>('tag');
  const count = async (repository: typeof customers, source: string) =>
    (await repository.query({ source })).items.length;

  const owner = (await customers.save({ name: 'Acme' } as never)) as { ok: true; value: Row };
  const label = (await tags.save({ name: 'vip' } as never)) as { ok: true; value: Row };
  await orders.save({ customer: owner.value.id } as never);
  await orders.save({ customer: owner.value.id } as never);
  await store.links(link.id).link(owner.value.id, label.value.id);

  // A transaction that deletes with a cascade and then throws: nothing is undone halfway.
  let threw = false;
  await customers
    .transaction(async (uow) => {
      await uow.of<Row>('customer').delete(owner.value.id as never);
      throw new Error('undo it all');
    })
    .catch(() => {
      threw = true;
    });
  const rollback = {
    threw,
    customers: await count(customers, 'customer'),
    orders: await count(orders, 'order'),
    links: (await store.links(link.id).targetsOf(owner.value.id)).length,
  };

  // The same without the throw, as a plain delete: the orders and the link go, the tag stays.
  await customers.delete(owner.value.id as never);
  const cascade = {
    customers: await count(customers, 'customer'),
    orders: await count(orders, 'order'),
    links: (await store.links(link.id).sourcesOf(label.value.id)).length,
    tags: await count(tags, 'tag'),
  };

  // A transaction that writes, deletes with a cascade and commits.
  await customers.transaction(async (uow) => {
    const second = (await uow.of<Row>('customer').save({ name: 'Second' } as never)) as {
      ok: true;
      value: Row;
    };
    await uow.of<Row>('order').save({ customer: second.value.id } as never);
    await uow.of<Row>('customer').delete(second.value.id as never);
    await uow.of<Row>('tag').save({ name: 'kept' } as never);
  });
  const committed = {
    customers: await count(customers, 'customer'),
    orders: await count(orders, 'order'),
    tags: await count(tags, 'tag'),
  };
  environment.close();
  return { rollback, cascade, committed };
}

async function migrationProject() {
  const fields = {
    title: { type: 'string', required: true },
    price: { type: 'decimal', options: { precision: 8, scale: 2 } },
  } as const;
  const withPrice = layoutOf([entityOf('ticket', fields)], []);
  const withoutPrice = layoutOf([entityOf('ticket', { title: fields.title })], []);
  const environment = await open('ENGC', withPrice);
  const store = createDataStore(environment);
  await store.repository<Row>('ticket').save({ title: 'A', price: '2.50' } as never);
  await store.repository<Row>('ticket').save({ title: 'B', price: '7.00' } as never);
  environment.close();

  const refused = await migrateEnvironment({
    projectKey: 'ENGC',
    environment: 'test',
    layout: withoutPrice,
  });
  const applied = await migrateEnvironment({
    projectKey: 'ENGC',
    environment: 'test',
    layout: withoutPrice,
    approveDestructive: true,
  });
  const backup = applied.ok ? applied.value.backup : undefined;
  const databases = async () => (await indexedDB.databases()).map((info) => info.name ?? '');
  const backupCreated = backup !== undefined && (await databases()).includes(backup);

  const migrated = await openEnvironment({
    projectKey: 'ENGC',
    environment: 'test',
    layout: withoutPrice,
  });
  const priceGone =
    migrated.ok &&
    (
      await createDataStore(migrated.value).repository<Row>('ticket').query({ source: 'ticket' })
    ).items.every((row) => !('price' in row));
  if (migrated.ok) migrated.value.close();

  const restored = backup !== undefined ? await restoreBackup('ENGC', 'test', backup) : undefined;
  const back = await openEnvironment({
    projectKey: 'ENGC',
    environment: 'test',
    layout: withPrice,
  });
  const priceBack =
    back.ok &&
    (await createDataStore(back.value).repository<Row>('ticket').query({ source: 'ticket' })).items
      .map((row) => row['price'])
      .sort()
      .join() === '2.50,7.00';
  if (back.ok) back.value.close();

  const purged = await purgeEnvironment('ENGC', 'test');
  const left = (await databases()).filter((name) => name.startsWith('acs-data-ENGC-'));
  return {
    migration: {
      refused: failure(refused)?.code ?? 'none',
      applied: applied.ok && applied.value.applied,
      backupCreated,
      priceGone,
      restored: restored?.ok === true,
      priceBack,
    },
    purge: { ok: purged.ok, left },
  };
}

async function run(options: EngineOptions): Promise<EngineReport> {
  const data = await dataProject(options);
  const cascade = await cascadeProject();
  const migration = await migrationProject();
  await purgeEnvironment('ENGA', 'test');
  await purgeEnvironment('ENGB', 'test');
  return { ...data, ...cascade, ...migration };
}

window.__engine = { run };
