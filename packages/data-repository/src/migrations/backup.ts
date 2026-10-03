import { domainError, err, ok } from '@acs/domain';
import type { DomainError, Result } from '@acs/domain';
import type Dexie from 'dexie';
import { databaseName, dexieFor, isMissing, storageError } from '../storage/database.js';
import type { DataEnvironment, IndexedDbSource } from '../storage/database.js';

/** What a backup says about itself (the `__backup` store of the backup data base). */
type BackupInfo = {
  readonly key: 'info';
  readonly createdAt: string;
  readonly fromSignature: string;
  /** The schema of every store as it was, to build the data base again. */
  readonly stores: Readonly<Record<string, string>>;
  readonly counts: Readonly<Record<string, number>>;
};

const INFO_STORE = '__backup';

/** `acs-data-{key}-{env}-backup-{yyyymmddhhmmss}`: one data base per backup. */
export function backupName(databaseNameValue: string, at: Date): string {
  const stamp = at.toISOString().replace(/[-:T]/g, '').slice(0, 14);
  return `${databaseNameValue}-backup-${stamp}`;
}

const specOf = (table: Dexie['tables'][number]): string =>
  [table.schema.primKey.src, ...table.schema.indexes.map((index) => index.src)].join(',');

/** Whether a data base of that name exists. */
export async function exists(name: string, source: IndexedDbSource | undefined): Promise<boolean> {
  const probe = dexieFor(name, source);
  if (probe === undefined) return false;
  try {
    await probe.open();
    probe.close();
    return true;
  } catch (error) {
    if (isMissing(error)) return false;
    throw error;
  }
}

/**
 * Copies every store of an open data base into a data base of its own, in one read transaction (a
 * consistent picture), then checks the copy row count by row count: a backup that cannot be
 * trusted is worse than none (RG-09). Throws if anything is wrong.
 */
export async function createBackup(
  existing: Dexie,
  name: string,
  fromSignature: string,
  source: IndexedDbSource | undefined,
  now: Date,
): Promise<void> {
  const copy = dexieFor(name, source);
  if (copy === undefined) throw new Error('IndexedDB is not available');
  const tables = existing.tables;
  copy.version(1).stores({
    ...Object.fromEntries(tables.map((table) => [table.name, table.schema.primKey.src])),
    [INFO_STORE]: 'key',
  });
  await copy.open();
  try {
    // Read everything first, in one transaction, and only requests of that data base inside it:
    // waiting for another data base would let the transaction close.
    const dump = await existing.transaction('r', tables, async () => {
      const rows: Record<string, unknown[]> = {};
      for (const table of tables) rows[table.name] = await table.toArray();
      return rows;
    });
    const counts: Record<string, number> = {};
    for (const table of tables) {
      const rows = dump[table.name] ?? [];
      counts[table.name] = rows.length;
      await copy.table(table.name).bulkAdd(rows);
    }
    for (const table of tables) {
      if ((await copy.table(table.name).count()) !== counts[table.name]) {
        throw new Error(`the backup of ${table.name} does not have as many rows as the original`);
      }
    }
    const info: BackupInfo = {
      key: 'info',
      createdAt: now.toISOString(),
      fromSignature,
      stores: Object.fromEntries(tables.map((table) => [table.name, specOf(table)])),
      counts,
    };
    await copy.table(INFO_STORE).put(info);
  } finally {
    copy.close();
  }
}

/**
 * Puts a data base back as a backup holds it: deletes the current one and rebuilds it, with its
 * stores, indexes and rows. The application must reopen it afterwards.
 */
export async function restoreBackup(
  projectKey: string,
  environment: DataEnvironment,
  backup: string,
  source?: IndexedDbSource,
): Promise<Result<void, DomainError>> {
  const named = databaseName(projectKey, environment);
  if (!named.ok) return named;
  try {
    const saved = dexieFor(backup, source);
    if (saved === undefined) return err(storageError(new Error('IndexedDB is not available')));
    try {
      await saved.open();
    } catch (error) {
      if (isMissing(error)) {
        return err(domainError('MIGRATION_BLOCKED', `there is no backup named ${backup}`));
      }
      throw error;
    }
    try {
      const info = saved.tables.some((table) => table.name === INFO_STORE)
        ? ((await saved.table(INFO_STORE).get('info')) as BackupInfo | undefined)
        : undefined;
      if (info === undefined) {
        return err(domainError('MIGRATION_BLOCKED', `${backup} is not a backup of a data base`));
      }
      const rows: Record<string, unknown[]> = {};
      for (const name of Object.keys(info.stores)) rows[name] = await saved.table(name).toArray();

      const current = dexieFor(named.value, source);
      if (current === undefined) return err(storageError(new Error('IndexedDB is not available')));
      await current.delete();
      const rebuilt = dexieFor(named.value, source);
      if (rebuilt === undefined) return err(storageError(new Error('IndexedDB is not available')));
      rebuilt.version(1).stores(info.stores);
      await rebuilt.open();
      try {
        for (const [name, list] of Object.entries(rows)) await rebuilt.table(name).bulkAdd(list);
      } finally {
        rebuilt.close();
      }
      return ok(undefined);
    } finally {
      saved.close();
    }
  } catch (error) {
    return err(storageError(error));
  }
}
