import type { Entity, Field, Relation } from '@acs/project-schema';

export type OnDelete = Relation['onDelete'];

export const junctionStoreName = (relationId: string): string => `j_${relationId}`;

/** A relation as the Repository applies it. */
export type RelationLayout = {
  readonly id: string;
  readonly cardinality: Relation['cardinality'];
  readonly onDelete: OnDelete;
  /** Keys of the entities: for 1-1 and 1-N `source` is the "one" side, `target` holds the key. */
  readonly source: string;
  readonly target: string;
  /** 1-1 and 1-N: the reference field of `target` that points at `source`. */
  readonly foreignKey?: string;
  /** N-N: the store of the links. */
  readonly junctionStore?: string;
};

/**
 * A field that holds the id of a record of another entity: a `reference`, or a `choice` or
 * `multiChoice` over a dictionary. What happens to the holder when the record it points at is
 * deleted is the `onDelete` of the relation that covers the field, `restrict` when none does.
 */
export type ForeignKeyInfo = {
  readonly holder: string;
  readonly field: string;
  readonly multi: boolean;
  readonly target: string;
  readonly onDelete: OnDelete;
  readonly relationId?: string;
};

/** The id of the entity a field points at, if it points at one. */
export function pointedEntity(field: Field): string | undefined {
  if (field.type === 'reference') return field.options.target;
  if ((field.type === 'choice' || field.type === 'multiChoice') && field.options?.source) {
    return field.options.source.kind === 'dictionary' ? field.options.source.entity : undefined;
  }
  return undefined;
}

export type ResolvedRelations = {
  readonly relations: readonly RelationLayout[];
  readonly foreignKeys: readonly ForeignKeyInfo[];
  /** Fields that must be unique because a 1-1 relation says so, by entity key. */
  readonly uniqueFields: ReadonlyMap<string, ReadonlySet<string>>;
};

/**
 * Reads the relations of a project (ADR-0036). For 1-1 and 1-N the key is the one reference field
 * of the target entity that points at the source: none, or several, is a problem; so is `setNull`
 * on a required field, and two relations on the same field. A 1-1 key is unique. Problems are
 * appended to `problems`.
 */
export function resolveRelations(
  entities: readonly Entity[],
  relations: readonly Relation[],
  problems: string[],
): ResolvedRelations {
  const byId = new Map<string, Entity>(entities.map((entity) => [entity.id, entity]));
  const resolved: RelationLayout[] = [];
  const covered = new Map<string, RelationLayout>();
  const uniqueFields = new Map<string, Set<string>>();

  for (const relation of relations) {
    const source = byId.get(relation.source);
    const target = byId.get(relation.target);
    if (source === undefined || target === undefined) {
      problems.push(`relation ${relation.id}: links an entity that does not exist`);
      continue;
    }
    const base = {
      id: relation.id,
      cardinality: relation.cardinality,
      onDelete: relation.onDelete,
      source: source.key,
      target: target.key,
    };
    if (relation.cardinality === 'N-N') {
      resolved.push({ ...base, junctionStore: junctionStoreName(relation.id) });
      continue;
    }
    const candidates = target.fields.filter(
      (field) => field.type === 'reference' && field.options.target === source.id,
    );
    const key = candidates[0];
    if (candidates.length !== 1 || key === undefined) {
      problems.push(
        `relation ${relation.id}: ${target.key} needs exactly one reference field to ${source.key}, it has ${candidates.length}`,
      );
      continue;
    }
    if (relation.onDelete === 'setNull' && key.required) {
      problems.push(
        `relation ${relation.id}: setNull cannot empty ${target.key}.${key.key}, which is required`,
      );
    }
    const layout: RelationLayout = { ...base, foreignKey: key.key };
    const slot = `${target.key}.${key.key}`;
    if (covered.has(slot)) problems.push(`${slot}: two relations use this field`);
    covered.set(slot, layout);
    resolved.push(layout);
    if (relation.cardinality === '1-1') {
      const set = uniqueFields.get(target.key) ?? new Set<string>();
      set.add(key.key);
      uniqueFields.set(target.key, set);
    }
  }

  const foreignKeys: ForeignKeyInfo[] = [];
  for (const entity of entities) {
    for (const field of entity.fields) {
      const pointed = pointedEntity(field);
      if (pointed === undefined) continue;
      const target = byId.get(pointed);
      if (target === undefined) {
        problems.push(`${entity.key}.${field.key}: points at an entity that does not exist`);
        continue;
      }
      const relation = covered.get(`${entity.key}.${field.key}`);
      foreignKeys.push({
        holder: entity.key,
        field: field.key,
        multi: field.type === 'multiChoice',
        target: target.key,
        onDelete: relation?.onDelete ?? 'restrict',
        ...(relation === undefined ? {} : { relationId: relation.id }),
      });
    }
  }
  return { relations: resolved, foreignKeys, uniqueFields };
}
