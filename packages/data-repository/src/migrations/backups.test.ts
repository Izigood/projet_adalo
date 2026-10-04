import type { DomainError, Draft, RecordEnvelope } from '@acs/domain';
import { entityOf } from '@acs/testing';
import type { FieldSpec } from '@acs/testing';
import Dexie from 'dexie';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { afterEach, describe, expect, it } from 'vitest';
import { createDataStore } from '../repository/data-store.js';
import { openEnvironment, purgeEnvironment } from '../storage/database.js';
import type { DataEnvironment, IndexedDbSource, OpenEnvironment } from '../storage/database.js';
import { buildLayout } from '../storage/layout.js';
import type { DataLayout } from '../storage/layout.js';
import { migrateEnvironment } from './apply.js';
import { exists, restoreBackup } from './backup.js';

/**
 * Review of lot 4: what a backup is a backup of, when one may be used again, and what a purge
 * leaves behind. A backup holds the whole data of an environment, sensitive fields in the clear.
 */
type Row = RecordEnvelope & Record<string, unknown>;
type Fields = Record<string, FieldSpec>;

const TICKET: Fields = {
  title: { type: 'string', required: true },
  qty: { type: 'integer' },
  price: { type: 'decimal', options: { precision: 8, scale: 2 } },
  note: { type: 'text' },
};
const ticket = (fields: Fields = TICKET) =>
  entityOf('ticket', fields, [{ name: 'byQty', fields: ['qty'] }]);

function layoutOf(fields: Fields = TICKET): DataLayout {
  const built = buildLayout([ticket(fields)], []);
  if (!built.ok) throw new Error(JSON.stringify(built.error.details));
  return built.value;
}

/** The ticket fields without the price. */
const noPrice = (): Fields =>
  Object.fromEntries(Object.entries(TICKET).filter(([key]) => key !== 'price'));

/** The ticket without its price: a destructive plan. */
const withoutPrice = (): DataLayout => layoutOf(noPrice());
/** Without the price, and the note becomes an integer: destructive, and fails on a note that is text. */
const withoutPriceNoteInteger = (): DataLayout =>
  layoutOf({ ...noPrice(), note: { type: 'integer' } });
const opened: OpenEnvironment[] = [];
afterEach(() => {
  for (const environment of opened.splice(0)) environment.close();
});

const source = (): IndexedDbSource => ({ indexedDB: new IDBFactory(), IDBKeyRange });

async function boot(
  using: IndexedDbSource,
  environment: DataEnvironment,
  rows: Record<string, unknown>[],
  layout: DataLayout = layoutOf(),
) {
  const result = await openEnvironment({ projectKey: 'DEMO', environment, layout, source: using });
  if (!result.ok) throw new Error(`${result.error.code}: ${result.error.message}`);
  const store = createDataStore(result.value);
  for (const row of rows) {
    const saved = await store.repository<Row>('ticket').save(row as Draft<Row>);
    if (!saved.ok) throw new Error(JSON.stringify(saved.error));
  }
  result.value.close();
  return store;
}

const migrate = (
  using: IndexedDbSource,
  environment: DataEnvironment,
  to: DataLayout,
  approveDestructive = true,
) =>
  migrateEnvironment({
    projectKey: 'DEMO',
    environment,
    layout: to,
    source: using,
    approveDestructive,
  });

async function rows(using: IndexedDbSource, name: string): Promise<Record<string, unknown>[]> {
  const db = new Dexie(name, {
    indexedDB: using.indexedDB,
    IDBKeyRange: using.IDBKeyRange,
  } as never);
  await db.open();
  try {
    return (await db.table('e_ticket').toArray()) as Record<string, unknown>[];
  } finally {
    db.close();
  }
}

const names = async (using: IndexedDbSource): Promise<string[]> =>
  ((await using.indexedDB?.databases()) ?? []).map((info) => info.name ?? '');

function failure(result: { ok: boolean; error?: unknown }): DomainError {
  if (result.ok) throw new Error('expected a failure');
  return result.error as DomainError;
}

function value<T>(result: { ok: true; value: T } | { ok: false; error: unknown }): T {
  if (!result.ok) throw new Error(JSON.stringify(result.error));
  return result.value;
}

