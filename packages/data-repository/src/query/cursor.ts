import { err, ok } from '@acs/domain';
import type { Result } from '@acs/domain';

/** FNV-1a: identifies a query so that a cursor is not used with another one. */
export function fingerprint(text: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash = Math.imul(hash ^ text.charCodeAt(index), 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

/**
 * The cursor of the next page: opaque to the caller, it holds how many rows were already
 * returned (an offset, so it is not stable if rows are written between two pages) and which
 * query it belongs to.
 */
export function encodeCursor(offset: number, query: string): string {
  return btoa(JSON.stringify({ o: offset, q: query })).replace(/=+$/, '');
}

export function decodeCursor(cursor: string, query: string): Result<number, string> {
  try {
    const parsed = JSON.parse(atob(cursor)) as { o?: unknown; q?: unknown };
    if (typeof parsed.o !== 'number' || !Number.isSafeInteger(parsed.o) || parsed.o < 0) {
      return err('the cursor is not valid');
    }
    return parsed.q === query ? ok(parsed.o) : err('the cursor belongs to another query');
  } catch {
    return err('the cursor is not valid');
  }
}
