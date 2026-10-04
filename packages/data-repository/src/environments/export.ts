import { domainError, err, ok } from '@acs/domain';
import type { DomainError, Result } from '@acs/domain';
import type { OpenEnvironment } from '../storage/database.js';
import { storageError } from '../storage/database.js';

/** What the data is for. `production` is what the end user keeps as the data of the application. */
export type ExportPurpose = 'test' | 'production';

export type ExportOptions = {
  readonly as: ExportPurpose;
  /** The "case explicite" of RG-04: the test data base is exported as production on purpose. */
  readonly confirmTestDataAsProduction?: boolean;
  readonly now?: () => Date;
};

export type DataExport = {
  readonly format: 'acs-data-export';
  readonly version: 1;
  /** The data base the rows come from. */
  readonly database: string;
  readonly environment: OpenEnvironment['environment'];
  readonly exportedAs: ExportPurpose;
  /** Whether the rows are test data: always, for the test data base. */
  readonly containsTestData: boolean;
  /** The test data base was exported as production, and the caller said so. */
  readonly confirmedTestDataAsProduction: boolean;
  readonly exportedAt: string;
  /** Records by entity key, without the keys the Repository keeps for its indexes. */
  readonly entities: Readonly<Record<string, readonly Record<string, unknown>[]>>;
  /** Links of the N-N relations, by relation id. */
  readonly links: Readonly<Record<string, readonly Record<string, unknown>[]>>;
};

const visible = (row: Record<string, unknown>): Record<string, unknown> =>
  Object.fromEntries(Object.entries(row).filter(([key]) => !key.startsWith('_k_')));

/**
 * Reads the whole data of an environment as one JSON-able object. The test data base is never
 * exported as production without the explicit confirmation (EF-DAT-06, RG-04): its rows are made
 * up, and mixing them with real ones is how a fixture ends up in a customer's data. Files and the
 * formats of export (CSV, encryption) come with lot 14; this is the guard and the content.
 */
export async function exportEnvironment(
  environment: OpenEnvironment,
  options: ExportOptions,
): Promise<Result<DataExport, DomainError>> {
  const isTest = environment.environment === 'test';
  if (isTest && options.as === 'production' && options.confirmTestDataAsProduction !== true) {
    return err(
      domainError(
        'ENVIRONMENT_FORBIDDEN',
        'the test data base is not exported as production without explicit confirmation',
        { details: { environment: environment.environment, as: options.as } },
      ),
    );
  }
  try {
    const { layout, db } = environment;
    const entityTables = [...layout.entities.values()].map((entity) => ({
      key: entity.key,
      table: db.table(entity.storeName),
    }));
    const linkTables = layout.relations.flatMap((relation) =>
      relation.junctionStore === undefined
        ? []
        : [{ key: relation.id, table: db.table(relation.junctionStore) }],
    );
    const read = await db.transaction(
      'r',
      [...entityTables, ...linkTables].map((item) => item.table),
      async () => {
        const entities: Record<string, Record<string, unknown>[]> = {};
        const links: Record<string, Record<string, unknown>[]> = {};
        for (const item of entityTables) {
          entities[item.key] = ((await item.table.toArray()) as Record<string, unknown>[]).map(
            visible,
          );
        }
        for (const item of linkTables) {
          links[item.key] = (await item.table.toArray()) as Record<string, unknown>[];
        }
        return { entities, links };
      },
    );
    return ok({
      format: 'acs-data-export',
      version: 1,
      database: environment.name,
      environment: environment.environment,
      exportedAs: options.as,
      containsTestData: isTest,
      confirmedTestDataAsProduction: isTest && options.as === 'production',
      exportedAt: (options.now ?? (() => new Date()))().toISOString(),
      ...read,
    });
  } catch (error) {
    return err(storageError(error));
  }
}
