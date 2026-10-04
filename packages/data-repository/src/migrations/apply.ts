import { domainError, err, ok } from '@acs/domain';
import type { DomainError, JsonValue, Result } from '@acs/domain';
import type Dexie from 'dexie';
import { databaseName, dexieFor, isMissing, storageError } from '../storage/database.js';
import type { DataEnvironment, IndexedDbSource, SchemaRow } from '../storage/database.js';
import { deriveKeys } from '../storage/layout.js';
import type { DataLayout, EntityLayout } from '../storage/layout.js';
import { checkFieldValue } from '../values/field-value.js';
import { backupName, createBackup, exists, matchesBackup, registerBackup } from './backup.js';
import { conversionFor } from './convert.js';
import { planMigration } from './plan.js';
import type { MigrationPlan } from './plan.js';
import { own } from '../values/own.js';

/** Where a migration is, for whoever shows it: the application, or a test that interrupts it. */
export type MigrationStage = 'planned' | 'backup' | 'started' | 'upgrade' | 'done';

export type MigrationOptions = {
  readonly projectKey: string;
  readonly environment: DataEnvironment;
  /** The schema the data base must reach. */
  readonly layout: DataLayout;
  readonly source?: IndexedDbSource;
  /** The designer has validated a destructive plan (RG-09). Without it, a destructive plan is refused. */
  readonly approveDestructive?: boolean;
  readonly now?: () => Date;
  /** Called as the migration goes on. What it throws stops the migration where it is. */
  readonly onProgress?: (stage: MigrationStage) => void | Promise<void>;
};

export type MigrationResult = {
  readonly plan: MigrationPlan;
  /** False when the data base was already at that schema. */
  readonly applied: boolean;
  /** The data base that holds the copy taken before a destructive plan. */
  readonly backup?: string;
};

/** The state of a migration, in `_meta` (dossier 6.5: "état enregistré dans `_meta`"). */
type MigrationRow = {
  readonly key: 'migration';
  readonly status: 'started' | 'failed' | 'done';
  readonly fingerprint: string;
  readonly fromSignature: string;
  readonly toSignature: string;
  readonly backup?: string;
  readonly startedAt: string;
  readonly finishedAt?: string;
  readonly message?: string;
};

type Row = Record<string, unknown> & { id: string };

/** A row or a table that the plan cannot be applied to: thrown inside the upgrade, which then undoes all of it. */
class MigrationFailure extends Error {
  readonly details: Readonly<Record<string, unknown>>;

  constructor(message: string, details: Readonly<Record<string, unknown>>) {
    super(message);
    this.name = 'MigrationFailure';
    this.details = details;
  }
}

const blocked = (message: string, details?: Record<string, unknown>): DomainError =>
  domainError('MIGRATION_BLOCKED', message, details === undefined ? {} : { details });

/** What the rows of one entity go through. */
type Work = {
  readonly entity: string;
  readonly layout: EntityLayout;
  /** Fields added as required without a default: refused when the table has rows. */
  readonly guards: readonly string[];
  readonly transforms: ((row: Row) => void)[];
};

/** A default as the field stores it. */
function stored(layout: EntityLayout, field: string, value: JsonValue): JsonValue {
  const info = layout.fields.get(field);
  const checked = info === undefined ? undefined : checkFieldValue(info.definition, value);
  if (checked === undefined || !checked.ok) {
    throw new MigrationFailure(`${layout.key}.${field}: the default is not a valid value`, {
      entity: layout.key,
      field,
    });
  }
  return structuredClone(checked.value);
}

