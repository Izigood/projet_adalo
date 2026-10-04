import { domainError, err, ok } from '@acs/domain';
import type { DomainError, Draft, RecordEnvelope, Result } from '@acs/domain';
import type { LocalDataStore } from '../repository/data-store.js';
import type { OpenEnvironment } from '../storage/database.js';

/** Records by entity key, as the API takes them. A row may carry its `id`, so that others can point at it. */
export type TestData = Readonly<Record<string, readonly Record<string, unknown>[]>>;

export type SeedReport = { readonly counts: Readonly<Record<string, number>> };

/** A row that the data base refused: thrown inside the transaction, which then undoes all of it. */
class SeedFailure extends Error {
  readonly error: DomainError;

  constructor(error: DomainError) {
    super(error.message);
    this.name = 'SeedFailure';
    this.error = error;
  }
}

/**
 * The entities of `data` with the ones other entities point at first, so that a row can refer to
 * a record that was loaded before it. An entity that depends on itself is not a dependency; a
 * cycle between entities cannot be ordered and keeps the order of `data`.
 */
function entityOrder(environment: OpenEnvironment, keys: readonly string[]): string[] {
  const present = new Set(keys);
  const needs = new Map<string, Set<string>>(keys.map((key) => [key, new Set<string>()]));
  for (const foreign of environment.layout.foreignKeys) {
    if (
      present.has(foreign.holder) &&
      present.has(foreign.target) &&
      foreign.holder !== foreign.target
    ) {
      needs.get(foreign.holder)?.add(foreign.target);
    }
  }
  const ordered: string[] = [];
  const placed = new Set<string>();
  while (ordered.length < keys.length) {
    const next = keys.find(
      (key) =>
        !placed.has(key) && [...(needs.get(key) ?? [])].every((target) => placed.has(target)),
    );
    if (next === undefined) {
      ordered.push(...keys.filter((key) => !placed.has(key)));
      break;
    }
    ordered.push(next);
    placed.add(next);
  }
  return ordered;
}

/** The rows of an entity with the rows that point at another row of the same entity after it. */
function rowOrder(
  environment: OpenEnvironment,
  entity: string,
  rows: readonly Record<string, unknown>[],
): Record<string, unknown>[] {
  const selfKeys = environment.layout.foreignKeys
    .filter((foreign) => foreign.holder === entity && foreign.target === entity && !foreign.multi)
    .map((foreign) => foreign.field);
  if (selfKeys.length === 0) return [...rows];
  const ids = new Set(rows.map((row) => row['id']).filter((id) => typeof id === 'string'));
  const placed = new Set<unknown>();
  const ordered: Record<string, unknown>[] = [];
  const waiting = [...rows];
  while (waiting.length > 0) {
    const index = waiting.findIndex((row) =>
      selfKeys.every((key) => {
        const target = row[key];
        return typeof target !== 'string' || !ids.has(target) || placed.has(target);
      }),
    );
    const [row] = waiting.splice(index === -1 ? 0 : index, 1);
    if (row === undefined) break;
    ordered.push(row);
    placed.add(row['id']);
  }
  return ordered;
}

/**
 * Loads test data into the test data base through the Repository (EF-DAT-06): the same
 * constraints, references and envelope as any write, parents before children whatever the order
 * of `data`, and all of it or nothing (a row that is refused undoes the others and is named by its
 * entity and position). It refuses any other environment: test data never goes into production
 * (RG-04), whatever the caller says.
 */
export async function seedTestData(
  store: LocalDataStore,
  environment: OpenEnvironment,
  data: TestData,
): Promise<Result<SeedReport, DomainError>> {
  if (environment.environment !== 'test') {
    return err(
      domainError('ENVIRONMENT_FORBIDDEN', 'test data is loaded into the test data base only', {
        details: { environment: environment.environment },
      }),
    );
  }
  const unknown = Object.keys(data).find((key) => !environment.layout.entities.has(key));
  if (unknown !== undefined) {
    return err(
      domainError('CONSTRAINT_VIOLATION', `the project has no entity ${unknown}`, {
        details: { entity: unknown },
      }),
    );
  }

  const order = entityOrder(environment, Object.keys(data));
  const counts: Record<string, number> = {};
  try {
    await store.access.transaction(async (uow) => {
      for (const entity of order) {
        const rows = rowOrder(environment, entity, data[entity] ?? []);
        for (const [index, row] of rows.entries()) {
          const saved = await uow.of<RecordEnvelope>(entity).save(row as Draft<RecordEnvelope>);
          if (!saved.ok) {
            throw new SeedFailure(
              domainError(saved.error.code, `${entity}[${String(index)}]: ${saved.error.message}`, {
                details: { ...saved.error.details, entity, index },
              }),
            );
          }
        }
        counts[entity] = rows.length;
      }
    });
  } catch (error) {
    if (error instanceof SeedFailure) return err(error.error);
    throw error;
  }
  return ok({ counts });
}
