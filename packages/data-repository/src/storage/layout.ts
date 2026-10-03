import { domainError, err, ok } from '@acs/domain';
import type { DomainError, JsonValue, Result } from '@acs/domain';
import type { Entity, Field, FieldType, Relation } from '@acs/project-schema';
import { decimalSortKey } from '../values/decimal.js';
import type { DecimalFormat } from '../values/decimal.js';

/** The stores every data base has besides the entities (dossier 6.4); `_outbox` stays empty at the MVP. */
const FIXED_STORES: readonly StoreSpec[] = [
  { name: '_meta', schema: 'key' },
  { name: '_files', schema: 'id' },
  { name: '_wfRuns', schema: 'id' },
  { name: '_wfLogs', schema: 'id, runId' },
  { name: '_outbox', schema: 'id' },
];

export type StoreSpec = { readonly name: string; readonly schema: string };

/** A key kept next to a value that IndexedDB cannot index or sort as it should. */
export type DerivedKey = {
  readonly keyField: string;
  readonly kind: 'decimal' | 'boolean';
  readonly format?: DecimalFormat;
};

export type FieldInfo = {
  readonly key: string;
  readonly type: FieldType;
  readonly required: boolean;
  readonly unique: boolean;
  readonly classification: Field['classification'];
  readonly derived?: DerivedKey;
  /** The field as the manifest declares it: its options and default. */
  readonly definition: Field;
};

export type IndexInfo = {
  /** The name Dexie knows the index by: the field, or `[a+b]` for several. */
  readonly dexieName: string;
  /** The keys of the record that are really indexed (a derived key stands for its field). */
  readonly keyPaths: readonly string[];
  readonly fields: readonly string[];
  readonly unique: boolean;
  readonly multiEntry: boolean;
};

export type EntityLayout = {
  readonly key: string;
  readonly storeName: string;
  readonly classification: Entity['classification'];
  readonly fields: ReadonlyMap<string, FieldInfo>;
  readonly indexes: readonly IndexInfo[];
};

export type DataLayout = {
  readonly entities: ReadonlyMap<string, EntityLayout>;
  readonly stores: readonly StoreSpec[];
  /** Same text for the same stores, whatever the order they were declared in. */
  readonly signature: string;
};

export const entityStoreName = (entityKey: string): string => `e_${entityKey}`;
export const junctionStoreName = (relationId: string): string => `j_${relationId}`;
export const derivedKeyName = (fieldKey: string): string => `_k_${fieldKey}`;

/** Fields whose value is a boolean or a decimal are indexed through a key derived from them. */
function derivedKeyOf(field: Field): DerivedKey | undefined {
  if (field.type === 'decimal') {
    return { keyField: derivedKeyName(field.key), kind: 'decimal', format: field.options };
  }
  if (field.type === 'boolean') return { keyField: derivedKeyName(field.key), kind: 'boolean' };
  return undefined;
}

function fieldInfo(field: Field): FieldInfo {
  const derived = derivedKeyOf(field);
  return {
    key: field.key,
    type: field.type,
    required: field.required,
    unique: field.unique === true,
    classification: field.classification,
    definition: field,
    ...(derived === undefined ? {} : { derived }),
  };
}

