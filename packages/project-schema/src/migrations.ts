import { domainError, err, newId, ok } from '@acs/domain';
import type { DomainError, Result } from '@acs/domain';
import { CURRENT_MANIFEST_VERSION } from './manifest.js';
import { migrateV0ToV1 } from './migrations/v0-to-v1.js';
import type { MigrationContext, MigrationOptions, MigrationStep } from './migration-types.js';
import { validateFiles } from './package-files.js';
import type { PackageFiles } from './package-files.js';

/**
 * Manifest migrations (dossier 6.5): chained when a package is opened; see migration-types.ts.
 * The real steps, one per version change. Filled in as the format evolves. */
export const MIGRATIONS: readonly MigrationStep[] = [{ from: 0, migrate: migrateV0ToV1 }];

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
