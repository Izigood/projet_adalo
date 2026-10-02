import { UUID_V7_PATTERN, domainError, err, ok } from '@acs/domain';
import type { DomainError, Result } from '@acs/domain';
import type { SchemaName } from './schemas.js';
import { validate } from './validate.js';
import type { Issue } from './validate.js';

/** The JSON files of a package by path, already parsed (dossier 6.1). */
export type PackageFiles = Readonly<Record<string, unknown>>;

/** An issue found in one file of the package. `path` is a JSON Pointer inside that file. */
export type FileIssue = Issue & { readonly file: string };

export type FilesValidationDetails = {
  readonly issues: readonly FileIssue[];
  /** Files no schema applies to (assets, README, integrity.json...): lot 12 handles those. */
  readonly skipped: readonly string[];
};

const ID = UUID_V7_PATTERN.slice(1, -1);

const LAYOUT: readonly (readonly [RegExp, SchemaName])[] = [
  [/^project\.json$/, 'ProjectManifest'],
  [/^schema\/entities\.json$/, 'EntitiesFile'],
  [/^schema\/roles\.json$/, 'RolesFile'],
  [/^pages\/index\.json$/, 'PagesIndex'],
  [new RegExp(`^pages/${ID}\\.json$`), 'Page'],
  [/^queries\/index\.json$/, 'QueriesFile'],
  [new RegExp(`^themes/${ID}\\.json$`), 'Theme'],
  [new RegExp(`^workflows/${ID}\\.json$`), 'Workflow'],
];

/** The schema of a package file, from its path; undefined when the layout has none for it. */
export function schemaForPath(path: string): SchemaName | undefined {
  return LAYOUT.find(([pattern]) => pattern.test(path))?.[1];
}

/**
 * Validates every file of a package that has a schema, and reports all the issues at once, each
 * with its file and its JSON Pointer. The package must contain `project.json`.
 *
 * Cross-file consistency (a menu pointing at a page that exists, `entries` naming real files) is
 * the validator's job (lot 13), not this function's.
 */
export function validateFiles(files: PackageFiles): Result<PackageFiles, DomainError> {
  const issues: FileIssue[] = [];
  const skipped: string[] = [];

  if (!Object.hasOwn(files, 'project.json')) {
    issues.push({
      file: 'project.json',
      path: '/',
      keyword: 'missing-file',
      message: 'the package has no project.json',
      params: {},
    });
  }

  for (const file of Object.keys(files).sort()) {
    const schema = schemaForPath(file);
    if (schema === undefined) {
      skipped.push(file);
      continue;
    }
    const result = validate(schema, files[file]);
    if (!result.ok) {
      const found = (result.error.details as { issues: Issue[] }).issues;
      issues.push(...found.map((issue) => ({ ...issue, file })));
    }
  }

  if (issues.length === 0) return ok(files);
  const details: FilesValidationDetails = { issues, skipped };
  return err(
    domainError('MANIFEST_INVALID', `the package is invalid (${issues.length} issue(s))`, {
      details: { ...details },
    }),
  );
}
