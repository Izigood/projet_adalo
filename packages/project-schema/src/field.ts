import { Type } from '@sinclair/typebox';
import type { Static } from '@sinclair/typebox';
import {
  ClassificationRef,
  ComponentReferenceRef,
  LabelRef,
  ReadableKeyRef,
  idOf,
} from './keys.js';
import { JsonValueSchema, STRICT, discriminated, ref } from './schema-kit.js';

/** The 13 field types of dossier 6.3. There is deliberately no `secret` type (EF-SEC-04). */
export const FIELD_TYPES = [
  'string',
  'text',
  'integer',
  'decimal',
  'boolean',
  'date',
  'datetime',
  'choice',
  'multiChoice',
  'reference',
  'file',
  'image',
  'json',
] as const;

export type FieldType = (typeof FIELD_TYPES)[number];

const SAFE_INTEGER = Number.MAX_SAFE_INTEGER;
/** Largest file the Studio accepts in a package (dossier 6.1: 100 MB for the whole package). */
const MAX_FILE_BYTES = 100 * 1024 * 1024;

/**
 * Definitions shared by several variants. They are registered under their own name in `SCHEMAS`
 * and compiled once; the variants call them through the refs below (see `ref`).
 */
export const FieldUi = Type.Object(
  {
    component: Type.Optional(ComponentReferenceRef),
    placeholder: Type.Optional(Type.String({ maxLength: 200 })),
    help: Type.Optional(Type.String({ maxLength: 500 })),
    order: Type.Optional(Type.Integer({ minimum: 0 })),
  },
  STRICT,
);

/** The only validator kind of the manifest for now; it follows the example of dossier 6.3. */
export const FieldValidator = Type.Object(
  {
    kind: Type.Literal('expression'),
    expr: Type.String({ minLength: 1, maxLength: 2000 }),
    message: Type.String({ minLength: 1, maxLength: 300 }),
  },
  STRICT,
);

/** A choice comes from a dictionary entity or from a fixed list (dossier 6.3). */
export const ChoiceSource = discriminated('kind', [
  Type.Object({ kind: Type.Literal('dictionary'), entity: idOf<'entity'>() }, STRICT),
  Type.Object(
    {
      kind: Type.Literal('list'),
      values: Type.Array(
        Type.Object(
          { value: Type.String({ minLength: 1, maxLength: 100 }), label: LabelRef },
          STRICT,
        ),
        { minItems: 1, maxItems: 500 },
      ),
    },
    STRICT,
  ),
]);

/** Options of `file` and `image` fields. */
export const FileOptions = Type.Object(
  {
    accept: Type.Optional(
      Type.Array(Type.String({ minLength: 1, maxLength: 100 }), { minItems: 1, maxItems: 20 }),
    ),
    maxSizeBytes: Type.Optional(Type.Integer({ minimum: 1, maximum: MAX_FILE_BYTES })),
  },
  STRICT,
);

const FieldUiRef = ref<typeof FieldUi>('FieldUi');
const FieldValidatorRef = ref<typeof FieldValidator>('FieldValidator');
const ChoiceSourceRef = ref<typeof ChoiceSource>('ChoiceSource');
const FileOptionsRef = ref<typeof FileOptions>('FileOptions');

const common = {
  id: idOf<'field'>(),
  key: ReadableKeyRef,
  label: LabelRef,
  required: Type.Boolean(),
  unique: Type.Optional(Type.Boolean()),
  default: Type.Optional(JsonValueSchema),
  validators: Type.Optional(Type.Array(FieldValidatorRef)),
  classification: ClassificationRef,
  ui: Type.Optional(FieldUiRef),
};

const StringOptions = Type.Object(
  {
    maxLength: Type.Optional(Type.Integer({ minimum: 1, maximum: 255 })),
    pattern: Type.Optional(Type.String({ minLength: 1, maxLength: 500 })),
  },
  STRICT,
);
const TextOptions = Type.Object(
  { maxLength: Type.Optional(Type.Integer({ minimum: 1, maximum: 10_000 })) },
  STRICT,
);
const IntegerOptions = Type.Object(
  {
    min: Type.Optional(Type.Integer({ minimum: -SAFE_INTEGER, maximum: SAFE_INTEGER })),
    max: Type.Optional(Type.Integer({ minimum: -SAFE_INTEGER, maximum: SAFE_INTEGER })),
  },
  STRICT,
);
/** `precision` and `scale` are mandatory for a decimal (dossier 6.3, decision D-07). */
const DecimalOptions = Type.Object(
  {
    precision: Type.Integer({ minimum: 1, maximum: 38 }),
    scale: Type.Integer({ minimum: 0, maximum: 38 }),
  },
  STRICT,
);
const BooleanOptions = Type.Object({ nullable: Type.Optional(Type.Boolean()) }, STRICT);
const ChoiceOptions = Type.Object({ source: ChoiceSourceRef }, STRICT);
const MultiChoiceOptions = Type.Object(
  {
    source: ChoiceSourceRef,
    min: Type.Optional(Type.Integer({ minimum: 0 })),
    max: Type.Optional(Type.Integer({ minimum: 1 })),
  },
  STRICT,
);
const ReferenceOptions = Type.Object({ target: idOf<'entity'>() }, STRICT);
const JsonOptions = Type.Object({ schema: Type.Optional(JsonValueSchema) }, STRICT);

const variant = <T extends FieldType>(type: T) => ({ ...common, type: Type.Literal(type) });

export const Field = discriminated('type', [
  Type.Object({ ...variant('string'), options: Type.Optional(StringOptions) }, STRICT),
  Type.Object({ ...variant('text'), options: Type.Optional(TextOptions) }, STRICT),
  Type.Object({ ...variant('integer'), options: Type.Optional(IntegerOptions) }, STRICT),
  Type.Object({ ...variant('decimal'), options: DecimalOptions }, STRICT),
  Type.Object({ ...variant('boolean'), options: Type.Optional(BooleanOptions) }, STRICT),
  Type.Object({ ...variant('date') }, STRICT),
  Type.Object({ ...variant('datetime') }, STRICT),
  Type.Object({ ...variant('choice'), options: ChoiceOptions }, STRICT),
  Type.Object({ ...variant('multiChoice'), options: MultiChoiceOptions }, STRICT),
  Type.Object({ ...variant('reference'), options: ReferenceOptions }, STRICT),
  Type.Object({ ...variant('file'), options: Type.Optional(FileOptionsRef) }, STRICT),
  Type.Object({ ...variant('image'), options: Type.Optional(FileOptionsRef) }, STRICT),
  Type.Object({ ...variant('json'), options: Type.Optional(JsonOptions) }, STRICT),
]);

export type Field = Static<typeof Field>;
