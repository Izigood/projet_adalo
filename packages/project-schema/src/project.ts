import { Type } from '@sinclair/typebox';
import type { Static } from '@sinclair/typebox';
import { ReadableKeyRef, idOf } from './keys.js';
import { STRICT } from './schema-kit.js';

/**
 * Reference to a secret held outside the manifest (EF-SEC-04). It never carries a value: the
 * schema rejects any other property, so a `value` or `password` cannot be smuggled in.
 */
export const SecretRef = Type.Object(
  {
    id: idOf<'secretRef'>(),
    key: ReadableKeyRef,
    description: Type.String({ maxLength: 500 }),
  },
  { ...STRICT, description: 'Secret reference (name only, never a value)' },
);

export type SecretRef = Static<typeof SecretRef>;
