import type { Draft, DomainError, RecordEnvelope } from '@acs/domain';
import type { Entity, Relation } from '@acs/project-schema';
import { entityOf, referenceTo, relationOf } from '@acs/testing';
import type { FieldSpec } from '@acs/testing';
import Dexie from 'dexie';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { afterEach, describe, expect, it } from 'vitest';
import { createDataStore } from '../repository/data-store.js';
import { runQuery } from '../query/run.js';
import { databaseName, openEnvironment } from '../storage/database.js';
import type { IndexedDbSource, OpenEnvironment } from '../storage/database.js';
import { buildLayout } from '../storage/layout.js';
import type { DataLayout } from '../storage/layout.js';
import { decimalSortKey } from '../values/decimal.js';
import { exists, restoreBackup } from './backup.js';
import { migrateEnvironment, previewMigration } from './apply.js';
import type { MigrationStage } from './apply.js';

type Row = RecordEnvelope & Record<string, unknown>;
type Fields = Record<string, FieldSpec>;

const TICKET: Fields = {
  title: { type: 'string', required: true },
  qty: { type: 'integer' },
  price: { type: 'decimal', options: { precision: 8, scale: 2 } },
  note: { type: 'text' },
};
const INDEXES = [
  { name: 'byQty', fields: ['qty'] },
  { name: 'byPrice', fields: ['price'] },
];
const ticket = (fields: Fields = TICKET, indexes = INDEXES): Entity =>
  entityOf('ticket', fields, indexes);

/** The same entity with one field under another key (same id: that is a rename), the indexes following. */
function rename(entity: Entity, from: string, to: string): Entity {
  return {
    ...entity,
    fields: entity.fields.map((f) => (f.key === from ? { ...f, key: to } : f)),
    indexes: (entity.indexes ?? []).map((index) => ({
      ...index,
      fields: index.fields.map((f) => (f === from ? to : f)),
    })),
  } as Entity;
}

function layoutOf(entities: Entity[], relations: Relation[] = []): DataLayout {
  const built = buildLayout(entities, relations);
  if (!built.ok) throw new Error(JSON.stringify(built.error.details));
  return built.value;
}

const opened: OpenEnvironment[] = [];
afterEach(() => {
  for (const environment of opened.splice(0)) environment.close();
});

/** A browser of its own, a data base built from `layout`, and what is needed to look at it again. */
async function world(layout: DataLayout) {
  const source: IndexedDbSource = { indexedDB: new IDBFactory(), IDBKeyRange };
  const open = async (using: DataLayout): Promise<OpenEnvironment> => {
    const result = await openEnvironment({
      projectKey: 'DEMO',
      environment: 'test',
      layout: using,
      source,
    });
    if (!result.ok) throw new Error(`${result.error.code}: ${result.error.message}`);
    opened.push(result.value);
    return result.value;
  };
  const environment = await open(layout);
  return {
    source,
    environment,
    store: createDataStore(environment),
    open,
    migrate: (
      to: DataLayout,
      extra: { approveDestructive?: boolean; onProgress?: (stage: MigrationStage) => void } = {},
    ) =>
      migrateEnvironment({ projectKey: 'DEMO', environment: 'test', layout: to, source, ...extra }),
    names: async () => ((await source.indexedDB?.databases()) ?? []).map((info) => info.name ?? ''),
  };
}

function value<T>(result: { ok: true; value: T } | { ok: false; error: unknown }): T {
  if (!result.ok) throw new Error(JSON.stringify(result.error));
  return result.value;
}

function failure(result: { ok: boolean; error?: unknown }): DomainError {
  if (result.ok) throw new Error('expected a failure');
  return result.error as DomainError;
}

const draft = (fields: Record<string, unknown>) => fields as Draft<Row>;

