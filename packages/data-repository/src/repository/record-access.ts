import { domainError, err, isUuidV7, newId, ok } from '@acs/domain';
import type {
  DomainError,
  Draft,
  EntityKey,
  EntityOperations,
  Id,
  Page,
  QuerySpec,
  RecordEnvelope,
  Result,
  UnitOfWork,
} from '@acs/domain';
import { DataError } from '../errors.js';
import { executeQuery, prepareQuery } from '../query/run.js';
import type { OpenEnvironment } from '../storage/database.js';
import { storageError } from '../storage/database.js';
import { deriveKeys } from '../storage/layout.js';
import type { EntityLayout } from '../storage/layout.js';
import { createChangeBus } from './changes.js';
import type { ChangeBus } from './changes.js';
import { constraintError, normaliseRecord } from './constraints.js';
import type { Violation } from './constraints.js';
import { referenceLookups, uniqueLookups } from './lookups.js';
import { applyDeletion, blockedError, planDeletion, relationLinks } from './relations.js';
import type { RelationLinks } from './relations.js';

/** Reads, queries and writes of one entity. */
export type RecordOperations<T extends RecordEnvelope> = EntityOperations<T>;

export type RecordUnitOfWork = UnitOfWork;

export type RecordAccess = {
  entity<T extends RecordEnvelope>(entity: EntityKey): RecordOperations<T>;
  /** The links of an N-N relation, by the id of the relation in the manifest. */
  links(relationId: string): RelationLinks;
  transaction<R>(work: (uow: RecordUnitOfWork) => Promise<R>): Promise<R>;
  /** Told after each committed write which stores it touched (what `observe` listens to). */
  readonly changes: ChangeBus;
};

export type AccessOptions = {
  /** Who writes: recorded as `_createdBy` and `_updatedBy`. */
  readonly actor?: () => string;
  readonly now?: () => Date;
};

type Row = Record<string, unknown> & { id: string; _v: number };

const DERIVED_PREFIX = '_k_';

/** A record as the caller sees it: without the keys the Repository keeps for the indexes. */
function visible<T extends RecordEnvelope>(row: Row): T {
  return Object.fromEntries(
    Object.entries(row).filter(([key]) => !key.startsWith(DERIVED_PREFIX)),
  ) as unknown as T;
}

/** A failure of the data base as a business error: a refused write is a constraint, the rest is storage. */
export function writeError(error: unknown): DomainError {
  const name =
    typeof error === 'object' && error !== null ? (error as { name?: unknown }).name : '';
  if (name === 'ConstraintError') {
    return domainError(
      'CONSTRAINT_VIOLATION',
      'the data base refused the write: a value is not unique',
    );
  }
  return storageError(error);
}

const versionConflict = (entity: string, expected: number, found: number | null): DomainError =>
  domainError(
    'VERSION_CONFLICT',
    `${entity}: the record is no longer at version ${expected}; reload it`,
    { details: { entity, expected, found } },
  );

/**
 * Reads and writes of the records of an open data base, with the envelope of dossier 6.4, the
 * optimistic lock (`expectedVersion`) and the constraints of the entity. Every write is a
 * transaction over all the stores: all or nothing, and two writes never interleave.
 */
