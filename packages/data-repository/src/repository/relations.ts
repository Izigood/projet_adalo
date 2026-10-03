import { domainError, err, newId, ok } from '@acs/domain';
import type { DomainError, Result } from '@acs/domain';
import type { IndexableType } from 'dexie';
import type { OpenEnvironment } from '../storage/database.js';
import { constraintError } from './constraints.js';
import type { Violation } from './constraints.js';

type Row = Record<string, unknown> & { id: string };

/** A record that still points at the one being deleted. */
export type Dependent = { readonly entity: string; readonly id: string; readonly field: string };

type Ref = { readonly entity: string; readonly id: string };

export type DeletionPlan = {
  /** The record being deleted as stored, or undefined when it is not there. */
  readonly root: (Row & { _v: number }) | undefined;
  readonly remove: ReadonlyMap<string, Ref>;
  readonly clear: readonly (Ref & { readonly field: string })[];
  readonly junctionRows: ReadonlyMap<string, { readonly store: string; readonly id: string }>;
  readonly blockers: readonly Dependent[];
};

const refKey = (entity: string, id: string): string => `${entity}:${id}`;
const MAX_LISTED = 50;

/**
 * What deleting a record sets in motion, worked out before anything is written (RG-02): the
 * records a `cascade` removes (and what points at them in turn), the keys a `setNull` empties, the
 * links of N-N relations that go, and the records that block it (`restrict`, the default). A
 * dependent that is itself going away does not block. It starts by reading the record itself,
 * so it always makes a request (see `createRecordAccess`), and hands it back as `root`.
 */
export async function planDeletion(
  environment: OpenEnvironment,
  entity: string,
  id: string,
): Promise<DeletionPlan> {
  const { layout } = environment;
  const entityLayout = layout.entities.get(entity);
  if (entityLayout === undefined) throw new RangeError(`the project has no entity ${entity}`);
  const root = (await environment.db.table(entityLayout.storeName).get(id)) as
    (Row & { _v: number }) | undefined;
  const remove = new Map<string, Ref>([[refKey(entity, id), { entity, id }]]);
  if (root === undefined) return { root, remove, clear: [], junctionRows: new Map(), blockers: [] };
  const clear: (Ref & { field: string })[] = [];
  const blockers: Dependent[] = [];
  const links: { store: string; row: string; onDelete: string; relation: string; other: Ref }[] =
    [];
  const queue: Ref[] = [{ entity, id }];

  for (let current = queue.shift(); current !== undefined; current = queue.shift()) {
    for (const fk of layout.foreignKeys.filter(
      (candidate) => candidate.target === current?.entity,
    )) {
      const holder = layout.entities.get(fk.holder);
      if (holder === undefined) continue;
      const rows = (await environment.db
        .table(holder.storeName)
        .where(fk.field)
        .equals(current.id as IndexableType)
        .toArray()) as Row[];
      for (const row of rows) {
        if (remove.has(refKey(fk.holder, row.id))) continue;
        const dependent = { entity: fk.holder, id: row.id, field: fk.field };
        if (fk.onDelete === 'cascade') {
          remove.set(refKey(fk.holder, row.id), { entity: fk.holder, id: row.id });
          queue.push({ entity: fk.holder, id: row.id });
        } else if (fk.onDelete === 'setNull') clear.push(dependent);
        else blockers.push(dependent);
      }
    }

    for (const relation of layout.relations) {
      if (relation.junctionStore === undefined) continue;
      const table = environment.db.table(relation.junctionStore);
      const sides = [
        {
          when: relation.source === current.entity,
          column: 'sourceId',
          other: 'targetId',
          entity: relation.target,
        },
        {
          when: relation.target === current.entity,
          column: 'targetId',
          other: 'sourceId',
          entity: relation.source,
        },
      ];
      for (const side of sides.filter((candidate) => candidate.when)) {
        const rows = (await table
          .where(side.column)
          .equals(current.id as IndexableType)
          .toArray()) as Row[];
        for (const row of rows) {
          links.push({
            store: relation.junctionStore,
            row: row.id,
            onDelete: relation.onDelete,
            relation: relation.id,
            other: { entity: side.entity, id: String(row[side.other]) },
          });
        }
      }
    }
  }

  const junctionRows = new Map<string, { store: string; id: string }>();
  for (const link of links) {
    const otherGoes = remove.has(refKey(link.other.entity, link.other.id));
    if (otherGoes || link.onDelete !== 'restrict') {
      junctionRows.set(`${link.store}:${link.row}`, { store: link.store, id: link.row });
    } else {
      blockers.push({
        entity: link.other.entity,
        id: link.other.id,
        field: `relation ${link.relation}`,
      });
    }
  }
  return {
    root,
    remove,
    clear: clear.filter((item) => !remove.has(refKey(item.entity, item.id))),
    junctionRows,
    blockers: blockers.filter((item) => !remove.has(refKey(item.entity, item.id))),
  };
}

