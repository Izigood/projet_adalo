import Dexie from 'dexie';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import type { IndexedDbSource } from '../storage/database.js';
import { backupName, createBackup, exists, matchesBackup, restoreBackup } from './backup.js';

const fresh = (): IndexedDbSource => ({ indexedDB: new IDBFactory(), IDBKeyRange });

describe('backupName', () => {
  it('is the data base name and the moment, to the second', () => {
    expect(backupName('acs-data-DEMO-test', new Date('2026-10-04T08:09:10.999Z'))).toBe(
      'acs-data-DEMO-test-backup-20261004080910',
    );
  });
});

describe('exists', () => {
  it('says whether a data base of that name is there, and leaves nothing behind when it is not', async () => {
    const source = fresh();
    expect(await exists('nothing', source)).toBe(false);
    expect(await source.indexedDB?.databases()).toEqual([]);
    const db = new Dexie('there', { indexedDB: source.indexedDB, IDBKeyRange } as never);
    db.version(1).stores({ t: 'id' });
    await db.open();
    db.close();
    expect(await exists('there', source)).toBe(true);
  });

  it('is false when the browser has no IndexedDB at all', async () => {
    expect(await exists('whatever', undefined)).toBe(false);
  });
});

describe('matchesBackup', () => {
  it('is true for the data and the schema the backup was taken of, and for nothing else', async () => {
    const world = fresh();
    const open = async (name: string) => {
      const db = new Dexie(name, { indexedDB: world.indexedDB, IDBKeyRange } as never);
      return db;
    };
    const original = await open('original');
    original.version(1).stores({ _meta: 'key', e_item: 'id' });
    await original.open();
    await original.table('e_item').put({ id: 'a', n: 1 });
    await createBackup(original, 'copy', 'schema-1', world, new Date());

    expect(await matchesBackup(original, 'copy', world, 'schema-1')).toBe(true);
    // Another schema: the copy would not put the data base back as the migration found it.
    expect(await matchesBackup(original, 'copy', world, 'schema-2')).toBe(false);
    // The migration writes in _meta (its state, its backups): that is not a change of the data.
    await original.table('_meta').put({ key: 'migration', status: 'started' });
    expect(await matchesBackup(original, 'copy', world, 'schema-1')).toBe(true);
    // A record written, changed or deleted since is.
    await original.table('e_item').put({ id: 'b', n: 2 });
    expect(await matchesBackup(original, 'copy', world, 'schema-1')).toBe(false);
    await original.table('e_item').delete('b');
    expect(await matchesBackup(original, 'copy', world, 'schema-1')).toBe(true);
    await original.table('e_item').put({ id: 'a', n: 99 });
    expect(await matchesBackup(original, 'copy', world, 'schema-1')).toBe(false);
    original.close();
  });

  it('is false for a backup that is not there, or not a backup, or without IndexedDB', async () => {
    const world = fresh();
    const db = new Dexie('original', { indexedDB: world.indexedDB, IDBKeyRange } as never);
    db.version(1).stores({ _meta: 'key' });
    await db.open();
    expect(await matchesBackup(db, 'nothing', world, 's')).toBe(false);
    expect(await matchesBackup(db, 'original', world, 's')).toBe(false);
    expect(await matchesBackup(db, 'original', undefined, 's')).toBe(false);
    db.close();
  });
});

describe('without IndexedDB', () => {
  it('cannot copy a data base: the backup fails loudly rather than leaving a half copy', async () => {
    const source = fresh();
    const original = new Dexie('original', { indexedDB: source.indexedDB, IDBKeyRange } as never);
    original.version(1).stores({ t: 'id' });
    await original.open();
    await expect(
      createBackup(original, 'copy', 'signature', undefined, new Date()),
    ).rejects.toThrow('IndexedDB is not available');
    original.close();
  });

  it('cannot restore one: STORAGE_UNAVAILABLE', async () => {
    const result = await restoreBackup(
      'DEMO',
      'test',
      'acs-data-DEMO-test-backup-20260101000000',
      undefined,
    );
    expect(result.ok ? '' : result.error.code).toBe('STORAGE_UNAVAILABLE');
  });

  it('refuses a project key that is not one before it looks for anything', async () => {
    const result = await restoreBackup(
      'demo',
      'test',
      'acs-data-DEMO-test-backup-20260101000000',
      fresh(),
    );
    expect(result.ok ? '' : result.error.code).toBe('MANIFEST_INVALID');
  });
});
