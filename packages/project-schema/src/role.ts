import { Type } from '@sinclair/typebox';
import type { Static } from '@sinclair/typebox';
import { LabelRef, ReadableKeyRef, idOf } from './keys.js';
import { STRICT, stringEnum } from './schema-kit.js';

export const ENTITY_OPERATIONS = ['read', 'create', 'update', 'delete'] as const;
export const FIELD_ACCESS = ['hidden', 'readonly', 'editable'] as const;

/**
 * Declarative role (dossier 6.2): which pages, actions, entities and fields it reaches. The shape
 * is the minimum the manifest needs today; lot 11 refines it with the policy engine.
 */
export const Role = Type.Object(
  {
    id: idOf<'role'>(),
    key: ReadableKeyRef,
    label: LabelRef,
    permissions: Type.Object(
      {
        pages: Type.Array(ReadableKeyRef),
        actions: Type.Array(ReadableKeyRef),
        entities: Type.Array(
          Type.Object(
            {
              entity: ReadableKeyRef,
              operations: Type.Array(stringEnum(ENTITY_OPERATIONS), { minItems: 1 }),
              fields: Type.Optional(
                Type.Array(
                  Type.Object({ field: ReadableKeyRef, access: stringEnum(FIELD_ACCESS) }, STRICT),
                ),
              ),
            },
            STRICT,
          ),
        ),
      },
      STRICT,
    ),
  },
  STRICT,
);

export type Role = Static<typeof Role>;