/** `REFERENCE_BLOCKED`, with the list of what is in the way (at most 50 shown, and the total). */
export function blockedError(
  entity: string,
  id: string,
  blockers: readonly Dependent[],
): DomainError {
  const counts = new Map<string, number>();
  for (const blocker of blockers) {
    const where = `${blocker.entity}.${blocker.field}`;
    counts.set(where, (counts.get(where) ?? 0) + 1);
  }
  const summary = [...counts].map(([where, count]) => `${count} in ${where}`).join(', ');
  return domainError('REFERENCE_BLOCKED', `${entity} ${id} is still used: ${summary}`, {
    details: { entity, id, total: blockers.length, dependents: blockers.slice(0, MAX_LISTED) },
  });
}

/** Writes a plan: removes, empties the keys of `setNull`, drops the links. Inside a transaction. */
export async function applyDeletion(
  environment: OpenEnvironment,
  plan: DeletionPlan,
  actor: string,
  stamp: string,
): Promise<void> {
  const tableOf = (entity: string) => {
    const layout = environment.layout.entities.get(entity);
    if (layout === undefined) throw new RangeError(`the project has no entity ${entity}`);
    return environment.db.table(layout.storeName);
  };
  for (const item of plan.remove.values()) await tableOf(item.entity).delete(item.id);
  for (const link of plan.junctionRows.values())
    await environment.db.table(link.store).delete(link.id);
  for (const item of plan.clear) {
    const table = tableOf(item.entity);
    const row = (await table.get(item.id)) as (Row & { _v: number }) | undefined;
    if (row === undefined) continue;
    const rest = Object.fromEntries(Object.entries(row).filter(([key]) => key !== item.field));
    await table.put({ ...rest, _v: row._v + 1, _updatedAt: stamp, _updatedBy: actor });
  }
}

export type RelationLinks = {
  link(sourceId: string, targetId: string): Promise<Result<void, DomainError>>;
  unlink(sourceId: string, targetId: string): Promise<Result<void, DomainError>>;
  targetsOf(sourceId: string): Promise<string[]>;
  sourcesOf(targetId: string): Promise<string[]>;
};

/** The links of an N-N relation (its junction store). The ends must exist; linking twice is one link. */
export function relationLinks(
  environment: OpenEnvironment,
  relationId: string,
  inTransaction: <R>(work: () => Promise<R>) => Promise<R>,
  failure: (error: unknown) => DomainError,
): RelationLinks {
  const relation = environment.layout.relations.find((candidate) => candidate.id === relationId);
  if (relation?.junctionStore === undefined) {
    throw new RangeError(`${relationId} is not an N-N relation of the project`);
  }
  const { junctionStore } = relation;
  const table = environment.db.table(junctionStore);
  const storeOf = (entity: string): string => {
    const layout = environment.layout.entities.get(entity);
    if (layout === undefined) throw new RangeError(`the project has no entity ${entity}`);
    return layout.storeName;
  };

  async function missingEnds(sourceId: string, targetId: string): Promise<Violation[]> {
    const ends = [
      { field: 'sourceId', store: storeOf(relation?.source ?? ''), id: sourceId },
      { field: 'targetId', store: storeOf(relation?.target ?? ''), id: targetId },
    ];
    const missing: Violation[] = [];
    for (const end of ends) {
      if ((await environment.db.table(end.store).get(end.id)) === undefined) {
        missing.push({ field: end.field, rule: 'reference', message: 'no such record' });
      }
    }
    return missing;
  }

  return {
    link: async (sourceId, targetId) => {
      try {
        return await inTransaction(async () => {
          const missing = await missingEnds(sourceId, targetId);
          if (missing.length > 0) return err(constraintError(relationId, missing));
          const existing = await table
            .where('[sourceId+targetId]')
            .equals([sourceId, targetId])
            .first();
          if (existing === undefined) await table.put({ id: newId(), sourceId, targetId });
          return ok(undefined);
        });
      } catch (error) {
        return err(failure(error));
      }
    },
    unlink: async (sourceId, targetId) => {
      try {
        await inTransaction(() =>
          table.where('[sourceId+targetId]').equals([sourceId, targetId]).delete(),
        );
        return ok(undefined);
      } catch (error) {
        return err(failure(error));
      }
    },
    targetsOf: async (sourceId) =>
      ((await table.where('sourceId').equals(sourceId).toArray()) as Row[]).map((row) =>
        String(row['targetId']),
      ),
    sourcesOf: async (targetId) =>
      ((await table.where('targetId').equals(targetId).toArray()) as Row[]).map((row) =>
        String(row['sourceId']),
      ),
  };
}
