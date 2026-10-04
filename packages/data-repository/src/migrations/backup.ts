import { domainError, err, ok } from '@acs/domain';
import type { DomainError, Result } from '@acs/domain';
import type Dexie from 'dexie';
import { backupName, isBackupOf } from '../storage/backup-names.js';
import { databaseName, dexieFor, isMissing, storageError } from '../storage/database.js';
import type { DataEnvironment, IndexedDbSource } from '../storage/database.js';

export { backupName };

/** What a backup says about itself (the `__backup` store of the backup data base). */
type BackupInfo = {
  readonly key: 'info';
  readonly createdAt: string;
  readonly fromSignature: string;
  /** The schema of every store as it was, to build the data base again. */
  readonly stores: Readonly<Record<string, string>>;
  readonly counts: Readonly<Record<string, number>>;
  /** What the data was, as a digest: a backup is used again only for data that has not changed. */
  readonly contentHash?: string;
};

const INFO_STORE = '__backup';

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

/** Every row of every store, read in one transaction (a consistent picture). Only requests inside it. */
async function readDump(db: Dexie): Promise<Record<string, unknown[]>> {
  const tables = db.tables;
  return db.transaction('r', tables, async () => {
    const rows: Record<string, unknown[]> = {};
    for (const table of tables) rows[table.name] = await table.toArray();
    return rows;
  });
}

/** JSON with the keys in order, so that the same data always gives the same text. */
function canonical(value: unknown): string {
  return JSON.stringify(value, (_key, item: unknown) =>
    item !== null && typeof item === 'object' && !Array.isArray(item)
      ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
      : item,
  );
}

/**
 * A digest of the data of a data base: its records and links, not its `_meta`, which the migration
 * itself writes (its state, its list of backups) after the copy is taken.
 */
async function contentHash(dump: Record<string, unknown[]>): Promise<string> {
  const data = Object.entries(dump)
    .filter(([name]) => name !== '_meta')
    .sort(([a], [b]) => (a < b ? -1 : 1));
  const bytes = new TextEncoder().encode(canonical(data));
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
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
    // Read everything first, only requests of that data base inside the transaction: waiting for
    // another data base would let it close.
    const dump = await readDump(existing);
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
      contentHash: await contentHash(dump),
    };
    await copy.table(INFO_STORE).put(info);
  } finally {
    copy.close();
  }
}

/**
 * Whether `existing` is exactly what the backup `name` holds: the same data, and the data base
 * built from the same schema (`signature`). Only then may the backup be used again for a
 * migration: otherwise it would not hold what the migration is about to destroy (RG-09). A backup
 * without a digest, or one that cannot be read, matches nothing.
 */
export async function matchesBackup(
  existing: Dexie,
  name: string,
  source: IndexedDbSource | undefined,
  signature: string,
): Promise<boolean> {
  const saved = dexieFor(name, source);
  if (saved === undefined) return false;
  try {
    await saved.open();
    const info = saved.tables.some((table) => table.name === INFO_STORE)
      ? ((await saved.table(INFO_STORE).get('info')) as BackupInfo | undefined)
      : undefined;
    saved.close();
    if (info?.contentHash === undefined || info.fromSignature !== signature) return false;
    return info.contentHash === (await contentHash(await readDump(existing)));
  } catch {
    return false;
  }
}

/**
 * Writes the name of a backup in the data base it was taken from, so that a purge finds it even
 * in a browser that cannot list its data bases.
 */
export async function registerBackup(existing: Dexie, name: string): Promise<void> {
  const registry = (await existing.table('_meta').get('backups')) as
    { names?: string[] } | undefined;
  await existing.table('_meta').put({ key: 'backups', names: [...(registry?.names ?? []), name] });
}

/**
 * Puts a data base back as a backup holds it: deletes the current one and rebuilds it, with its
 * stores, indexes and rows. The backup must be one taken of this very environment: the data of
 * the test data base never replaces production, and a made-up name replaces nothing (RG-04).
 * The application must reopen the data base afterwards.
 */
export async function restoreBackup(
  projectKey: string,
  environment: DataEnvironment,
  backup: string,
  source?: IndexedDbSource,
): Promise<Result<void, DomainError>> {
  const named = databaseName(projectKey, environment);
  if (!named.ok) return named;
  if (!isBackupOf(named.value, backup)) {
    return err(
      domainError('ENVIRONMENT_FORBIDDEN', `${backup} is not a backup of ${named.value}`, {
        details: { backup, database: named.value },
      }),
    );
  }
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
