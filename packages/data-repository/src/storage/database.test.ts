import { completeFixture, schemaOf } from '@acs/testing';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { afterEach, describe, expect, it } from 'vitest';
import { databaseName, openEnvironment, purgeEnvironment, storageError } from './database.js';
import type { IndexedDbSource, OpenEnvironment } from './database.js';
import { buildLayout } from './layout.js';
import type { DataLayout } from './layout.js';

const { entities, relations } = schemaOf(completeFixture());
const built = buildLayout([...entities], [...relations]);
if (!built.ok) throw new Error('the complete fixture has no layout');
const layout: DataLayout = built.value;

/** A browser of its own for each test: nothing leaks from one to the next. */
function browser(): IndexedDbSource {
  return { indexedDB: new IDBFactory(), IDBKeyRange };
}

const opened: OpenEnvironment[] = [];
afterEach(() => {
  for (const environment of opened.splice(0)) environment.close();
});

async function open(
  source: IndexedDbSource,
  environment: 'test' | 'prod' = 'test',
  using: DataLayout = layout,
): Promise<OpenEnvironment> {
  const result = await openEnvironment({ projectKey: 'DEMO', environment, layout: using, source });
  if (!result.ok) throw new Error(`${result.error.code}: ${result.error.message}`);
  opened.push(result.value);
  return result.value;
}

const names = async (source: IndexedDbSource): Promise<string[]> =>
  ((await source.indexedDB?.databases()) ?? []).map((info) => info.name ?? '');

describe('databaseName', () => {
  it('is acs-data-{key}-{env} for a valid key', () => {
    expect(databaseName('DEMO', 'test')).toEqual({ ok: true, value: 'acs-data-DEMO-test' });
    expect(databaseName('DEMO', 'prod')).toEqual({ ok: true, value: 'acs-data-DEMO-prod' });
  });

  it('refuses a key that is not a project key, and an unknown environment', () => {
    for (const key of ['demo', 'A', '', 'DEMO-x', '../DEMO', 'DEMO_', 'A'.repeat(17)]) {
      expect(databaseName(key, 'test').ok, key).toBe(false);
    }
    expect(databaseName('DEMO', 'staging' as never).ok).toBe(false);
  });
});

describe('openEnvironment', () => {
  it('creates the stores of the layout and records what they were built from', async () => {
    const environment = await open(browser());
    expect(environment.db.tables.map((table) => table.name).sort()).toEqual(
      layout.stores.map((store) => store.name),
    );
    expect(await environment.db.table('_meta').get('schema')).toMatchObject({
      version: 1,
      signature: layout.signature,
    });
  });

  it('really builds the indexes: a unique one refuses a duplicate, a declared one exists', async () => {
    const environment = await open(browser());
    const catalog = environment.db.table('e_catalog');
    await catalog.put({ id: 'a', code: 'X', label: 'one' });
    await expect(catalog.put({ id: 'b', code: 'X', label: 'two' })).rejects.toThrow();
    const ticket = environment.db.table('e_ticket');
    expect(Object.keys(ticket.schema.idxByName).sort()).toEqual(
      expect.arrayContaining(['status', 'owner', '[owner+openedOn]', '_updatedAt']),
    );
  });

  it('finds the data again when it opens the same data base later', async () => {
    const source = browser();
    const first = await open(source);
    await first.db.table('e_person').put({ id: 'p1', name: 'Ada' });
    first.close();
    const second = await open(source);
    expect(await second.db.table('e_person').get('p1')).toEqual({ id: 'p1', name: 'Ada' });
  });

  it('keeps test and prod apart (RG-04, EF-DAT-06)', async () => {
    const source = browser();
    const test = await open(source, 'test');
    const prod = await open(source, 'prod');
    await test.db.table('e_person').put({ id: 'p1', name: 'only in test' });
    expect(await prod.db.table('e_person').get('p1')).toBeUndefined();
    expect((await names(source)).sort()).toEqual(['acs-data-DEMO-prod', 'acs-data-DEMO-test']);
  });

  it('refuses a data base built from another schema, and leaves it as it was', async () => {
    const source = browser();
    const first = await open(source);
    await first.db.table('e_person').put({ id: 'p1', name: 'Ada' });
    first.close();

    const other = buildLayout(
      entities.map((entity) =>
        entity.key === 'person'
          ? { ...entity, indexes: [{ name: 'byName', fields: ['name'] }] }
          : entity,
      ),
      [...relations],
    );
    if (!other.ok) throw new Error('layout');
    const result = await openEnvironment({
      projectKey: 'DEMO',
      environment: 'test',
      layout: other.value,
      source,
    });
    expect(result.ok).toBe(false);
    expect(result.ok ? '' : result.error.code).toBe('MIGRATION_BLOCKED');

    const again = await open(source);
    expect(await again.db.table('e_person').get('p1')).toEqual({ id: 'p1', name: 'Ada' });
  });

  it('says STORAGE_UNAVAILABLE when there is no IndexedDB, and refuses a bad project key', async () => {
    const none = await openEnvironment({ projectKey: 'DEMO', environment: 'test', layout });
    expect(none.ok ? '' : none.error.code).toBe('STORAGE_UNAVAILABLE');
    const bad = await openEnvironment({
      projectKey: 'demo',
      environment: 'test',
      layout,
      source: browser(),
    });
    expect(bad.ok ? '' : bad.error.code).toBe('MANIFEST_INVALID');
  });
});

