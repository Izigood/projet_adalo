import { Type } from '@sinclair/typebox';
import type { Static } from '@sinclair/typebox';
import { Field } from './field.js';
import { ClassificationRef, LabelRef, ReadableKeyRef, idOf } from './keys.js';
import { JsonValueSchema, STRICT, ref, stringEnum } from './schema-kit.js';

export const ENTITY_KINDS = ['business', 'parameter', 'dictionary'] as const;
export const CARDINALITIES = ['1-1', '1-N', 'N-N'] as const;
/** `restrict` is the one named by dossier 7.7 (REFERENCE_BLOCKED); the other two are assumed. */
export const ON_DELETE_ACTIONS = ['restrict', 'cascade', 'setNull'] as const;
/** Operators a FilterSpec can use; they are the ones an index can serve (dossier 7.1). */
export const FILTER_OPERATORS = ['eq', 'ne', 'gt', 'gte', 'lt', 'lte', 'in', 'startsWith'] as const;
export const SORT_DIRECTIONS = ['asc', 'desc'] as const;
export const AGGREGATE_FUNCTIONS = ['count', 'sum', 'avg', 'min', 'max'] as const;

/** An index over fields of the entity, designated by key (dossier 6.2: `indexes`). */
export const EntityIndex = Type.Object(
  {
    name: ReadableKeyRef,
    fields: Type.Array(ReadableKeyRef, { minItems: 1 }),
    unique: Type.Optional(Type.Boolean()),
  },
  STRICT,
);

/** An entity is one IndexedDB store (dossier 6.2). */
export const Entity = Type.Object(
  {
    id: idOf<'entity'>(),
    key: ReadableKeyRef,
    label: LabelRef,
    kind: stringEnum(ENTITY_KINDS),
    fields: Type.Array(ref<typeof Field>('Field'), { minItems: 1 }),
    indexes: Type.Optional(Type.Array(ref<typeof EntityIndex>('EntityIndex'))),
    classification: ClassificationRef,
  },
  STRICT,
);

/** Relations point at entities by id, never by label (dossier 9.3). N-N uses a junction store. */
export const Relation = Type.Object(
  {
    id: idOf<'relation'>(),
    source: idOf<'entity'>(),
    target: idOf<'entity'>(),
    cardinality: stringEnum(CARDINALITIES),
    onDelete: stringEnum(ON_DELETE_ACTIONS),
  },
  STRICT,
);

const FilterCondition = Type.Object(
  { field: ReadableKeyRef, op: stringEnum(FILTER_OPERATORS), value: JsonValueSchema },
  STRICT,
);

/** Structured filter `{ and: [{ field, op, value }] }` that can use the indexes (dossier 7.1). */
export const FilterSpec = Type.Object(
  { and: Type.Array(FilterCondition, { minItems: 1 }) },
  STRICT,
);

/** A named, reusable query (dossier 6.2). `source` is the key of an entity. */
export const Query = Type.Object(
  {
    id: idOf<'query'>(),
    key: ReadableKeyRef,
    source: ReadableKeyRef,
    filter: Type.Optional(ref<typeof FilterSpec>('FilterSpec')),
    where: Type.Optional(Type.String({ minLength: 1, maxLength: 2000 })),
    sort: Type.Optional(
      Type.Array(Type.Object({ field: ReadableKeyRef, dir: stringEnum(SORT_DIRECTIONS) }, STRICT), {
        minItems: 1,
      }),
    ),
    page: Type.Optional(
      Type.Object(
        {
          size: Type.Integer({ minimum: 1, maximum: 500 }),
          cursor: Type.Optional(Type.String({ minLength: 1 })),
        },
        STRICT,
      ),
    ),
    projection: Type.Optional(Type.Array(ReadableKeyRef, { minItems: 1 })),
    aggregate: Type.Optional(
      Type.Array(
        Type.Object(
          {
            fn: stringEnum(AGGREGATE_FUNCTIONS),
            field: Type.Optional(ReadableKeyRef),
            as: ReadableKeyRef,
          },
          STRICT,
        ),
        { minItems: 1 },
      ),
    ),
  },
  STRICT,
);

export type Entity = Static<typeof Entity>;
export type Relation = Static<typeof Relation>;
export type Query = Static<typeof Query>;
