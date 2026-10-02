import { domainError, err, ok } from '@acs/domain';
import type { DomainError, Result } from '@acs/domain';
import type { TObject } from '@sinclair/typebox';
import { Value } from '@sinclair/typebox/value';
import type { ComponentDefinition, PropsRecord } from './definition.js';

type JsonSchema = {
  readonly type?: string;
  readonly default?: unknown;
  readonly const?: unknown;
  readonly enum?: readonly unknown[];
  readonly anyOf?: readonly JsonSchema[];
  readonly minLength?: number;
  readonly minimum?: number;
  readonly exclusiveMinimum?: number;
  readonly minItems?: number;
  readonly properties?: Readonly<Record<string, JsonSchema>>;
  readonly required?: readonly string[];
};

function sampleValue(schema: JsonSchema): unknown {
  if (schema.default !== undefined) return schema.default;
  if (schema.const !== undefined) return schema.const;
  if (schema.enum !== undefined) return schema.enum[0];
  if (schema.anyOf !== undefined)
    return schema.anyOf[0] === undefined ? undefined : sampleValue(schema.anyOf[0]);
  switch (schema.type) {
    case 'string':
      return 'Exemple'.padEnd(schema.minLength ?? 0, 'x');
    case 'integer':
    case 'number':
      return (
        schema.minimum ?? (schema.exclusiveMinimum === undefined ? 1 : schema.exclusiveMinimum + 1)
      );
    case 'boolean':
      return false;
    case 'null':
      return null;
    case 'array':
      return Array.from({ length: schema.minItems ?? 0 }, () => undefined);
    case 'object':
      return sampleOf(schema);
    default:
      return undefined;
  }
}

function sampleOf(schema: JsonSchema): Record<string, unknown> {
  const sample: Record<string, unknown> = {};
  for (const name of schema.required ?? []) {
    const property = schema.properties?.[name];
    if (property !== undefined) sample[name] = sampleValue(property);
  }
  return sample;
}

/**
 * Props that satisfy a schema with the least effort: the required ones, from their default, a
 * constant, the first choice, or a plain value of their type. The contract kit renders a component
 * with them; a schema they cannot satisfy needs `default` values on its hard props.
 */
export function sampleProps(schema: TObject): Record<string, unknown> {
  return sampleOf(schema as unknown as JsonSchema);
}

/**
 * The props of a node as the component will receive them: the defaults of the schema filled in,
 * then checked. Unknown props, wrong types and missing required props are refused with the path
 * of each (`/props/label`), like the manifest issues. Interpreted by TypeBox's `Value`: no code
 * is generated, so it is allowed at run time (ADR-0034).
 */
export function validateProps(
  definition: Pick<ComponentDefinition, 'id' | 'propsSchema'>,
  props: PropsRecord,
): Result<PropsRecord, DomainError> {
  const filled = Value.Default(definition.propsSchema, structuredClone(props)) as PropsRecord;
  const issues = [...Value.Errors(definition.propsSchema, filled)].map((error) => ({
    path: `/props${error.path}`,
    keyword: String(error.type),
    message: error.message,
  }));
  return issues.length === 0
    ? ok(filled)
    : err(
        domainError('MANIFEST_INVALID', `the props of ${definition.id} are invalid`, {
          details: { component: definition.id, issues },
        }),
      );
}
