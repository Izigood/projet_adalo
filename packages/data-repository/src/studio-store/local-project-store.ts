import { domainError, err, isPastTrashRetention, ok } from '@acs/domain';
import type {
  CatalogEntry,
  CatalogStatus,
  CatalogSummary,
  DomainError,
  Id,
  PackageFiles,
  ProjectStore,
  RecoveryDraft,
  Result,
  StoredProject,
} from '@acs/domain';
import type Dexie from 'dexie';
import type { Table } from 'dexie';
import { dexieFor, storageError } from '../storage/database.js';
import type { IndexedDbSource } from '../storage/database.js';

/** The data base of the Studio itself: the catalogue, the packages and the recovery drafts. */
export const STUDIO_DATABASE = 'acs-studio';

type PackageRow = { readonly id: string; readonly files: PackageFiles };
type Tables = { projects: Table; packages: Table; drafts: Table };

const refuse = (message: string, field: string) =>
  domainError('CONSTRAINT_VIOLATION', message, { details: { field } });
const unknownProject = (id: string) => refuse(`there is no project ${id}`, 'id');

/** What the catalogue keeps of a summary, whatever else the caller passed along with it. */
function summaryFields(summary: CatalogSummary): CatalogSummary {
  const { id, key, name, description, author, version, locale } = summary;
  return { id, key, name, description, author, version, locale };
}

/**
 * The ProjectStore on IndexedDB (ADR-0037). The catalogue rows and the packages are kept apart so
 * that listing the catalogue never reads a package. Each operation is one transaction that checks
 * before it writes, so a refusal leaves nothing behind, and two tabs cannot both win a revision
 * or both take a key (IndexedDB runs the transactions that write the same stores one after the
 * other).
 * Without IndexedDB every operation says STORAGE_UNAVAILABLE.
 */
export function createLocalProjectStore(source?: IndexedDbSource): ProjectStore {
  let opening: Promise<Dexie> | undefined;
  const open = (): Promise<Dexie> => {
    opening ??= (async () => {
      const db = dexieFor(STUDIO_DATABASE, source);
      if (db === undefined) throw new Error('IndexedDB is not available');
      db.version(1).stores({ projects: 'id, &key, status', packages: 'id', drafts: 'projectId' });
      await db.open();
      return db;
    })().catch((error: unknown) => {
      opening = undefined;
      throw error;
    });
    return opening;
  };

  async function run<T>(
    mode: 'r' | 'rw',
    work: (tables: Tables) => Promise<Result<T, DomainError>>,
  ): Promise<Result<T, DomainError>> {
    try {
      const db = await open();
      const tables: Tables = {
        projects: db.table('projects'),
        packages: db.table('packages'),
        drafts: db.table('drafts'),
      };
      return await db.transaction(mode, [tables.projects, tables.packages, tables.drafts], () =>
        work(tables),
      );
    } catch (error) {
      return err(storageError(error));
    }
  }

  return {
    list: () =>
      run('r', async ({ projects }) => ok((await projects.toArray()) as readonly CatalogEntry[])),

    load: (id) =>
      run('r', async ({ projects, packages }) => {
        const entry = (await projects.get(id)) as CatalogEntry | undefined;
        if (entry === undefined) return ok<StoredProject | null>(null);
        const row = (await packages.get(id)) as PackageRow | undefined;
        return ok<StoredProject | null>({ entry, files: row?.files ?? {} });
      }),

    create: (summary, files, at) =>
      run('rw', async ({ projects, packages }) => {
        const fields = summaryFields(summary);
        if ((await projects.get(fields.id)) !== undefined) {
          return err(refuse(`there is already a project ${fields.id}`, 'id'));
        }
        if ((await projects.where('key').equals(fields.key).first()) !== undefined) {
          return err(refuse(`a project already has the key ${fields.key}`, 'key'));
        }
        const entry: CatalogEntry = {
          ...fields,
          status: 'active',
          revision: 1,
          createdAt: at,
          updatedAt: at,
        };
        await projects.add(entry);
        await packages.put({ id: fields.id, files } satisfies PackageRow);
        return ok(entry);
      }),

    save: (summary, files, expectedRevision, at) =>
      run('rw', async ({ projects, packages }) => {
        const fields = summaryFields(summary);
        const row = (await projects.get(fields.id)) as CatalogEntry | undefined;
        if (row === undefined) return err(unknownProject(fields.id));
        if (row.status === 'trashed') {
          return err(refuse('a project in the trash cannot be saved', 'status'));
        }
        if (row.revision !== expectedRevision) {
          return err(
            domainError('VERSION_CONFLICT', 'the project was saved since it was read', {
              details: { expected: expectedRevision, found: row.revision },
            }),
          );
        }
        const other = (await projects.where('key').equals(fields.key).first()) as
          CatalogEntry | undefined;
        if (other !== undefined && other.id !== fields.id) {
          return err(refuse(`a project already has the key ${fields.key}`, 'key'));
        }
        const entry: CatalogEntry = {
          ...fields,
          status: row.status,
          revision: row.revision + 1,
          createdAt: row.createdAt,
          updatedAt: at,
        };
        await projects.put(entry);
        await packages.put({ id: fields.id, files } satisfies PackageRow);
        return ok(entry);
      }),

    setStatus: (id, status: CatalogStatus, at) =>
      run('rw', async ({ projects }) => {
        const row = (await projects.get(id)) as CatalogEntry | undefined;
        if (row === undefined) return err(unknownProject(id));
        if (row.status === status) return ok(row);
        const entry: CatalogEntry = {
          ...summaryFields(row),
          status,
          revision: row.revision,
          createdAt: row.createdAt,
          updatedAt: row.updatedAt,
          ...(status === 'trashed' ? { trashedAt: at } : {}),
        };
        await projects.put(entry);
        return ok(entry);
      }),

    purgeTrash: (at) =>
      run('rw', async ({ projects, packages, drafts }) => {
        const trashed = (await projects
          .where('status')
          .equals('trashed')
          .toArray()) as CatalogEntry[];
        const doomed = trashed.filter((entry) => isPastTrashRetention(entry, at)).map((e) => e.id);
        await projects.bulkDelete(doomed);
        await packages.bulkDelete(doomed);
        await drafts.bulkDelete(doomed);
        return ok(doomed as readonly Id[]);
      }),

    saveDraft: (draft: RecoveryDraft) =>
      run('rw', async ({ projects, drafts }) => {
        if ((await projects.get(draft.projectId)) === undefined) {
          return err(unknownProject(draft.projectId));
        }
        await drafts.put(draft);
        return ok(undefined);
      }),

    loadDraft: (projectId) =>
      run('r', async ({ drafts }) =>
        ok(((await drafts.get(projectId)) as RecoveryDraft | undefined) ?? null),
      ),

    discardDraft: (projectId) =>
      run('rw', async ({ drafts }) => {
        await drafts.delete(projectId);
        return ok(undefined);
      }),
  };
}
