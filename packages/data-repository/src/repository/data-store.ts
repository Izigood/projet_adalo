import type {
  DataStore,
  Observable,
  Page,
  QuerySpec,
  RecordEnvelope,
  Repository,
} from '@acs/domain';
import { DataError } from '../errors.js';
import { prepareQuery, runQuery } from '../query/run.js';
import type { OpenEnvironment } from '../storage/database.js';
import { storageError } from '../storage/database.js';
import { createRecordAccess } from './record-access.js';
import type { AccessOptions, RecordAccess } from './record-access.js';
import type { RelationLinks } from './relations.js';

/** The port of dossier 7.1 over an open data base, plus the links of N-N relations. */
export type LocalDataStore = DataStore & {
  links(relationId: string): RelationLinks;
  /** The same writes and reads without the port's shape (a `Result` for a query). */
  readonly access: RecordAccess;
};

/**
 * What a query gives, now and after every committed write that touches its entity (or something
 * a cascade took from it). A page that has not changed is not given again. The query is checked
 * when `observe` is called (a `DataError` if it is invalid); a failure while reading it again is
 * given to `onError` and the subscription goes on. Writes from another tab are not seen.
 */
function observeQuery<T extends RecordEnvelope>(
  environment: OpenEnvironment,
  access: RecordAccess,
  spec: QuerySpec,
): Observable<Page<T>> {
  const prepared = prepareQuery(environment, spec);
  if (!prepared.ok) throw new DataError(prepared.error);
  const store = prepared.value.store;

  return {
    subscribe(observer, onError) {
      let active = true;
      let running = false;
      let again = false;
      let last: string | undefined;

      const refresh = async (): Promise<void> => {
        if (running) {
          again = true;
          return;
        }
        running = true;
        try {
          do {
            again = false;
            const run = await runQuery(environment, spec);
            if (!active) return;
            if (!run.ok) {
              onError?.(run.error);
            } else {
              const text = JSON.stringify(run.value.page);
              if (text !== last) {
                last = text;
                observer(run.value.page as unknown as Page<T>);
              }
            }
          } while (again && active);
        } catch (error) {
          onError?.(storageError(error));
        } finally {
          running = false;
        }
      };

      const stop = access.changes.subscribe((stores) => {
        if (stores.has(store)) void refresh();
      });
      void refresh();
      return () => {
        active = false;
        stop();
      };
    },
  };
}

/**
 * The `DataStore` of dossier 7.1 for an open data base: one `Repository` per entity, with `get`,
 * `query`, `save`, `delete`, `transaction` and `observe`. `query` and `observe` throw a
 * `DataError` (carrying the business error) where the port cannot return a `Result`.
 */
export function createDataStore(
  environment: OpenEnvironment,
  options: AccessOptions = {},
): LocalDataStore {
  const access = createRecordAccess(environment, options);
  return {
    access,
    links: (relationId) => access.links(relationId),
    repository<T extends RecordEnvelope>(entity: string): Repository<T> {
      return {
        ...access.entity<T>(entity),
        transaction: (work) => access.transaction(work),
        observe: (spec) => observeQuery<T>(environment, access, spec),
      };
    },
  };
}
