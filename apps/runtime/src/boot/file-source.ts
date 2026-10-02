import { err, ok } from '@acs/domain';
import type { Result } from '@acs/domain';

/**
 * Where the package files come from: a path of the package (`pages/index.json`) to its parsed
 * JSON, or the reason it could not be read. The Runtime reads them over HTTP; tests read a map.
 */
export type FileSource = (path: string) => Promise<Result<unknown, string>>;

/**
 * Reads the files of a package from a folder served next to the Runtime (ADR-0033). A path that
 * would leave that folder is refused whatever the manifest says.
 */
export function httpFileSource(base: string, fetchFile: typeof fetch = fetch): FileSource {
  const root = new URL(base);
  return async (path) => {
    const url = new URL(path, root);
    if (!url.href.startsWith(root.href)) return err('the path leaves the project folder');
    let response: Response;
    try {
      response = await fetchFile(url, { credentials: 'same-origin', cache: 'no-cache' });
    } catch {
      return err('the file could not be fetched');
    }
    if (!response.ok) return err(`the server answered ${response.status}`);
    try {
      return ok((await response.json()) as unknown);
    } catch {
      return err('the file is not valid JSON');
    }
  };
}
