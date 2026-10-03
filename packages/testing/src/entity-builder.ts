import type { Entity, Relation } from '@acs/project-schema';
import { stableId } from './ids.js';

/** What a test says about a field: the rest (id, label, classification) is filled in. */
export type FieldSpec = {
  readonly type: string;
  readonly required?: boolean;
  readonly unique?: boolean;
  readonly options?: object;
  readonly default?: unknown;
};

/** A `reference` field to `target`. */
export const referenceTo = (target: Entity, extra: Partial<FieldSpec> = {}): FieldSpec => ({
  type: 'reference',
  options: { target: target.id },
  ...extra,
});

/** A small entity for a test: its fields by key, in order. Identifiers are stable. */
export function entityOf(
  key: string,
  fields: Readonly<Record<string, FieldSpec>>,
  indexes: Entity['indexes'] = [],
): Entity {
  return {
    id: stableId<'entity'>(`builder.entity.${key}`),
    key,
    label: key,
    kind: 'business',
    classification: 'interne',
    fields: Object.entries(fields).map(([fieldKey, spec]) => ({
      id: stableId<'field'>(`builder.field.${key}.${fieldKey}`),
      key: fieldKey,
      label: fieldKey,
      required: false,
      classification: 'public',
      ...spec,
    })),
    indexes,
  } as Entity;
}

/** A relation from `source` ("one" side) to `target`; its id is stable for the same pair. */
export function relationOf(
  source: Entity,
  target: Entity,
  cardinality: Relation['cardinality'],
  onDelete: Relation['onDelete'],
  name = `${source.key}-${target.key}`,
): Relation {
  return {
    id: stableId<'relation'>(`builder.relation.${name}`),
    source: source.id,
    target: target.id,
    cardinality,
    onDelete,
  };
}
