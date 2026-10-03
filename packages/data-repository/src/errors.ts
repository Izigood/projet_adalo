import type { DomainError } from '@acs/domain';

/**
 * What the port throws where it cannot return a `Result` (`query`, `observe`): the business error
 * of dossier 7.7 travels in `error`.
 */
export class DataError extends Error {
  readonly error: DomainError;

  constructor(error: DomainError) {
    super(`${error.code}: ${error.message}`);
    // Not "DataError": that is the name of an IndexedDB error, which Dexie recognises by its
    // name and turns into one of its own, so ours would lose its class inside a transaction.
    this.name = 'AcsDataError';
    this.error = error;
  }
}
