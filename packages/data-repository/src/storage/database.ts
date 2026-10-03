import { domainError, err, ok } from '@acs/domain';
import type { DomainError, Result } from '@acs/domain';
import { PROJECT_KEY_PATTERN } from '@acs/project-schema';
import Dexie from 'dexie';
import { planMigration } from '../migrations/plan.js';
import type { DataLayout, SchemaSnapshot } from './layout.js';

/** `test` holds the data of the preview, `prod` those of the published application (RG-04). */
export type DataEnvironment = 'test' | 'prod';

/** Where IndexedDB comes from: the browser's own, unless a test gives another. */
export type IndexedDbSource = {
  readonly indexedDB?: IDBFactory;
  readonly IDBKeyRange?: typeof IDBKeyRange;
};

/** An open data base with the stores of a layout. */
export type OpenEnvironment = {
  readonly name: string;
  readonly environment: DataEnvironment;
  readonly layout: DataLayout;
  readonly db: Dexie;
  close(): void;
};

export type OpenOptions = {
  readonly projectKey: string;
  readonly environment: DataEnvironment;
  readonly layout: DataLayout;
  readonly source?: IndexedDbSource;
};

const PROJECT_KEY = new RegExp(PROJECT_KEY_PATTERN);

/** The schema row of `_meta`: what the stores of this data base were built from. */
export type SchemaRow = {
  readonly key: 'schema';
  readonly version: number;
  readonly signature: string;
  /** What the stores were built from: the migration engine compares it with a later schema. */
  readonly schema?: SchemaSnapshot;
};

/** `acs-data-{key}-{env}` (dossier 6.4); the key is checked so that it cannot shape another name. */
export function databaseName(
  projectKey: string,
  environment: DataEnvironment,
): Result<string, DomainError> {
  if (!PROJECT_KEY.test(projectKey) || (environment !== 'test' && environment !== 'prod')) {
    return err(
      domainError('MANIFEST_INVALID', 'the project key or the environment is not valid', {
        details: { projectKey, environment },
      }),
    );
  }
  return ok(`acs-data-${projectKey}-${environment}`);
}

/** A storage failure as a business error: no room left, or no IndexedDB to use. */
export function storageError(error: unknown): DomainError {
  const name =
    typeof error === 'object' && error !== null ? (error as { name?: unknown }).name : '';
  if (name === 'QuotaExceededError') {
    return domainError('STORAGE_QUOTA', 'the browser has no room left for the data');
  }
  return domainError('STORAGE_UNAVAILABLE', 'the browser storage cannot be used', {
    details: { cause: String(error) },
  });
}

/** A connection to the data base `name`, from `source` or the browser; undefined without IndexedDB. */
export function dexieFor(name: string, source: IndexedDbSource | undefined): Dexie | undefined {
  const indexedDB = source?.indexedDB ?? globalThis.indexedDB;
  if (indexedDB === undefined) return undefined;
  const keyRange = source?.IDBKeyRange ?? globalThis.IDBKeyRange;
  return new Dexie(
    name,
    keyRange === undefined ? { indexedDB } : { indexedDB, IDBKeyRange: keyRange },
  );
}

export const isMissing = (error: unknown): boolean =>
  typeof error === 'object' &&
  error !== null &&
  (error as { name?: unknown }).name === 'NoSuchDatabaseError';

/**
 * Opens the data base of a project in an environment, creating it from the layout the first time.
 * One that already exists must have been built from the same layout: another one is a
 * `MIGRATION_BLOCKED` (the data migration engine moves it forward, never this function), and the
 * data base is left untouched.
 */
export async function openEnvironment(
  options: OpenOptions,
): Promise<Result<OpenEnvironment, DomainError>> {
  const named = databaseName(options.projectKey, options.environment);
  if (!named.ok) return named;
  const name = named.value;
  const { layout } = options;
  const finish = (db: Dexie): Result<OpenEnvironment, DomainError> =>
    ok({ name, environment: options.environment, layout, db, close: () => db.close() });

  try {
    const existing = dexieFor(name, options.source);
    if (existing === undefined) return err(storageError(new Error('IndexedDB is not available')));
    try {
      await existing.open();
    } catch (error) {
      if (!isMissing(error)) throw error;
      return await create(name, options, finish);
    }
    const row = (await existing.table('_meta').get('schema')) as SchemaRow | undefined;
    // Same stores is not the same schema: a field added or converted leaves the stores as they
    // are. With the schema the data base recorded, it is the migration plan that says whether
    // anything differs; without it (older data bases) only the stores can be compared.
    const current =
      row?.schema === undefined
        ? row?.signature === layout.signature
        : (() => {
            const plan = planMigration(row.schema, layout.schema);
            return plan.ok && plan.value.steps.length === 0;
          })();
    if (current) return finish(existing);
    existing.close();
    return err(
      domainError('MIGRATION_BLOCKED', 'the data base was built from another schema', {
        details: {
          name,
          found: row === undefined ? null : row.version,
          expected: layout.signature,
        },
      }),
    );
  } catch (error) {
    return err(storageError(error));
  }
}

async function create(
  name: string,
  options: OpenOptions,
  finish: (db: Dexie) => Result<OpenEnvironment, DomainError>,
): Promise<Result<OpenEnvironment, DomainError>> {
  const db = dexieFor(name, options.source);
  if (db === undefined) return err(storageError(new Error('IndexedDB is not available')));
  db.version(1).stores(
    Object.fromEntries(options.layout.stores.map((store) => [store.name, store.schema])),
  );
  await db.open();
  const row: SchemaRow = {
    key: 'schema',
    version: 1,
    signature: options.layout.signature,
    schema: options.layout.schema,
  };
  await db.table('_meta').put({ ...row, createdAt: new Date().toISOString() });
  return finish(db);
}

/**
 * Deletes the data base of an environment and checks that it is gone (SEC-09): a base that
 * cannot be opened as an existing one is absent. Deleting one that does not exist is not an error.
 * The other environment is not touched.
 */
export async function purgeEnvironment(
  projectKey: string,
  environment: DataEnvironment,
  source?: IndexedDbSource,
): Promise<Result<void, DomainError>> {
  const named = databaseName(projectKey, environment);
  if (!named.ok) return named;
  try {
    const doomed = dexieFor(named.value, source);
    if (doomed === undefined) return err(storageError(new Error('IndexedDB is not available')));
    await doomed.delete();
    const probe = dexieFor(named.value, source);
    try {
      await probe?.open();
    } catch (error) {
      if (isMissing(error)) return ok(undefined);
      throw error;
    }
    probe?.close();
    return err(
      domainError('STORAGE_UNAVAILABLE', 'the data base is still there after its deletion', {
        details: { name: named.value },
      }),
    );
  } catch (error) {
    return err(storageError(error));
  }
}
