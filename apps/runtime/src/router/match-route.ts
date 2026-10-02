import { parseParam } from './params.js';
import type { ParamValue } from './params.js';
import type { Route, RouteTable } from './route-table.js';

/** What a hash designates (EF-NAV-01, EF-NAV-03). */
export type Location =
  | {
      readonly kind: 'page';
      readonly route: Route;
      readonly params: Readonly<Record<string, ParamValue>>;
    }
  | { readonly kind: 'redirect'; readonly to: string }
  | { readonly kind: 'invalid-param'; readonly route: Route; readonly param: string }
  | { readonly kind: 'not-found'; readonly path: string };

/** `#/orders/42?tab=1` -> `/orders/42`; an empty hash is the root; a trailing slash is ignored. */
export function pathFromHash(hash: string): string {
  const withoutHash = hash.startsWith('#') ? hash.slice(1) : hash;
  const path = withoutHash.split('?')[0] ?? '';
  const rooted = path.startsWith('/') ? path : `/${path}`;
  return rooted.length > 1 && rooted.endsWith('/') ? rooted.slice(0, -1) : rooted;
}

function decode(part: string): string | undefined {
  try {
    return decodeURIComponent(part);
  } catch {
    return undefined;
  }
}

/**
 * Finds the page a hash opens. The root goes to the initial page. Routes are tried from the most
 * specific; the first one whose literals match and whose parameters are valid wins. When only
 * parameters are wrong, the answer is `invalid-param`, a clean refusal like an unknown route.
 */
export function resolveLocation(table: RouteTable, hash: string): Location {
  const path = pathFromHash(hash);
  if (path === '/' && table.initial.path !== '/')
    return { kind: 'redirect', to: table.initial.path };

  const parts = path === '/' ? [] : path.split('/').slice(1);
  const decoded = parts.map(decode);
  if (decoded.some((part) => part === undefined || part === '')) return { kind: 'not-found', path };

  let refused: Location | undefined;
  for (const route of table.routes) {
    if (route.segments.length !== decoded.length) continue;
    const params: Record<string, ParamValue> = {};
    let literalsMatch = true;
    let invalid: string | undefined;
    route.segments.forEach((segment, i) => {
      const part = decoded[i] as string;
      if (segment.kind === 'literal') {
        if (segment.value !== part) literalsMatch = false;
        return;
      }
      const value = parseParam(segment.type, part);
      if (value === undefined) invalid ??= segment.name;
      else params[segment.name] = value;
    });
    if (!literalsMatch) continue;
    if (invalid === undefined) return { kind: 'page', route, params };
    refused ??= { kind: 'invalid-param', route, param: invalid };
  }
  return refused ?? { kind: 'not-found', path };
}
