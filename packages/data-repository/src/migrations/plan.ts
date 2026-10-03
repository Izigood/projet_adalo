import { domainError, err, ok } from '@acs/domain';
import type { DomainError, JsonValue, Result } from '@acs/domain';
import type { Entity, Field, Relation } from '@acs/project-schema';
import { fingerprint } from '../query/cursor.js';
import { buildLayout } from '../storage/layout.js';
import type { DataLayout, SchemaSnapshot } from '../storage/layout.js';
import { conversionFor } from './convert.js';

/** One change of the data base, by keys (the new keys, except what is removed). Dossier 6.5. */
export type MigrationOp =
  | { readonly kind: 'addEntity'; readonly entity: string }
  | { readonly kind: 'removeEntity'; readonly entity: string }
  | {
      readonly kind: 'addField';
      readonly entity: string;
      readonly field: string;
      readonly required: boolean;
      readonly default?: JsonValue;
    }
  | { readonly kind: 'removeField'; readonly entity: string; readonly field: string }
  | {
      readonly kind: 'renameField';
      readonly entity: string;
      readonly from: string;
      readonly to: string;
    }
  | {
      readonly kind: 'changeType';
      readonly entity: string;
      readonly field: string;
      readonly from: Field;
      readonly to: Field;
    }
  | {
      readonly kind: 'makeRequired';
      readonly entity: string;
      readonly field: string;
      readonly default?: JsonValue;
    }
  | {
      readonly kind: 'addIndex';
      readonly entity: string;
      readonly index: string;
      readonly unique: boolean;
    }
  | { readonly kind: 'removeIndex'; readonly entity: string; readonly index: string }
  | {
      readonly kind: 'addRelation';
      readonly relation: string;
      readonly cardinality: Relation['cardinality'];
    }
  | {
      readonly kind: 'removeRelation';
      readonly relation: string;
      readonly cardinality: Relation['cardinality'];
    }
  | {
      readonly kind: 'alterRelation';
      readonly relation: string;
      readonly onDelete: Relation['onDelete'];
    };

/** A step of the plan. Destructive: data is lost. Reversible: the previous state can be rebuilt from the new one. */
export type PlanStep = {
  readonly op: MigrationOp;
  readonly description: string;
  readonly destructive: boolean;
  readonly reversible: boolean;
};

export type MigrationPlan = {
  readonly steps: readonly PlanStep[];
  /** Some step loses data: it has to be approved (RG-09). */
  readonly destructive: boolean;
  readonly reversible: boolean;
  readonly fromSignature: string;
  readonly toSignature: string;
  /** Identifies the plan, so that a migration that was interrupted is resumed with the same one. */
  readonly fingerprint: string;
};

const blocked = (problems: readonly string[]): Result<never, DomainError> =>
  err(
    domainError('MIGRATION_BLOCKED', `the schema cannot be migrated: ${problems[0] ?? ''}`, {
      details: { problems },
    }),
  );

/**
 * A stable order for the same plan. A field is removed before another takes its key, and renamed
 * after that; values are converted, then added, then made required.
 */
const RANK: Readonly<Record<MigrationOp['kind'], number>> = {
  addEntity: 0,
  addRelation: 1,
  removeField: 2,
  renameField: 3,
  changeType: 4,
  addField: 5,
  makeRequired: 6,
  removeIndex: 7,
  addIndex: 8,
  alterRelation: 9,
  removeRelation: 10,
  removeEntity: 11,
};

const named = (entity: string, field: string): string => `${entity}.${field}`;

function step(
  op: MigrationOp,
  description: string,
  destructive = false,
  reversible = !destructive,
): PlanStep {
  return { op, description, destructive, reversible };
}

function sameDecimal(a: Field, b: Field): boolean {
  return (
    a.type === 'decimal' &&
    b.type === 'decimal' &&
    a.options.precision === b.options.precision &&
    a.options.scale === b.options.scale
  );
}

function fieldSteps(
  entity: string,
  before: Field[],
  after: Field[],
  problems: string[],
): PlanStep[] {
  const steps: PlanStep[] = [];
  const old = new Map<string, Field>(before.map((field) => [field.id, field]));
  const current = new Set(after.map((field) => field.id));

  for (const field of after) {
    const previous = old.get(field.id);
    const where = named(entity, field.key);
    if (previous === undefined) {
      steps.push(
        step(
          {
            kind: 'addField',
            entity,
            field: field.key,
            required: field.required,
            ...(field.default === undefined ? {} : { default: field.default }),
          },
          `add ${where}${field.required ? ' (required)' : ''}`,
        ),
      );
      continue;
    }
    if (previous.key !== field.key) {
      // Another field that stays used to have this key: a chain or a swap of renames cannot be
      // applied one after the other.
      if (before.some((other) => other.key === field.key && current.has(other.id))) {
        problems.push(
          `${named(entity, previous.key)}: cannot be renamed to ${field.key}, which was the key of another field that stays (a chain or a swap of renames)`,
        );
      }
      steps.push(
        step(
          { kind: 'renameField', entity, from: previous.key, to: field.key },
          `rename ${named(entity, previous.key)} to ${field.key}`,
        ),
      );
    }
    if (
      previous.type !== field.type ||
      (previous.type === 'decimal' && !sameDecimal(previous, field))
    ) {
      const conversion = conversionFor(previous, field);
      if (conversion === undefined) {
        problems.push(
          `${where}: no conversion from ${previous.type} to ${field.type}; remove the field and add another`,
        );
      } else {
        steps.push(
          step(
            { kind: 'changeType', entity, field: field.key, from: previous, to: field },
            `convert ${where} from ${previous.type} to ${field.type}${conversion.lossy ? ' (loses information)' : ''}`,
            conversion.lossy,
          ),
        );
      }
    }
    if (!previous.required && field.required) {
      steps.push(
        step(
          {
            kind: 'makeRequired',
            entity,
            field: field.key,
            ...(field.default === undefined ? {} : { default: field.default }),
          },
          `make ${where} required`,
        ),
      );
    }
  }
  for (const field of before) {
    if (!current.has(field.id)) {
      steps.push(
        step(
          { kind: 'removeField', entity, field: field.key },
          `remove ${named(entity, field.key)}`,
          true,
        ),
      );
    }
  }
  return steps;
}

