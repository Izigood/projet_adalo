import { Type } from '@sinclair/typebox';
import type { Static, TSchema, TUnion, TUnsafe } from '@sinclair/typebox';

export type JsonValue =
  null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

/**
 * Any JSON value. Used where a later lot defines the structure (component props, workflow node
 * parameters, ...): the manifest stays open there until then (ADR-0028).
 */
export const JsonValueSchema = Type.Unsafe<JsonValue>({});

/** Objects rejected as soon as they carry a property the schema does not know (EF-SEC-04). */
export const STRICT = { additionalProperties: false } as const;

/**
 * A reference to the registered schema `name` (see `SCHEMAS`). The referenced schema is compiled
 * once and called from everywhere it is used, which keeps the generated validators small: the
 * Runtime ships them, and its budget is 250 kB compressed (dossier 8.3).
 */
export function ref<Definition extends TSchema>(name: string): TUnsafe<Static<Definition>> {
  return Type.Unsafe<Static<Definition>>({ $ref: name });
}

/**
 * A union selected by the value of `property` (OpenAPI-style discriminator). Unlike `anyOf`, a
 * wrong document yields the error of the one matching variant instead of one per variant, so the
 * JSON path of the error stays precise.
 */
export function discriminated<const Variants extends TSchema[]>(
  property: string,
  variants: [...Variants],
): TUnsafe<Static<TUnion<Variants>>> {
  return Type.Unsafe({
    type: 'object',
    oneOf: variants,
    discriminator: { propertyName: property },
  });
}
