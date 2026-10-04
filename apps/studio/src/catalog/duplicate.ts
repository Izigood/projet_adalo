import { UUID_V7_PATTERN, newId } from '@acs/domain';
import type { PackageFiles } from '@acs/domain';
import { t } from '../i18n.js';

const ANY_ID = new RegExp(UUID_V7_PATTERN.slice(1, -1), 'g');
const MAX_KEY = 16;
const MAX_LABEL = 200;

/**
 * A copy of a package in which no identifier is the original's (EF-PRJ-02). Every identifier is
 * replaced, wherever it is written: as a value, as the key of a map (the nodes of a page), and
 * inside a file name (`pages/{id}.json`, and the paths `project.json` lists), always by the same new
 * identifier, so that every reference still points at the object it pointed at. The original is not
 * touched. The key and the name are those of the copy.
 */
export function duplicateFiles(
  files: PackageFiles,
  copy: { readonly key: string; readonly name: string },
  generate: () => string = newId,
): PackageFiles {
  const renamed = new Map<string, string>();
  const text = JSON.stringify(files).replace(ANY_ID, (id) => {
    let fresh = renamed.get(id);
    if (fresh === undefined) {
      fresh = generate();
      renamed.set(id, fresh);
    }
    return fresh;
  });
  const result = JSON.parse(text) as Record<string, unknown>;
  const manifest = result['project.json'] as { project: { key: string; name: string } };
  manifest.project.key = copy.key;
  manifest.project.name = copy.name;
  return result as PackageFiles;
}

/**
 * The key of a copy (RG-11): the key with a number after it, the first that nobody has, whatever
 * the state of the projects that have the others. A key of 16 characters is cut to leave room.
 * The key it is given is that of a stored project, so already valid; the copy is checked against
 * the schemas when it is stored.
 */
export function freeKey(key: string, taken: ReadonlySet<string>): string {
  for (let n = 2; ; n += 1) {
    const suffix = String(n);
    const candidate = key.slice(0, MAX_KEY - suffix.length) + suffix;
    if (!taken.has(candidate)) return candidate;
  }
}

/** « Mon appli » becomes « Mon appli (copie) », within the 200 characters of a label. */
export function copyName(name: string): string {
  const suffix = t('catalog.copySuffix');
  return name.slice(0, MAX_LABEL - suffix.length) + suffix;
}