/** The row-level part of a plan, per entity, worked out without touching the data base. */
function dataWork(plan: MigrationPlan, layout: DataLayout): Work[] {
  const works = new Map<
    string,
    { entity: string; layout: EntityLayout; guards: string[]; transforms: Work['transforms'] }
  >();
  const of = (entity: string) => {
    const existing = works.get(entity);
    if (existing !== undefined) return existing;
    const entityLayout = layout.entities.get(entity);
    if (entityLayout === undefined) throw new RangeError(`the schema has no entity ${entity}`);
    const created = { entity, layout: entityLayout, guards: [], transforms: [] };
    works.set(entity, created);
    return created;
  };

  for (const { op } of plan.steps) {
    switch (op.kind) {
      case 'addField': {
        const work = of(op.entity);
        if (op.required && op.default === undefined) work.guards.push(op.field);
        if (op.default !== undefined) {
          const value = op.default;
          work.transforms.push((row) => {
            if (own(row, op.field) === undefined)
              row[op.field] = stored(work.layout, op.field, value);
          });
        }
        break;
      }
      case 'makeRequired': {
        const work = of(op.entity);
        const value = op.default;
        work.transforms.push((row) => {
          const present = own(row, op.field);
          if (present !== undefined && present !== null) return;
          if (value === undefined) {
            throw new MigrationFailure(
              `${op.entity}.${op.field}: a record has no value and the field has no default`,
              { entity: op.entity, field: op.field, id: row.id },
            );
          }
          row[op.field] = stored(work.layout, op.field, value);
        });
        break;
      }
      case 'removeField':
        of(op.entity).transforms.push((row) => {
          delete row[op.field];
        });
        break;
      case 'renameField':
        of(op.entity).transforms.push((row) => {
          if (Object.hasOwn(row, op.from)) {
            row[op.to] = row[op.from];
            delete row[op.from];
          }
        });
        break;
      case 'changeType': {
        const conversion = conversionFor(op.from, op.to);
        if (conversion === undefined) break;
        of(op.entity).transforms.push((row) => {
          const value = own(row, op.field);
          if (value === undefined || value === null) return;
          const converted = conversion.convert(value as JsonValue);
          if (!converted.ok) {
            throw new MigrationFailure(`${op.entity}.${op.field}: ${converted.error}`, {
              entity: op.entity,
              field: op.field,
              id: row.id,
            });
          }
          row[op.field] = converted.value;
        });
        break;
      }
      default:
        // Entities, indexes and relations are in the schema of the stores: nothing to do to rows.
        break;
    }
  }
  return [...works.values()];
}

/** The keys kept for the indexes are written again from the values, so that none is left over or missing. */
function rederive(row: Row, layout: EntityLayout): void {
  for (const key of Object.keys(row)) if (key.startsWith('_k_')) delete row[key];
  Object.assign(row, deriveKeys(layout, row));
}

/**
 * A migration that failed, as a business error: a record that cannot follow, or a unique index
 * that cannot be built. IndexedDB gives the second only as "AbortError" once an upgrade function
 * is involved, so it is told from the plan: an upgrade that is aborted while it builds a unique
 * index is reported as that, with the indexes it was building.
 */
function failureError(error: unknown, plan: MigrationPlan): DomainError {
  if (error instanceof MigrationFailure) return blocked(error.message, { ...error.details });
  const unique = plan.steps.flatMap(({ op }) =>
    op.kind === 'addIndex' && op.unique ? [`${op.entity}.${op.index}`] : [],
  );
  const aborted = (error as { name?: unknown } | null)?.name === 'AbortError';
  if ((aborted || String(error).includes('ConstraintError')) && unique.length > 0) {
    return blocked(
      `a unique index cannot be built, two records share a value (${unique.join(', ')})`,
      { uniqueIndexes: unique },
    );
  }
  return storageError(error);
}

type State = {
  readonly db: Dexie;
  readonly verno: number;
  readonly schemaRow: SchemaRow & { readonly schema: NonNullable<SchemaRow['schema']> };
  readonly migrationRow: MigrationRow | undefined;
};

/** Opens the data base as it is and reads what a migration needs. The caller closes `db`. */
async function readState(
  name: string,
  source: IndexedDbSource | undefined,
): Promise<Result<State, DomainError>> {
  const db = dexieFor(name, source);
  if (db === undefined) return err(storageError(new Error('IndexedDB is not available')));
  try {
    await db.open();
  } catch (error) {
    return isMissing(error)
      ? err(blocked('there is no data base to migrate'))
      : err(storageError(error));
  }
  const row = (await db.table('_meta').get('schema')) as SchemaRow | undefined;
  if (row?.schema === undefined) {
    db.close();
    return err(blocked('this data base does not record the schema it was built from'));
  }
  const migrationRow = (await db.table('_meta').get('migration')) as MigrationRow | undefined;
  return ok({
    db,
    verno: db.verno,
    schemaRow: { ...row, schema: row.schema },
    migrationRow,
  });
}

/** What a migration would do, without doing anything (the plan to show before asking for approval). */
export async function previewMigration(
  options: Pick<MigrationOptions, 'projectKey' | 'environment' | 'layout' | 'source'>,
): Promise<Result<MigrationPlan, DomainError>> {
  const named = databaseName(options.projectKey, options.environment);
  if (!named.ok) return named;
  try {
    const state = await readState(named.value, options.source);
    if (!state.ok) return state;
    state.value.db.close();
    return planMigration(state.value.schemaRow.schema, options.layout.schema);
  } catch (error) {
    return err(storageError(error));
  }
}

/**
 * Takes a data base to a new schema (EF-DAT-05, dossier 6.5). The plan is made from the schema
 * the data base recorded; a destructive one is refused unless approved (RG-09) and, once approved,
 * is preceded by a copy of the whole data base, checked row by row. The state goes into `_meta`
 * before the change and the change itself is one IndexedDB upgrade: all of it or none, so an
 * interruption leaves the old data base, and running it again resumes with the same plan and the
 * same backup. A record that cannot follow (a value that does not convert, a required field
 * with no default) refuses the whole migration, naming it, and changes nothing. Other
 * connections to the data base are closed by the upgrade: the application opens it again after.
 */