function indexSteps(entity: string, before: DataLayout, after: DataLayout): PlanStep[] {
  const steps: PlanStep[] = [];
  const old = new Map((before.entities.get(entity)?.indexes ?? []).map((i) => [i.dexieName, i]));
  const current = new Map((after.entities.get(entity)?.indexes ?? []).map((i) => [i.dexieName, i]));
  for (const [name, index] of old) {
    const now = current.get(name);
    if (now === undefined || now.unique !== index.unique || now.multiEntry !== index.multiEntry) {
      steps.push(
        step({ kind: 'removeIndex', entity, index: name }, `drop index ${entity}.${name}`),
      );
    }
  }
  for (const [name, index] of current) {
    const was = old.get(name);
    if (was === undefined || was.unique !== index.unique || was.multiEntry !== index.multiEntry) {
      steps.push(
        step(
          { kind: 'addIndex', entity, index: name, unique: index.unique },
          `build ${index.unique ? 'unique ' : ''}index ${entity}.${name}`,
        ),
      );
    }
  }
  return steps;
}

function relationSteps(
  before: SchemaSnapshot,
  after: SchemaSnapshot,
  problems: string[],
): PlanStep[] {
  const steps: PlanStep[] = [];
  const old = new Map<string, Relation>(
    before.relations.map((relation) => [relation.id, relation]),
  );
  const current = new Set(after.relations.map((relation) => relation.id));
  for (const relation of after.relations) {
    const previous = old.get(relation.id);
    if (previous === undefined) {
      steps.push(
        step(
          { kind: 'addRelation', relation: relation.id, cardinality: relation.cardinality },
          `add the ${relation.cardinality} relation ${relation.id}`,
        ),
      );
    } else if (
      previous.cardinality !== relation.cardinality ||
      previous.source !== relation.source ||
      previous.target !== relation.target
    ) {
      problems.push(
        `relation ${relation.id}: its cardinality or its ends changed; remove it and add another`,
      );
    } else if (previous.onDelete !== relation.onDelete) {
      steps.push(
        step(
          { kind: 'alterRelation', relation: relation.id, onDelete: relation.onDelete },
          `relation ${relation.id}: onDelete becomes ${relation.onDelete}`,
        ),
      );
    }
  }
  for (const relation of before.relations) {
    if (!current.has(relation.id)) {
      // The links of an N-N relation are data; for the others the key stays in the records.
      steps.push(
        step(
          { kind: 'removeRelation', relation: relation.id, cardinality: relation.cardinality },
          `remove the ${relation.cardinality} relation ${relation.id}`,
          relation.cardinality === 'N-N',
        ),
      );
    }
  }
  return steps;
}

/**
 * The plan that takes a data base from one schema to another (EF-DAT-05, dossier 6.5): what is
 * added, renamed (explicitly: same field id, new key), converted, made required, indexed or
 * removed, each step flagged destructive or not, reversible or not. Entities and fields are the
 * same when their ids are. Changes the engine has no answer for (renaming an entity, a relation
 * that changes shape, a type with no conversion) are refused as `MIGRATION_BLOCKED`, all
 * together. The plan is pure: it reads no data, so what depends on the rows (a required field
 * with no default on a table that has some) is checked when it runs.
 */
export function planMigration(
  from: SchemaSnapshot,
  to: SchemaSnapshot,
): Result<MigrationPlan, DomainError> {
  const before = buildLayout([...from.entities], [...from.relations]);
  if (!before.ok) return before;
  const after = buildLayout([...to.entities], [...to.relations]);
  if (!after.ok) return after;

  const problems: string[] = [];
  const steps: PlanStep[] = [];
  const old = new Map<string, Entity>(from.entities.map((entity) => [entity.id, entity]));
  const current = new Set(to.entities.map((entity) => entity.id));

  for (const entity of to.entities) {
    const previous = old.get(entity.id);
    if (previous === undefined) {
      steps.push(step({ kind: 'addEntity', entity: entity.key }, `add the entity ${entity.key}`));
    } else if (previous.key !== entity.key) {
      problems.push(
        `${previous.key}: renaming an entity (to ${entity.key}) is not supported; add a new one and remove this one`,
      );
    } else {
      steps.push(
        ...fieldSteps(entity.key, [...previous.fields], [...entity.fields], problems),
        ...indexSteps(entity.key, before.value, after.value),
      );
    }
  }
  for (const entity of from.entities) {
    if (!current.has(entity.id)) {
      steps.push(
        step({ kind: 'removeEntity', entity: entity.key }, `remove the entity ${entity.key}`, true),
      );
    }
  }
  steps.push(...relationSteps(from, to, problems));
  if (problems.length > 0) return blocked(problems);

  steps.sort(
    (a, b) => RANK[a.op.kind] - RANK[b.op.kind] || a.description.localeCompare(b.description),
  );
  return ok({
    steps,
    destructive: steps.some((item) => item.destructive),
    reversible: steps.every((item) => item.reversible),
    fromSignature: before.value.signature,
    toSignature: after.value.signature,
    fingerprint: fingerprint(
      JSON.stringify([before.value.signature, after.value.signature, steps.map((item) => item.op)]),
    ),
  });
}
