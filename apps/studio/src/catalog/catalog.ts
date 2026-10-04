import { domainError, err, newId, ok } from '@acs/domain';
import type { CatalogEntry, DomainError, Id, ProjectStore, Result } from '@acs/domain';
import { fromFiles, summaryOf } from '../project/project-state.js';
import { copyName, duplicateFiles, freeKey } from './duplicate.js';
import { queryCatalog } from './query.js';
import type { CatalogQuery } from './query.js';

export type CatalogOptions = {
  readonly store: ProjectStore;
  /** An ISO 8601 UTC date-time. */
  readonly now?: () => string;
  /** Where the identifiers of a copy come from. */
  readonly generate?: () => string;
  /** Saves what waits in the open project (the session's `flush`), so that a copy has it. */
  readonly flush?: () => Promise<void>;
  /** The project that is open, if any (the session's `current`). */
  readonly openId?: () => Id | null;
};

export type CatalogView = {
  readonly entries: readonly CatalogEntry[];
  /** The projects the trash let go of when the catalogue was opened. */
  readonly purged: readonly Id[];
};

export type Catalog = {
  /** Opens the catalogue: lets go of what has been in the trash for 30 days, then lists. */
  open(query?: CatalogQuery): Promise<Result<CatalogView, DomainError>>;
  /** Lists, without touching anything. */
  list(query?: CatalogQuery): Promise<Result<readonly CatalogEntry[], DomainError>>;
  /** A copy of a project, with identifiers of its own, a free key and « (copie) » in its name. */
  duplicate(id: Id): Promise<Result<CatalogEntry, DomainError>>;
  archive(id: Id): Promise<Result<CatalogEntry, DomainError>>;
  /** Puts a project in the trash, where it stays 30 days. The open project cannot be. */
  trash(id: Id): Promise<Result<CatalogEntry, DomainError>>;
  /** Takes a project out of the archive or the trash. */
  restore(id: Id): Promise<Result<CatalogEntry, DomainError>>;
};

const refuse = (message: string) =>
  domainError('CONSTRAINT_VIOLATION', message, { details: { field: 'id' } });

/** The catalogue of projects (EF-PRJ-02) over the store. */
export function createCatalog(options: CatalogOptions): Catalog {
  const { store } = options;
  const now = options.now ?? (() => new Date().toISOString());
  const generate = options.generate ?? newId;

  async function list(query?: CatalogQuery): Promise<Result<readonly CatalogEntry[], DomainError>> {
    const all = await store.list();
    return all.ok ? ok(queryCatalog(all.value, query)) : all;
  }

  return {
    list,

    async open(query) {
      const purged = await store.purgeTrash(now());
      if (!purged.ok) return purged;
      const entries = await list(query);
      return entries.ok ? ok({ entries: entries.value, purged: purged.value }) : entries;
    },

    async duplicate(id) {
      await options.flush?.();
      const loaded = await store.load(id);
      if (!loaded.ok) return loaded;
      if (loaded.value === null) return err(refuse(`there is no project ${id}`));
      const all = await store.list();
      if (!all.ok) return all;

      const key = freeKey(loaded.value.entry.key, new Set(all.value.map((entry) => entry.key)));
      const files = duplicateFiles(
        loaded.value.files,
        { key, name: copyName(loaded.value.entry.name) },
        generate,
      );
      // The summary comes from the copy as the Studio reads it, like any other project's.
      const state = fromFiles(files);
      if (!state.ok) return state;
      return store.create(summaryOf(state.value), files, now());
    },

    archive: (id) => store.setStatus(id, 'archived', now()),

    async trash(id) {
      if (options.openId?.() === id) {
        return err(refuse('the project is open: close it before putting it in the trash'));
      }
      return store.setStatus(id, 'trashed', now());
    },

    restore: (id) => store.setStatus(id, 'active', now()),
  };
}