describe('storageError', () => {
  it('tells a full disk from any other failure', () => {
    expect(storageError(new DOMException('full', 'QuotaExceededError')).code).toBe('STORAGE_QUOTA');
    expect(storageError(new Error('boom')).code).toBe('STORAGE_UNAVAILABLE');
    expect(storageError('text').code).toBe('STORAGE_UNAVAILABLE');
  });
});

describe('purgeEnvironment (SEC-09)', () => {
  it('deletes the data base, checks it is gone, and leaves the other environment alone', async () => {
    const source = browser();
    const test = await open(source, 'test');
    const prod = await open(source, 'prod');
    await test.db.table('e_person').put({ id: 'p1', name: 'x' });
    await prod.db.table('e_person').put({ id: 'p2', name: 'y' });

    const purged = await purgeEnvironment('DEMO', 'test', source);
    expect(purged.ok).toBe(true);
    expect(await names(source)).toEqual(['acs-data-DEMO-prod']);
    expect(await prod.db.table('e_person').get('p2')).toEqual({ id: 'p2', name: 'y' });

    const reborn = await open(source, 'test');
    expect(await reborn.db.table('e_person').count()).toBe(0);
  });

  it('does not take the deletion for granted: a browser that says yes and keeps the data is caught', async () => {
    class ForgetfulFactory extends IDBFactory {
      override deleteDatabase(): IDBOpenDBRequest {
        const request = {} as IDBOpenDBRequest;
        setTimeout(() =>
          (request.onsuccess as ((event: Event) => void) | null)?.(new Event('success')),
        );
        return request;
      }
    }
    const source = { indexedDB: new ForgetfulFactory(), IDBKeyRange };
    await open(source, 'test');
    const purged = await purgeEnvironment('DEMO', 'test', source);
    expect(purged.ok ? '' : purged.error.code).toBe('STORAGE_UNAVAILABLE');
    expect(purged.ok ? '' : purged.error.message).toContain('still there');
  });

  it('is not an error when there is nothing to delete', async () => {
    expect((await purgeEnvironment('DEMO', 'prod', browser())).ok).toBe(true);
  });

  it('refuses a bad project key before touching anything', async () => {
    const result = await purgeEnvironment('../DEMO', 'test', browser());
    expect(result.ok ? '' : result.error.code).toBe('MANIFEST_INVALID');
  });
});