async function seeded(entities: Entity[] = [ticket()], relations: Relation[] = []) {
  const w = await world(layoutOf(entities, relations));
  const tickets = w.store.repository<Row>('ticket');
  const rows = [
    value(await tickets.save(draft({ title: 'A', qty: 1, price: '1.50', note: '10' }))),
    value(await tickets.save(draft({ title: 'B', qty: 2, price: '12.00', note: '20' }))),
    value(await tickets.save(draft({ title: 'C', qty: 3 }))),
  ];
  w.environment.close();
  return { ...w, rows };
}

/** What a data base holds, read straight from IndexedDB. */
async function raw(source: IndexedDbSource, store: string, name = 'acs-data-DEMO-test') {
  const db = new Dexie(name, {
    indexedDB: source.indexedDB,
    IDBKeyRange: source.IDBKeyRange,
  } as never);
  await db.open();
  try {
    return await db.table(store).toArray();
  } finally {
    db.close();
  }
}

describe('nothing to do', () => {
  it('leaves a data base that is already at the schema as it is', async () => {
    const w = await seeded();
    const result = value(await w.migrate(layoutOf([ticket()])));
    expect([result.applied, result.plan.steps.length]).toEqual([false, 0]);
    expect(result.backup).toBeUndefined();
    const again = value(await w.migrate(layoutOf([ticket()])));
    expect(again.applied).toBe(false);
  });

  it('says what it would do without doing it', async () => {
    const w = await seeded();
    const more = layoutOf([ticket({ ...TICKET, size: { type: 'integer' } })]);
    const plan = value(
      await previewMigration({
        projectKey: 'DEMO',
        environment: 'test',
        layout: more,
        source: w.source,
      }),
    );
    expect(plan.steps.map((s) => s.op.kind)).toEqual(['addField']);
    expect((await raw(w.source, 'e_ticket'))[0]).not.toHaveProperty('size');
    expect(value(await w.migrate(layoutOf([ticket()]))).applied).toBe(false);
  });

  it('refuses where there is nothing to migrate: no data base, or one that does not know its schema', async () => {
    const empty = { indexedDB: new IDBFactory(), IDBKeyRange };
    const none = await migrateEnvironment({
      projectKey: 'DEMO',
      environment: 'test',
      layout: layoutOf([ticket()]),
      source: empty,
    });
    expect(failure(none).message).toContain('no data base');

    const old = { indexedDB: new IDBFactory(), IDBKeyRange };
    const db = new Dexie('acs-data-DEMO-test', { indexedDB: old.indexedDB, IDBKeyRange } as never);
    db.version(1).stores({ _meta: 'key' });
    await db.open();
    await db.table('_meta').put({ key: 'schema', version: 1, signature: 'x' });
    db.close();
    const blind = await migrateEnvironment({
      projectKey: 'DEMO',
      environment: 'test',
      layout: layoutOf([ticket()]),
      source: old,
    });
    expect(failure(blind).message).toContain('does not record the schema');
  });
});