export function createRecordAccess(
  environment: OpenEnvironment,
  options: AccessOptions = {},
): RecordAccess {
  const actor = options.actor ?? (() => 'local');
  const now = options.now ?? (() => new Date());
  const dataTables = environment.layout.stores
    .filter(
      (store) =>
        store.name.startsWith('e_') || store.name.startsWith('j_') || store.name === '_files',
    )
    .map((store) => environment.db.table(store.name));
  // Rule for everything awaited inside a transaction: only IndexedDB requests. Observed: two
  // `async` helpers in a row that end without making a request (nothing to look up) made a
  // transaction nested in a UnitOfWork close too early ("committed too early"); one did not.
  // Not understood to the bottom, so none is awaited: the lookups are listed without I/O
  // (lookups.ts) and run here, request by request.
  const inTransaction = <R>(work: () => Promise<R>): Promise<R> =>
    environment.db.transaction('rw', dataTables, work);

  const changes = createChangeBus();
  /** A write reports the stores it touched: into the set of its transaction, or to the listeners when it is alone. */
  const publish = (sink: Set<string> | undefined, stores: Iterable<string>): void => {
    if (sink === undefined) changes.notify(new Set(stores));
    else for (const store of stores) sink.add(store);
  };

  function entity<T extends RecordEnvelope>(
    entityKey: EntityKey,
    sink?: Set<string>,
  ): RecordOperations<T> {
    const known = environment.layout.entities.get(entityKey);
    if (known === undefined) throw new RangeError(`the project has no entity ${entityKey}`);
    const layout: EntityLayout = known;
    const table = environment.db.table(layout.storeName);

    async function save(
      input: Draft<T>,
      expectedVersion?: number,
    ): Promise<Result<T, DomainError>> {
      const { id: given, ...fields } = input as Draft<T> & Record<string, unknown>;
      if (given !== undefined && (typeof given !== 'string' || !isUuidV7(given))) {
        return err(
          constraintError(entityKey, [
            { field: 'id', rule: 'format', message: 'an id is a UUID v7' },
          ]),
        );
      }
      const normalised = normaliseRecord(layout as EntityLayout, fields);
      try {
        const saved = await inTransaction(async () => {
          const id = (given ?? newId()) as string;
          // Always read first, even for a new id: an IndexedDB transaction that has placed no
          // request yet closes as soon as the code waits for anything else (here, the checks).
          const stored = (await table.get(id)) as Row | undefined;
          if (expectedVersion !== undefined && stored?._v !== expectedVersion) {
            return err(versionConflict(entityKey, expectedVersion, stored?._v ?? null));
          }
          if (!normalised.ok) return err(constraintError(entityKey, normalised.error));

          const derived = deriveKeys(layout, normalised.value);
          const violations: Violation[] = [];
          for (const lookup of [
            ...uniqueLookups(layout, { ...normalised.value, ...derived }),
            ...referenceLookups(environment, layout, normalised.value),
          ]) {
            let issue: boolean;
            if (lookup.kind === 'unique') {
              const found = (await environment.db
                .table(lookup.store)
                .where(lookup.index)
                .equals(lookup.key)
                .first()) as Row | undefined;
              issue = found !== undefined && found.id !== id;
            } else {
              const found = await environment.db.table(lookup.store).bulkGet([...lookup.ids]);
              issue = found.some((row) => row === undefined);
            }
            if (issue) {
              violations.push({
                field: lookup.field,
                rule: lookup.kind === 'unique' ? 'unique' : 'reference',
                message:
                  lookup.kind === 'unique' ? 'another record has this value' : lookup.message,
              });
            }
          }
          if (violations.length > 0) return err(constraintError(entityKey, violations));

          const stamp = now().toISOString();
          const row = {
            ...normalised.value,
            ...derived,
            id,
            _v: (stored?._v ?? 0) + 1,
            _createdAt: stored?._createdAt ?? stamp,
            _updatedAt: stamp,
            _createdBy: stored?._createdBy ?? actor(),
            _updatedBy: actor(),
          };
          await table.put(row);
          return ok(visible<T>(row as Row));
        });
        if (saved.ok) publish(sink, [layout.storeName]);
        return saved;
      } catch (error) {
        return err(writeError(error));
      }
    }

    async function remove(id: Id, expectedVersion?: number): Promise<Result<void, DomainError>> {
      let touched: string[] = [];
      try {
        const removed = await inTransaction(async () => {
          const plan = await planDeletion(environment, entityKey, id);
          if (expectedVersion !== undefined && plan.root?._v !== expectedVersion) {
            return err(versionConflict(entityKey, expectedVersion, plan.root?._v ?? null));
          }
          if (plan.root === undefined) return ok(undefined);
          if (plan.blockers.length > 0) return err(blockedError(entityKey, id, plan.blockers));
          await applyDeletion(environment, plan, actor(), now().toISOString());
          const storeOf = (items: Iterable<{ entity: string }>) =>
            [...items].map((item) => environment.layout.entities.get(item.entity)?.storeName ?? '');
          touched = [
            ...storeOf(plan.remove.values()),
            ...storeOf(plan.clear),
            ...[...plan.junctionRows.values()].map((link) => link.store),
          ];
          return ok(undefined);
        });
        if (removed.ok) publish(sink, touched);
        return removed;
      } catch (error) {
        return err(writeError(error));
      }
    }

    return {
      entity: entityKey,
      get: async (id) => {
        const row = (await table.get(id)) as Row | undefined;
        return row === undefined ? null : visible<T>(row);
      },
      query: async (spec: QuerySpec): Promise<Page<T>> => {
        // Checked before anything is awaited: inside a transaction nothing but a request may be.
        if (spec.source !== entityKey) {
          throw new DataError(
            domainError('QUERY_INVALID', `this repository is for ${entityKey}, not ${spec.source}`),
          );
        }
        const prepared = prepareQuery(environment, spec);
        if (!prepared.ok) throw new DataError(prepared.error);
        const run = await executeQuery(environment, prepared.value);
        if (!run.ok) throw new DataError(run.error);
        return run.value.page as unknown as Page<T>;
      },
      save,
      delete: remove,
    };
  }

  return {
    entity: (entityKey) => entity(entityKey),
    changes,
    links: (relationId) => {
      const links = relationLinks(environment, relationId, inTransaction, writeError);
      const store = environment.layout.relations.find((r) => r.id === relationId)?.junctionStore;
      const told = (result: Result<void, DomainError>): Result<void, DomainError> => {
        if (result.ok && store !== undefined) publish(undefined, [store]);
        return result;
      };
      return {
        ...links,
        link: async (sourceId, targetId) => told(await links.link(sourceId, targetId)),
        unlink: async (sourceId, targetId) => told(await links.unlink(sourceId, targetId)),
      };
    },
    /** Throw from `work` to undo everything it wrote. It must wait for nothing but these operations. */
    transaction: async (work) => {
      const touched = new Set<string>();
      const result = await inTransaction(() => work({ of: (key) => entity(key, touched) }));
      publish(undefined, touched);
      return result;
    },
  };
}