function entityLayout(entity: Entity, problems: string[]): EntityLayout {
  const fields = new Map<string, FieldInfo>();
  for (const field of entity.fields) {
    if (field.key === 'id') problems.push(`${entity.key}.id: id is the key of every record`);
    if (fields.has(field.key)) problems.push(`${entity.key}.${field.key}: declared twice`);
    fields.set(field.key, fieldInfo(field));
  }

  const indexes = new Map<string, IndexInfo>();
  const add = (names: readonly string[], unique: boolean, where: string): void => {
    const infos = names.map((name) => fields.get(name));
    if (infos.some((info) => info === undefined)) {
      problems.push(`${where}: an indexed field does not exist`);
      return;
    }
    const known = infos as FieldInfo[];
    const multiEntry = known.length === 1 && known[0]?.type === 'multiChoice';
    if (known.some((info) => info.type === 'json')) {
      problems.push(`${where}: a json field cannot be indexed`);
      return;
    }
    if (known.some((info) => info.type === 'multiChoice') && (known.length > 1 || unique)) {
      problems.push(`${where}: a multiple choice can only be indexed alone, and not as unique`);
      return;
    }
    const keyPaths = known.map((info) => info.derived?.keyField ?? info.key);
    const dexieName = keyPaths.length === 1 ? (keyPaths[0] ?? '') : `[${keyPaths.join('+')}]`;
    const before = indexes.get(dexieName);
    indexes.set(dexieName, {
      dexieName,
      keyPaths,
      fields: names,
      unique: unique || before?.unique === true,
      multiEntry,
    });
  };

  for (const info of fields.values()) {
    if (info.unique) add([info.key], true, `${entity.key}.${info.key}`);
    if (info.type === 'reference') add([info.key], false, `${entity.key}.${info.key}`);
  }
  for (const index of entity.indexes ?? []) {
    add(index.fields, index.unique === true, `${entity.key} index ${index.name}`);
  }

  return {
    key: entity.key,
    storeName: entityStoreName(entity.key),
    classification: entity.classification,
    fields,
    indexes: [...indexes.values()],
  };
}

const schemaOfEntity = (layout: EntityLayout): string =>
  [
    'id',
    '_updatedAt',
    ...layout.indexes.map(
      (index) => `${index.unique ? '&' : ''}${index.multiEntry ? '*' : ''}${index.dexieName}`,
    ),
  ].join(', ');

/**
 * The stores a project needs, from its entities and relations: one `e_<entity>` per entity, with
 * the indexes its fields and its declared indexes ask for, one `j_<relation>` per N-N relation, and
 * the fixed stores. A project that cannot be stored (an index on a field that does not exist, on a
 * json field…) is a `MANIFEST_INVALID` that names each problem.
 */
export function buildLayout(
  entities: readonly Entity[],
  relations: readonly Relation[],
): Result<DataLayout, DomainError> {
  const problems: string[] = [];
  const layouts = new Map<string, EntityLayout>();
  for (const entity of entities) {
    if (layouts.has(entity.key)) problems.push(`${entity.key}: declared twice`);
    layouts.set(entity.key, entityLayout(entity, problems));
  }

  const ids = new Set(entities.map((entity) => entity.id));
  const stores: StoreSpec[] = [];
  for (const layout of layouts.values()) {
    stores.push({ name: layout.storeName, schema: schemaOfEntity(layout) });
  }
  for (const relation of relations) {
    if (!ids.has(relation.source) || !ids.has(relation.target)) {
      problems.push(`relation ${relation.id}: links an entity that does not exist`);
    } else if (relation.cardinality === 'N-N') {
      stores.push({
        name: junctionStoreName(relation.id),
        schema: 'id, sourceId, targetId, &[sourceId+targetId]',
      });
    }
  }
  stores.push(...FIXED_STORES);

  if (problems.length > 0) {
    return err(
      domainError('MANIFEST_INVALID', 'the schema cannot be stored', { details: { problems } }),
    );
  }
  const sorted = [...stores].sort((a, b) => a.name.localeCompare(b.name));
  return ok({
    entities: layouts,
    stores: sorted,
    signature: JSON.stringify(sorted.map((store) => [store.name, store.schema])),
  });
}

/** The derived keys of a record about to be stored: the sort key of a decimal, 0 or 1 for a boolean. */
export function deriveKeys(
  layout: EntityLayout,
  record: Readonly<Record<string, unknown>>,
): Record<string, JsonValue> {
  const keys: Record<string, JsonValue> = {};
  for (const info of layout.fields.values()) {
    const value = record[info.key];
    if (info.derived === undefined || value === null || value === undefined) continue;
    if (info.derived.kind === 'boolean') keys[info.derived.keyField] = value === true ? 1 : 0;
    else if (info.derived.format !== undefined && typeof value === 'string') {
      keys[info.derived.keyField] = decimalSortKey(value, info.derived.format);
    }
  }
  return keys;
}