describe('what can be added', () => {
  it('adds an entity, and a field with a default that fills the records that exist', async () => {
    const w = await seeded();
    const tag = entityOf('tag', { name: { type: 'string' } });
    const next = layoutOf([
      ticket({ ...TICKET, size: { type: 'integer', required: true, default: 3 } }),
      tag,
    ]);
    const result = value(await w.migrate(next));
    expect(result.applied).toBe(true);
    expect(result.backup).toBeUndefined();

    const environment = await w.open(next);
    const tickets = createDataStore(environment).repository<Row>('ticket');
    for (const row of w.rows) expect((await tickets.get(row.id))?.['size']).toBe(3);
    const saved = await createDataStore(environment)
      .repository<Row>('tag')
      .save(draft({ name: 'x' }));
    expect(saved.ok).toBe(true);
    expect((await raw(w.source, '_meta')).find((r) => r['key'] === 'migration')).toMatchObject({
      status: 'done',
    });
  });

  it('keeps the envelope of the records: a migration is not an edit', async () => {
    const w = await seeded();
    await w.migrate(layoutOf([ticket({ ...TICKET, size: { type: 'integer', default: 1 } })]));
    const after = await raw(w.source, 'e_ticket');
    for (const row of w.rows) {
      expect(after.find((r) => r['id'] === row.id)).toMatchObject({
        _v: row._v,
        _updatedAt: row._updatedAt,
        _createdBy: row._createdBy,
      });
    }
  });

  it('refuses a required field with no default when there are records, and changes nothing', async () => {
    const w = await seeded();
    const next = layoutOf([ticket({ ...TICKET, size: { type: 'integer', required: true } })]);
    const error = failure(await w.migrate(next));
    expect(error.code).toBe('MIGRATION_BLOCKED');
    expect(error.message).toContain('needs a default');
    expect(error.details).toMatchObject({ entity: 'ticket', field: 'size' });
    await w.open(layoutOf([ticket()])); // the old schema still opens: nothing was changed
    expect((await raw(w.source, '_meta')).find((r) => r['key'] === 'migration')).toMatchObject({
      status: 'failed',
    });
  });

  it('accepts that same field when there is nothing to fill', async () => {
    const w = await world(layoutOf([ticket()]));
    w.environment.close();
    const next = layoutOf([ticket({ ...TICKET, size: { type: 'integer', required: true } })]);
    expect(value(await w.migrate(next)).applied).toBe(true);
  });

  it('makes a field required: with a default it fills the gaps, without one it refuses', async () => {
    const w = await seeded();
    const without = layoutOf([ticket({ ...TICKET, note: { type: 'text', required: true } })]);
    const error = failure(await w.migrate(without));
    expect(error.message).toContain('has no value and the field has no default');
    expect(error.details).toMatchObject({ entity: 'ticket', field: 'note', id: w.rows[2]?.id });

    const withDefault = layoutOf([
      ticket({ ...TICKET, note: { type: 'text', required: true, default: 'n/a' } }),
    ]);
    value(await w.migrate(withDefault));
    const notes = (await raw(w.source, 'e_ticket')).map((r) => r['note']).sort();
    expect(notes).toEqual(['10', '20', 'n/a']);
  });
});

describe('what is renamed and converted', () => {
  it('renames a field, with its derived key, and the index that follows works', async () => {
    const w = await seeded();
    const next = layoutOf([rename(ticket(), 'price', 'cost')]);
    value(await w.migrate(next));
    const environment = await w.open(next);
    const found = value(
      await runQuery(environment, {
        source: 'ticket',
        filter: { and: [{ field: 'cost', op: 'gt', value: '2' }] },
      }),
    );
    expect(found.plan).toMatchObject({ access: 'range', index: '_k_cost' });
    expect(found.page.items.map((row) => row['title'])).toEqual(['B']);
    const rows = await raw(w.source, 'e_ticket');
    expect(rows.every((r) => !('price' in r) && !('_k_price' in r))).toBe(true);
    expect(rows.find((r) => r['title'] === 'A')?.['cost']).toBe('1.50');
  });

  it('converts the values of a field to another type, and the index follows', async () => {
    const w = await seeded();
    const next = layoutOf([ticket({ ...TICKET, qty: { type: 'string' } })]);
    value(await w.migrate(next));
    const rows = await raw(w.source, 'e_ticket');
    expect(rows.map((r) => r['qty']).sort()).toEqual(['1', '2', '3']);
    const environment = await w.open(next);
    const found = value(
      await runQuery(environment, {
        source: 'ticket',
        filter: { and: [{ field: 'qty', op: 'eq', value: '2' }] },
      }),
    );
    expect(found.plan).toMatchObject({ access: 'eq', index: 'qty' });
    expect(found.page.items).toHaveLength(1);
  });

  it('rewrites a decimal at its new scale, and its sort key', async () => {
    const w = await seeded();
    const wider = { type: 'decimal', options: { precision: 10, scale: 3 } };
    const next = layoutOf([ticket({ ...TICKET, price: wider })]);
    value(await w.migrate(next));
    const rows = await raw(w.source, 'e_ticket');
    const priced = rows.find((r) => r['title'] === 'A');
    expect(priced?.['price']).toBe('1.500');
    expect(priced?.['_k_price']).toBe(decimalSortKey('1.500', { precision: 10, scale: 3 }));
  });

  it('refuses the whole migration when one value cannot follow, names it, and changes nothing', async () => {
    const w = await seeded();
    const tickets = await w.open(layoutOf([ticket()]));
    value(
      await createDataStore(tickets)
        .repository<Row>('ticket')
        .save(draft({ title: 'D', note: 'secret-text' })),
    );
    tickets.close();
    const next = layoutOf([
      ticket({ ...TICKET, note: { type: 'integer' }, qty: { type: 'string' } }),
    ]);
    const error = failure(await w.migrate(next));
    expect(error.code).toBe('MIGRATION_BLOCKED');
    expect(error.details).toMatchObject({ entity: 'ticket', field: 'note' });
    expect(JSON.stringify(error.details)).not.toContain('secret-text');
    // Nothing moved, not even the field that could be converted.
    const rows = await raw(w.source, 'e_ticket');
    expect(rows.map((r) => typeof r['qty']).filter((t) => t === 'number')).toHaveLength(3);
    expect(rows.some((r) => r['note'] === 'secret-text')).toBe(true);
    await w.open(layoutOf([ticket()]));
  });
});

