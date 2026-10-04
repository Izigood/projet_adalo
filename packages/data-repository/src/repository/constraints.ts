import { domainError, err, ok } from '@acs/domain';
import type { DomainError, JsonValue, Result } from '@acs/domain';
import type { EntityLayout } from '../storage/layout.js';
import { checkFieldValue } from '../values/field-value.js';
import type { ValueRule } from '../values/field-value.js';
import { own } from '../values/own.js';

export type Violation = {
  readonly field: string;
  readonly rule: ValueRule | 'required' | 'unknown' | 'unique' | 'reference';
  readonly message: string;
};

/** The violations as one `CONSTRAINT_VIOLATION`, each tied to its field (dossier 7.7). */
export function constraintError(entity: string, violations: readonly Violation[]): DomainError {
  const first = violations[0];
  const more = violations.length > 1 ? ` (and ${violations.length - 1} more)` : '';
  return domainError(
    'CONSTRAINT_VIOLATION',
    `${entity}.${first?.field ?? ''}: ${first?.message ?? 'invalid'}${more}`,
    { details: { entity, violations } },
  );
}

/**
 * The business fields of a record, checked against the entity (EF-DAT-03): unknown fields are
 * refused, a default fills a field that is absent (not one that is `null`), an obligatory field
 * must have a value, and each value must fit its type and options. An optional field with no value
 * is left out of the record, so it is not in any index. Returns every violation at once, so a
 * form can show them all, or the record to store (decimals in canonical form).
 */
export function normaliseRecord(
  layout: EntityLayout,
  input: Readonly<Record<string, unknown>>,
): Result<Record<string, JsonValue>, Violation[]> {
  const violations: Violation[] = [];
  const record: Record<string, JsonValue> = {};

  for (const key of Object.keys(input)) {
    if (key !== 'id' && !layout.fields.has(key)) {
      violations.push({ field: key, rule: 'unknown', message: 'the entity has no such field' });
    }
  }

  for (const info of layout.fields.values()) {
    let value = own(input, info.key);
    if (value === undefined && info.definition.default !== undefined) {
      value = structuredClone(info.definition.default);
    }
    if (value === undefined || value === null) {
      if (info.required) {
        violations.push({ field: info.key, rule: 'required', message: 'a value is required' });
      }
      continue;
    }
    const checked = checkFieldValue(info.definition, value);
    if (checked.ok) record[info.key] = checked.value;
    else violations.push({ field: info.key, ...checked.error });
  }

  return violations.length > 0 ? err(violations) : ok(record);
}
