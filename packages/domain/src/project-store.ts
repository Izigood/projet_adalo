import type { DomainError } from './errors.js';
import type { Id } from './id.js';
import type { JsonValue } from './repository.js';
import type { Result } from './result.js';

/** The files of a project package (dossier 6.1): path -> parsed JSON document. */
export type PackageFiles = { readonly [path: string]: JsonValue };

/** Days a deleted project stays in the trash before it is purged (EF-PRJ-02). */
export const TRASH_RETENTION_DAYS = 30;
const DAY_MS = 86_400_000;

export const CATALOG_STATUSES = ['active', 'archived', 'trashed'] as const;
export type CatalogStatus = (typeof CATALOG_STATUSES)[number];

/** What the catalogue shows of a project: the metadata of EF-PRJ-01, read without opening it. */
export type CatalogSummary = {
  readonly id: Id;
  readonly key: string;
  readonly name: string;
  readonly description: string;
  readonly author: string;
  readonly version: string;
  readonly locale: string;
};

export type CatalogEntry = CatalogSummary & {
  readonly status: CatalogStatus;
  /** Number of saves: the optimistic lock of `save`. */
  readonly revision: number;
  readonly createdAt: string;
  readonly updatedAt: string;
  /** Set while `status` is `trashed`. */
  readonly trashedAt?: string;
};

export type StoredProject = { readonly entry: CatalogEntry; readonly files: PackageFiles };

/** The state the Studio could not save because it did not pass the structural validation (RG-13). */
export type RecoveryDraft = {
  readonly projectId: Id;
  readonly savedAt: string;
  /** Revision of the saved project this draft was made from. */
  readonly baseRevision: number;
  readonly files: PackageFiles;
};

/**
 * Where the Studio keeps its projects (EF-PRJ-01, EF-PRJ-02, RG-13). Like the Repository it
 * returns a `Result` for the errors a caller can branch on: a key already used is a
 * CONSTRAINT_VIOLATION, a stale revision a VERSION_CONFLICT, no IndexedDB a STORAGE_UNAVAILABLE.
 * The clock is a parameter (`at`, an ISO 8601 UTC date-time) so that the trash can be tested.
 */
export interface ProjectStore {
  list(): Promise<Result<readonly CatalogEntry[], DomainError>>;
  load(id: Id): Promise<Result<StoredProject | null, DomainError>>;
  /** Stores a new project at revision 1; refuses a `key` or an `id` that is already used. */
  create(
    summary: CatalogSummary,
    files: PackageFiles,
    at: string,
  ): Promise<Result<CatalogEntry, DomainError>>;
  /** Replaces the files and the summary; refuses a stale `expectedRevision`. */
  save(
    summary: CatalogSummary,
    files: PackageFiles,
    expectedRevision: number,
    at: string,
  ): Promise<Result<CatalogEntry, DomainError>>;
  /** Archives, trashes or restores; the project and its files are kept. */
  setStatus(id: Id, status: CatalogStatus, at: string): Promise<Result<CatalogEntry, DomainError>>;
  /** Deletes for good the projects that have been in the trash for the retention time. */
  purgeTrash(at: string): Promise<Result<readonly Id[], DomainError>>;
  saveDraft(draft: RecoveryDraft): Promise<Result<void, DomainError>>;
  loadDraft(projectId: Id): Promise<Result<RecoveryDraft | null, DomainError>>;
  discardDraft(projectId: Id): Promise<Result<void, DomainError>>;
}

/** Has this project been in the trash for the retention time at `at`? */
export function isPastTrashRetention(entry: CatalogEntry, at: string): boolean {
  if (entry.status !== 'trashed' || entry.trashedAt === undefined) return false;
  const trashed = Date.parse(entry.trashedAt);
  const now = Date.parse(at);
  if (Number.isNaN(trashed) || Number.isNaN(now)) return false;
  return now - trashed >= TRASH_RETENTION_DAYS * DAY_MS;
}