export async function migrateEnvironment(
  options: MigrationOptions,
): Promise<Result<MigrationResult, DomainError>> {
  const named = databaseName(options.projectKey, options.environment);
  if (!named.ok) return named;
  const name = named.value;
  const now = options.now ?? (() => new Date());
  const { layout, source } = options;

  const state = await readState(name, source).catch((error: unknown) => err(storageError(error)));
  if (!state.ok) return state;
  const { db, verno, schemaRow, migrationRow } = state.value;
  let open = true;
  const close = (): void => {
    if (open) db.close();
    open = false;
  };

  try {
    const made = planMigration(schemaRow.schema, layout.schema);
    if (!made.ok) return made;
    const plan = made.value;
    if (plan.steps.length === 0) return ok({ plan, applied: false });
    if (plan.destructive && options.approveDestructive !== true) {
      return err(
        blocked('this migration loses data and has not been approved', {
          destructive: plan.steps
            .filter((item) => item.destructive)
            .map((item) => item.description),
          fingerprint: plan.fingerprint,
        }),
      );
    }
    await options.onProgress?.('planned');

    let backup: string | undefined;
    if (plan.destructive) {
      // The last backup is used again if it holds exactly what the data base holds now, data and
      // schema: an interrupted migration is resumed with its copy, and a migration that is refused
      // and tried again does not copy everything again. As soon as anything was written since, it
      // would not hold what the migration is about to destroy (RG-09): a new copy is taken.
      const resumable =
        migrationRow?.backup !== undefined &&
        (await exists(migrationRow.backup, source)) &&
        (await matchesBackup(db, migrationRow.backup, source, schemaRow.signature));
      if (resumable && migrationRow?.backup !== undefined) {
        backup = migrationRow.backup;
      } else {
        let candidate = backupName(name, now());
        for (let n = 2; await exists(candidate, source); n += 1) {
          candidate = `${backupName(name, now())}-${n}`;
        }
        await options.onProgress?.('backup');
        await createBackup(db, candidate, schemaRow.signature, source, now());
        await registerBackup(db, candidate);
        backup = candidate;
      }
    }

    const started: MigrationRow = {
      key: 'migration',
      status: 'started',
      fingerprint: plan.fingerprint,
      fromSignature: schemaRow.signature,
      toSignature: layout.signature,
      ...(backup === undefined ? {} : { backup }),
      startedAt: now().toISOString(),
    };
    await db.table('_meta').put(started);
    await options.onProgress?.('started');
    close();
    await options.onProgress?.('upgrade');

    const works = dataWork(plan, layout);
    const next = dexieFor(name, source);
    if (next === undefined) return err(storageError(new Error('IndexedDB is not available')));
    next
      .version(verno + 1)
      .stores(Object.fromEntries(layout.stores.map((store) => [store.name, store.schema])))
      .upgrade(async (tx) => {
        for (const work of works) {
          const table = tx.table(work.layout.storeName);
          for (const field of work.guards) {
            if ((await table.count()) > 0) {
              throw new MigrationFailure(
                `${work.entity}.${field}: a required field added to records that exist needs a default`,
                { entity: work.entity, field },
              );
            }
          }
          if (work.transforms.length > 0) {
            await table.toCollection().modify((row: Row) => {
              for (const transform of work.transforms) transform(row);
              rederive(row, work.layout);
            });
          }
        }
        const schema: SchemaRow = {
          key: 'schema',
          version: verno + 1,
          signature: layout.signature,
          schema: layout.schema,
        };
        await tx.table('_meta').put(schema);
        await tx.table('_meta').put({
          ...started,
          status: 'done',
          finishedAt: now().toISOString(),
        } satisfies MigrationRow);
      });
    try {
      await next.open();
      next.close();
    } catch (error) {
      next.close();
      const failure = failureError(error, plan);
      await recordFailure(name, source, started, failure.message);
      return err(failure);
    }
    await options.onProgress?.('done');
    return ok({ plan, applied: true, ...(backup === undefined ? {} : { backup }) });
  } catch (error) {
    return err(storageError(error));
  } finally {
    close();
  }
}

/** Leaves a trace of why a migration did not go through, next to the untouched data. */
async function recordFailure(
  name: string,
  source: IndexedDbSource | undefined,
  started: MigrationRow,
  message: string,
): Promise<void> {
  try {
    const db = dexieFor(name, source);
    if (db === undefined) return;
    await db.open();
    await db.table('_meta').put({ ...started, status: 'failed', message } satisfies MigrationRow);
    db.close();
  } catch {
    // The trace is a courtesy: the data base itself is what matters, and it is unchanged.
  }
}
