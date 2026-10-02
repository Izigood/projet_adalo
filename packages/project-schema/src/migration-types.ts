import type { DomainError, Result } from '@acs/domain';
import type { PackageFiles } from './package-files.js';

/**
 * Manifest migrations (dossier 6.5): pure functions `migrate_v{n}_to_v{n+1}` chained when a package
 * is opened. Each step turns a package of version `from` into a package of version `from + 1`
 * without modifying its input. A package newer than the code is refused, never guessed at.
 */
export type MigrationContext = {
  /**
   * A new identifier for something the old format did not identify properly. `hint` names what it
   * is for (`entity:e1`): the default ignores it, tests use it to get stable identifiers.
   */
  readonly newId: (hint: string) => string;
};

export type MigrationStep = {
  readonly from: number;
  readonly migrate: (
    files: PackageFiles,
    context: MigrationContext,
  ) => Result<PackageFiles, DomainError>;
};

export type MigrationOptions = {
  readonly context?: MigrationContext;
  /** The steps available, by default the real ones. Tests inject their own. */
  readonly steps?: readonly MigrationStep[];
  /** The version to reach, by default the one this code writes. */
  readonly current?: number;
};