describe('indexes', () => {
  it('builds an index that the queries then use, and drops one', async () => {
    const w = await seeded();
    const titled = layoutOf([ticket(TICKET, [...INDEXES, { name: 'byTitle', fields: ['title'] }])]);
    value(await w.migrate(titled));
    let environment = await w.open(titled);
    const found = value(
      await runQuery(environment, {
        source: 'ticket',
        filter: { and: [{ field: 'title', op: 'eq', value: 'B' }] },
      }),
    );
    expect(found.plan).toMatchObject({ access: 'eq', index: 'title' });
    expect(found.examined).toBe(1);
    environment.close();

    const bare = layoutOf([ticket(TICKET, [{ name: 'byPrice', fields: ['price'] }])]);
    value(await w.migrate(bare));
    environment = await w.open(bare);
    const scan = value(
      await runQuery(environment, {
        source: 'ticket',
        filter: { and: [{ field: 'qty', op: 'eq', value: 2 }] },
      }),
    );
    expect(scan.plan.access).toBe('scan');
  });

  it('refuses a unique index that the records do not allow, and changes nothing', async () => {
    const w = await seeded();
    const tickets = await w.open(layoutOf([ticket()]));
    value(
      await createDataStore(tickets)
        .repository<Row>('ticket')
        .save(draft({ title: 'A' })),
    );
    tickets.close();
    const unique = layoutOf([
      ticket(TICKET, [...INDEXES, { name: 'byTitle', fields: ['title'], unique: true } as never]),
    ]);
    const error = failure(await w.migrate(unique));
    expect(error.code).toBe('MIGRATION_BLOCKED');
    expect(error.message).toContain('unique index cannot be built');
    await w.open(layoutOf([ticket()]));
  });
});

describe('relations', () => {
  const customer = entityOf('customer', { name: { type: 'string' } });
  const order = entityOf('order', { customer: referenceTo(customer), label: { type: 'string' } });

  it('adds an N-N relation whose links can then be made, and changes onDelete', async () => {
    const tag = entityOf('tag', { name: { type: 'string' } });
    const w = await world(
      layoutOf([customer, order, tag], [relationOf(customer, order, '1-N', 'restrict')]),
    );
    w.environment.close();
    const nn = relationOf(customer, tag, 'N-N', 'cascade');
    const next = layoutOf(
      [customer, order, tag],
      [relationOf(customer, order, '1-N', 'cascade'), nn],
    );
    value(await w.migrate(next));
    const environment = await w.open(next);
    const store = createDataStore(environment);
    const c = value(await store.repository<Row>('customer').save(draft({ name: 'Acme' })));
    const t = value(await store.repository<Row>('tag').save(draft({ name: 'vip' })));
    value(await store.links(nn.id).link(c.id, t.id));
    value(await store.repository<Row>('order').save(draft({ customer: c.id })));
    // The relation became cascade: deleting the customer takes its order, and the link.
    expect((await store.repository<Row>('customer').delete(c.id)).ok).toBe(true);
    expect((await store.repository<Row>('order').query({ source: 'order' })).items).toEqual([]);
    expect(await store.links(nn.id).sourcesOf(t.id)).toEqual([]);
  });
});

