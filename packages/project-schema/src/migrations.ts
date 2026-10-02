import { domainError, err, newId, ok } from '@acs/domain';
import type { DomainError, Result } from '@acs/domain';
import { CURRENT_MANIFEST_VERSION } from './manifest.js';
import { validateFiles } from './package-files.js';
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

/** The real steps, one per version change. Filled in as the format evolves. */
export const MIGRATIONS: readonly MigrationStep[] = [];

const defaultContext: MigrationContext = { newId: () => newId() };

/**
 * The format version of a package: `manifestVersion` of its `project.json`, or 0 when that
 * property is absent (the first prototype format had none). `undefined` when it is unusable.
 */
export function detectManifestVersion(files: PackageFiles): number | undefined {
  const root = files['project.json'];
  if (typeof root !== 'object' || root === null || Array.isArray(root)) return undefined;
  const version = (root as Record<string, unknown>)['manifestVersion'];
  if (version === undefined) return 0;
  return typeof version === 'number' && Number.isInteger(version) && version >= 1
    ? version
    : undefined;
}

/**
 * Brings a package to the current format version. A package already at that version comes back as
 * it is; an older one goes through every step in order; a newer one is refused with
 * `MANIFEST_UNSUPPORTED`. It does not validate the result: `openPackage` does.
 */
export function migratePackage(
  files: PackageFiles,
  options: MigrationOptions = {},
): Result<PackageFiles, DomainError> {
  const current = options.current ?? CURRENT_MANIFEST_VERSION;
  const steps = options.steps ?? MIGRATIONS;
  const context = options.context ?? defaultContext;

  const found = detectManifestVersion(files);
  if (found === undefined) {
    return err(
      domainError('MANIFEST_INVALID', 'project.json has an unusable manifestVersion', {
        details: {
          issues: [
            {
              file: 'project.json',
              path: '/manifestVersion',
              keyword: 'type',
              message: 'must be a positive integer, or absent for the first format',
              params: {},
            },
          ],
        },
      }),
    );
  }
  if (found > current) {
    return err(
      domainError(
        'MANIFEST_UNSUPPORTED',
        `manifest version ${found} is newer than the version ${current} this application supports`,
        { details: { found, supported: current } },
      ),
    );
  }

  let result = files;
  for (let version = found; version < current; version += 1) {
    const step = steps.find((candidate) => candidate.from === version);
    if (step === undefined) {
      return err(
        domainError('MANIFEST_UNSUPPORTED', `no migration from manifest version ${version}`, {
          details: { found: version, supported: current },
        }),
      );
    }
    const migrated = step.migrate(result, context);
    if (!migrated.ok) return migrated;
    if (detectManifestVersion(migrated.value) !== version + 1) {
      // A step that does not advance the version is a bug in that step, not bad input.
      throw new Error(`migration from version ${version} did not produce version ${version + 1}`);
    }
    result = migrated.value;
  }
  return ok(result);
}

/** Migrates a package to the current version, then validates every file of the result. */
export function openPackage(
  files: PackageFiles,
  options: MigrationOptions = {},
): Result<PackageFiles, DomainError> {
  const migrated = migratePackage(files, options);
  return migrated.ok ? validateFiles(migrated.value) : migrated;
}