describe('a backup is restored into the environment it was taken from, and only there (RG-04)', () => {
  it('refuses the backup of the test data base for production, and production is left as it was', async () => {
    const world = source();
    await boot(world, 'test', [{ title: 'FAKE-TEST-ROW', price: '1.00' }]);
    await boot(world, 'prod', [{ title: 'REAL-CUSTOMER', price: '2.00' }]);
    const testBackup = value(await migrate(world, 'test', withoutPrice())).backup ?? '';
    expect(testBackup).toContain('-test-backup-');

    const refused = failure(await restoreBackup('DEMO', 'prod', testBackup, world));
    expect(refused.code).toBe('ENVIRONMENT_FORBIDDEN');
    expect((await rows(world, 'acs-data-DEMO-prod')).map((row) => row['title'])).toEqual([
      'REAL-CUSTOMER',
    ]);
  });

  it('refuses anything that is not a backup of this environment: a live data base, another project, a made-up name', async () => {
    const world = source();
    await boot(world, 'prod', [{ title: 'REAL-CUSTOMER' }]);
    for (const name of [
      'acs-data-DEMO-prod',
      'acs-data-DEMO-test',
      'acs-data-OTHER-prod-backup-20260101000000',
      'acs-data-DEMO-prod-backup',
      'something-else',
    ]) {
      expect(failure(await restoreBackup('DEMO', 'prod', name, world)).code, name).toBe(
        'ENVIRONMENT_FORBIDDEN',
      );
    }
    expect(await rows(world, 'acs-data-DEMO-prod')).toHaveLength(1);
  });

  it('still restores its own', async () => {
    const world = source();
    await boot(world, 'prod', [{ title: 'REAL-CUSTOMER', price: '2.00' }]);
    const backup = value(await migrate(world, 'prod', withoutPrice())).backup ?? '';
    expect((await restoreBackup('DEMO', 'prod', backup, world)).ok).toBe(true);
    expect((await rows(world, 'acs-data-DEMO-prod'))[0]).toMatchObject({ price: '2.00' });
  });
});

describe('a backup is reused only when nothing has changed since (RG-09)', () => {
  it('takes a new one when the data was written between a failed attempt and the next', async () => {
    const world = source();
    const BAD = '0192f1c4-0000-7000-8000-0000000000bb';
    await boot(world, 'test', [
      { title: 'old', price: '2.00', note: '2' },
      { id: BAD, title: 'bad', note: 'secret-text' },
    ]);
    // The migration refuses the note that is text, after it has copied the data base.
    expect(failure(await migrate(world, 'test', withoutPriceNoteInteger())).code).toBe(
      'MIGRATION_BLOCKED',
    );
    const first = (await names(world)).filter((name) => name.includes('-backup-'));
    expect(first).toHaveLength(1);
    // The designer does what the message says, and goes on working: a price that exists nowhere else.
    const again = await openEnvironment({
      projectKey: 'DEMO',
      environment: 'test',
      layout: layoutOf(),
      source: world,
    });
    const repository = createDataStore(value(again)).repository<Row>('ticket');
    opened.push(value(again));
    expect((await repository.delete(BAD as never)).ok).toBe(true);
    value(await repository.save({ title: 'NEW', price: '99.00', note: '5' } as Draft<Row>));
    value(again).close();

    const done = value(await migrate(world, 'test', withoutPriceNoteInteger()));
    expect(done.backup).toBeDefined();
    expect(done.backup).not.toBe(first[0]);
    // The price of 99.00 was destroyed by the migration, and it is in the backup that was taken for it.
    const saved = await rows(world, done.backup ?? '');
    expect(saved.find((row) => row['title'] === 'NEW')).toMatchObject({ price: '99.00' });
  });

  it('does not copy everything again when a refused migration is tried again on the same data', async () => {
    const world = source();
    await boot(world, 'test', [{ title: 'bad', note: 'secret-text', price: '3.00' }]);
    const next = withoutPriceNoteInteger();
    expect(failure(await migrate(world, 'test', next)).code).toBe('MIGRATION_BLOCKED');
    expect(failure(await migrate(world, 'test', next)).code).toBe('MIGRATION_BLOCKED');
    expect(failure(await migrate(world, 'test', next)).code).toBe('MIGRATION_BLOCKED');
    expect((await names(world)).filter((name) => name.includes('-backup-'))).toHaveLength(1);
  });

  it('takes a new one when the data was changed after an interruption, but not when nothing was', async () => {
    const world = source();
    const store = await boot(world, 'test', [{ title: 'old', price: '2.00' }]);
    void store;
    const crash = (stage: string) => {
      if (stage === 'upgrade') throw new Error('power cut');
    };
    const first = await migrateEnvironment({
      projectKey: 'DEMO',
      environment: 'test',
      layout: withoutPrice(),
      source: world,
      approveDestructive: true,
      onProgress: crash,
    });
    expect(first.ok).toBe(false);
    const quiet = value(await migrate(world, 'test', withoutPrice()));
    // Nothing was written in between: the copy that was taken is the one that is used.
    expect((await names(world)).filter((name) => name.includes('-backup-'))).toEqual([
      quiet.backup,
    ]);

    // The same, but the data is written to between the interruption and the second attempt.
    const other = source();
    await boot(other, 'test', [{ title: 'old', price: '2.00' }]);
    const interrupted = await migrateEnvironment({
      projectKey: 'DEMO',
      environment: 'test',
      layout: withoutPrice(),
      source: other,
      approveDestructive: true,
      onProgress: crash,
    });
    expect(interrupted.ok).toBe(false);
    const environment = value(
      await openEnvironment({
        projectKey: 'DEMO',
        environment: 'test',
        layout: layoutOf(),
        source: other,
      }),
    );
    opened.push(environment);
    value(
      await createDataStore(environment)
        .repository<Row>('ticket')
        .save({ title: 'WRITTEN-AFTER', price: '7.00' } as Draft<Row>),
    );
    environment.close();
    const resumed = value(await migrate(other, 'test', withoutPrice()));
    expect((await names(other)).filter((name) => name.includes('-backup-'))).toHaveLength(2);
    const saved = await rows(other, resumed.backup ?? '');
    expect(saved.map((row) => row['title']).sort()).toEqual(['WRITTEN-AFTER', 'old']);
  });
});

