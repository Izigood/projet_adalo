import type { IndexableType } from 'dexie';
import type { OpenEnvironment } from '../storage/database.js';
import type { EntityLayout } from '../storage/layout.js';
import { own } from '../values/own.js';

/**
 * What a `save` has to look up before it writes. They are worked out here, with no I/O, and run
 * by the caller one request at a time: everything awaited inside a transaction must be an
 * IndexedDB request, so there is no `async` helper in between (see `createRecordAccess`).
 */
export type Lookup =
  /** Another record with the same value in a unique index is a violation. */
  | {
      readonly kind: 'unique';
      readonly field: string;
      readonly store: string;
      readonly index: string;
      readonly key: IndexableType;
    }
  /** Every id must be the id of a record in `store`. */
  | {
      readonly kind: 'exists';
      readonly field: string;
      readonly store: string;
      readonly ids: readonly string[];
      readonly message: string;
    };

/** One lookup per unique index (found before the write so that the error names its fields). */
export function uniqueLookups(
  layout: EntityLayout,
  record: Readonly<Record<string, unknown>>,
): Lookup[] {
  const lookups: Lookup[] = [];
  for (const index of layout.indexes) {
    if (!index.unique || index.multiEntry) continue;
    const key = index.keyPaths.map((path) => own(record, path));
    if (key.some((part) => part === undefined || part === null)) continue;
    lookups.push({
      kind: 'unique',
      field: index.fields.join('+'),
      store: layout.storeName,
      index: index.dexieName,
      key: (key.length === 1 ? key[0] : key) as IndexableType,
    });
  }
  return lookups;
}

/**
 * Every record a `save` points at must exist (dossier 6.4: "intégrité vérifiée par le
 * repository"): the target of a `reference`, the record of a dictionary behind a `choice` or
 * `multiChoice`, and the file of a `file` or `image` in `_files`.
 */
export function referenceLookups(
  environment: OpenEnvironment,
  layout: EntityLayout,
  record: Readonly<Record<string, unknown>>,
): Lookup[] {
  const lookups: Lookup[] = [];
  const keys = new Map(
    environment.layout.foreignKeys.map((fk) => [`${fk.holder}.${fk.field}`, fk]),
  );
  for (const info of layout.fields.values()) {
    const value = own(record, info.key);
    if (value === undefined || value === null) continue;
    const foreign = keys.get(`${layout.key}.${info.key}`);
    const isFile = info.type === 'file' || info.type === 'image';
    const store = foreign
      ? environment.layout.entities.get(foreign.target)?.storeName
      : isFile
        ? '_files'
        : undefined;
    if (store === undefined) continue;
    lookups.push({
      kind: 'exists',
      field: info.key,
      store,
      ids: (Array.isArray(value) ? value : [value]) as string[],
      message: foreign ? `no record of ${foreign.target} has this id` : 'no such file',
    });
  }
  return lookups;
}