describe('what loses data is approved first, and backed up', () => {
  const dropped = () =>
    layoutOf([
      ticket({ title: TICKET['title'] as FieldSpec, qty: TICKET['qty'] as FieldSpec }, [
        INDEXES[0] as never,
      ]),
    ]);

  it('is refused without approval, naming what it would lose, and changes nothing', async () => {
    const w = await seeded();
    const error = failure(await w.migrate(dropped()));
    expect(error.code).toBe('MIGRATION_BLOCKED');
    expect(error.details?.['destructive']).toEqual(
      expect.arrayContaining([expect.stringContaining('remove ticket.price')]),
    );
    expect((await w.names()).filter((n) => n.includes('backup'))).toEqual([]);
    expect((await raw(w.source, 'e_ticket'))[0]).toHaveProperty('price');
  });

  it('with approval, copies the whole data base first, and the copy puts everything back', async () => {
    const w = await seeded();
    const before = await raw(w.source, 'e_ticket');
    const result = value(await w.migrate(dropped(), { approveDestructive: true }));
    expect(result.applied).toBe(true);
    expect(result.plan.destructive).toBe(true);
    const backup = result.backup ?? '';
    expect(backup).toMatch(/^acs-data-DEMO-test-backup-\d{14}$/);
    expect(await exists(backup, w.source)).toBe(true);

    expect((await raw(w.source, 'e_ticket')).every((r) => !('price' in r))).toBe(true);
    // The backup holds every store as it was, rows included.
    expect(await raw(w.source, 'e_ticket', backup)).toEqual(before);
    expect((await raw(w.source, '_meta', backup)).find((r) => r['key'] === 'schema')).toMatchObject(
      {
        signature: layoutOf([ticket()]).signature,
      },
    );

    const restored = await restoreBackup('DEMO', 'test', backup, w.source);
    expect(restored.ok).toBe(true);
    const environment = await w.open(layoutOf([ticket()]));
    expect(environment.layout.signature).toBe(layoutOf([ticket()]).signature);
    expect(await raw(w.source, 'e_ticket')).toEqual(before);
  });

  it('removing an entity or the links of an N-N relation needs approval too', async () => {
    const tag = entityOf('tag', { name: { type: 'string' } });
    const nn = relationOf(ticket(), tag, 'N-N', 'cascade');
    const w = await world(layoutOf([ticket(), tag], [nn]));
    w.environment.close();
    const noTag = layoutOf([ticket()]);
    const error = failure(await w.migrate(noTag));
    expect(error.details?.['destructive']).toHaveLength(2);
    const approved = value(await w.migrate(noTag, { approveDestructive: true }));
    expect(approved.backup).toBeDefined();
    const environment = await w.open(noTag);
    expect(environment.db.tables.map((t) => t.name)).not.toContain('e_tag');
  });

  it('says there is nothing to restore when the backup is not there, or is not a backup', async () => {
    const w = await seeded();
    expect(failure(await restoreBackup('DEMO', 'test', 'nope', w.source)).message).toContain(
      'no backup named nope',
    );
    expect(
      failure(
        await restoreBackup(
          'DEMO',
          'test',
          databaseName('DEMO', 'test').ok ? 'acs-data-DEMO-test' : '',
          w.source,
        ),
      ).message,
    ).toContain('is not a backup');
  });
});