describe('a purge leaves no copy of the data behind (SEC-09)', () => {
  it('deletes the backups of the environment with it, and those of the other one stay', async () => {
    const world = source();
    await boot(world, 'test', [{ title: 'sensitive', price: '1.00' }]);
    await boot(world, 'prod', [{ title: 'real', price: '2.00' }]);
    const testBackup = value(await migrate(world, 'test', withoutPrice())).backup ?? '';
    const prodBackup = value(await migrate(world, 'prod', withoutPrice())).backup ?? '';
    expect([await exists(testBackup, world), await exists(prodBackup, world)]).toEqual([
      true,
      true,
    ]);

    expect((await purgeEnvironment('DEMO', 'test', world)).ok).toBe(true);
    expect(await names(world)).toEqual(['acs-data-DEMO-prod', prodBackup].sort());
    expect(await exists(testBackup, world)).toBe(false);
  });

  it('finds the copies in the registry of the data base when the browser cannot list its data bases', async () => {
    const world = source();
    // Older browsers have no indexedDB.databases(): only what the data base wrote down is known.
    (world.indexedDB as unknown as { databases?: unknown }).databases = undefined;
    await boot(world, 'test', [{ title: 'sensitive', price: '1.00' }]);
    const backup = value(await migrate(world, 'test', withoutPrice())).backup ?? '';
    expect(await exists(backup, world)).toBe(true);
    expect((await purgeEnvironment('DEMO', 'test', world)).ok).toBe(true);
    expect(await exists(backup, world)).toBe(false);
    expect(await exists('acs-data-DEMO-test', world)).toBe(false);
  });

  it('removes the copies even when the data base itself is already gone', async () => {
    const world = source();
    await boot(world, 'test', [{ title: 'sensitive', price: '1.00' }]);
    const backup = value(await migrate(world, 'test', withoutPrice())).backup ?? '';
    const live = new Dexie('acs-data-DEMO-test', {
      indexedDB: world.indexedDB,
      IDBKeyRange,
    } as never);
    await live.delete();
    expect(await exists(backup, world)).toBe(true);
    expect((await purgeEnvironment('DEMO', 'test', world)).ok).toBe(true);
    expect(await names(world)).toEqual([]);
  });
});
