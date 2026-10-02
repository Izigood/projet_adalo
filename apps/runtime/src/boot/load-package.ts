import { UUID_V7_PATTERN, domainError, err, ok } from '@acs/domain';
import type { DomainError, Result } from '@acs/domain';
import {
  CURRENT_MANIFEST_VERSION,
  MANIFEST_PATH_PATTERN,
  detectManifestVersion,
} from '@acs/project-schema';
import type { PackageFiles } from '@acs/project-schema';
import type { FileSource } from './file-source.js';

const UUID_V7 = new RegExp(UUID_V7_PATTERN);
const PROJECT_FILE = 'project.json';

const MANIFEST_PATH = new RegExp(MANIFEST_PATH_PATTERN);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const isPath = (value: unknown): value is string =>
  typeof value === 'string' && MANIFEST_PATH.test(value);
const paths = (value: unknown): string[] => (Array.isArray(value) ? value.filter(isPath) : []);

/**
 * The files `project.json` names, read leniently: validation comes later and reports the faults.
 * A path that is not a plain relative path of the package (`../x.json`, `/x.json`) is never read:
 * the validator reports it on `project.json`.
 */
function entryPaths(root: unknown): { index: string | undefined; others: string[] } {
  const entries = isRecord(root) && isRecord(root['entries']) ? root['entries'] : {};
  const index = isPath(entries['pages']) ? entries['pages'] : undefined;
  const others = [
    ...paths([entries['schema'], entries['roles'], entries['queries']]),
    ...paths(entries['themes']),
    ...paths(entries['workflows']),
  ];
  return { index, others };
}

/** `pages/<id>.json` for every route of the index whose id is an identifier. */
function pagePaths(index: unknown): string[] {
  const routes = isRecord(index) && Array.isArray(index['routes']) ? index['routes'] : [];
  return routes.flatMap((route) => {
    const id = isRecord(route) ? route['pageId'] : undefined;
    return typeof id === 'string' && UUID_V7.test(id) ? [`pages/${id}.json`] : [];
  });
}

const loadIssue = (file: string, reason: string) => ({
  file,
  path: '/',
  keyword: 'missing-file',
  message: reason,
  params: {},
});

/**
 * Reads the files of a package (boot steps 1, ADR-0033). A package in an older format is a single
 * `project.json` that `openPackage` migrates; a current one lists its files in `entries`. Every
 * file that cannot be read is reported at once, with its name.
 */
export async function loadPackage(source: FileSource): Promise<Result<PackageFiles, DomainError>> {
  const root = await source(PROJECT_FILE);
  if (!root.ok) {
    return err(failed([loadIssue(PROJECT_FILE, root.error)]));
  }
  const files: Record<string, unknown> = { [PROJECT_FILE]: root.value };
  const version = detectManifestVersion(files);
  if (version !== CURRENT_MANIFEST_VERSION) return ok(files);

  const issues: ReturnType<typeof loadIssue>[] = [];
  const read = async (paths: readonly string[]) => {
    const results = await Promise.all(
      [...new Set(paths)].map(async (path) => [path, await source(path)] as const),
    );
    for (const [path, result] of results) {
      if (result.ok) files[path] = result.value;
      else issues.push(loadIssue(path, result.error));
    }
  };

  const { index, others } = entryPaths(root.value);
  await read(index === undefined ? others : [index, ...others]);
  if (index !== undefined) await read(pagePaths(files[index]));
  return issues.length === 0 ? ok(files) : err(failed(issues));
}

function failed(issues: readonly ReturnType<typeof loadIssue>[]): DomainError {
  return domainError('MANIFEST_INVALID', 'the project package could not be read', {
    details: { issues },
  });
}