describe('an interrupted migration is resumed, not repeated', () => {
  const dropped = () =>
    layoutOf([
      ticket({ title: TICKET['title'] as FieldSpec, qty: TICKET['qty'] as FieldSpec }, [
        INDEXES[0] as never,
      ]),
    ]);

  it('after a crash the data base is the old one, and the next run uses the same backup', async () => {
    const w = await seeded();
    const crashed = await w.migrate(dropped(), {
      approveDestructive: true,
      onProgress: (stage) => {
        if (stage === 'upgrade') throw new Error('power cut');
      },
    });
    expect(crashed.ok).toBe(false);
    const row = (await raw(w.source, '_meta')).find((r) => r['key'] === 'migration');
    expect(row).toMatchObject({ status: 'started' });
    const backup = String(row?.['backup']);
    await w.open(layoutOf([ticket()])); // still the old schema

    const resumed = value(await w.migrate(dropped(), { approveDestructive: true }));
    expect(resumed.applied).toBe(true);
    expect(resumed.backup).toBe(backup);
    expect((await w.names()).filter((n) => n.includes('-backup-'))).toEqual([backup]);
    expect(value(await w.migrate(dropped(), { approveDestructive: true })).applied).toBe(false);
  });

  it('goes through again once what was in the way is gone', async () => {
    const w = await seeded();
    const next = layoutOf([ticket({ ...TICKET, note: { type: 'integer' } })]);
    const tickets = await w.open(layoutOf([ticket()]));
    const bad = value(
      await createDataStore(tickets)
        .repository<Row>('ticket')
        .save(draft({ title: 'D', note: 'abc' })),
    );
    tickets.close();
    expect(failure(await w.migrate(next)).code).toBe('MIGRATION_BLOCKED');
    const again = await w.open(layoutOf([ticket()]));
    expect((await createDataStore(again).repository<Row>('ticket').delete(bad.id)).ok).toBe(true);
    again.close();
    expect(value(await w.migrate(next)).applied).toBe(true);
    expect((await raw(w.source, 'e_ticket')).map((r) => r['note']).sort()).toEqual([
      10,
      20,
      undefined,
    ]);
  });

  it('reports its stages in order, with the backup before the change', async () => {
    const w = await seeded();
    const stages: MigrationStage[] = [];
    value(
      await w.migrate(dropped(), { approveDestructive: true, onProgress: (s) => stages.push(s) }),
    );
    expect(stages).toEqual(['planned', 'backup', 'started', 'upgrade', 'done']);
    const plain: MigrationStage[] = [];
    const w2 = await seeded();
    value(
      await w2.migrate(layoutOf([ticket({ ...TICKET, size: { type: 'integer' } })]), {
        onProgress: (s) => plain.push(s),
      }),
    );
    expect(plain).toEqual(['planned', 'started', 'upgrade', 'done']);
  });
});

describe('the application keeps working around it', () => {
  it('closes the connection that was open, which opens again with the new schema', async () => {
    const w = await seeded();
    const holder = await w.open(layoutOf([ticket()]));
    const next = layoutOf([ticket({ ...TICKET, size: { type: 'integer', default: 2 } })]);
    value(await w.migrate(next));
    expect(holder.db.isOpen()).toBe(false);
    const environment = await w.open(next);
    expect(
      (await createDataStore(environment).repository<Row>('ticket').query({ source: 'ticket' }))
        .items,
    ).toHaveLength(3);
  });

  it('a data base that was migrated is refused by the schema it left', async () => {
    const w = await seeded();
    value(await w.migrate(layoutOf([ticket({ ...TICKET, size: { type: 'integer' } })])));
    const result = await openEnvironment({
      projectKey: 'DEMO',
      environment: 'test',
      layout: layoutOf([ticket()]),
      source: w.source,
    });
    expect(failure(result).code).toBe('MIGRATION_BLOCKED');
  });
});
