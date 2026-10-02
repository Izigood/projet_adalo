import { Type } from '@sinclair/typebox';
import type { Static } from '@sinclair/typebox';
import { ReadableKey, idOf } from './keys.js';

/**
 * Reference to a secret held outside the manifest (EF-SEC-04). It never carries a value: the
 * schema rejects any other property, so a `value` or `password` cannot be smuggled in.
 */
export const SecretRefSchema = Type.Object(
  {
    id: idOf<'secretRef'>(),
    key: ReadableKey,
    description: Type.String({ maxLength: 500 }),
  },
  { additionalProperties: false, description: 'Secret reference (name only, never a value)' },
);

export type SecretRef = Static<typeof SecretRefSchema>;
