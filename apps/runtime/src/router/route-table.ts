import { domainError, err, ok } from '@acs/domain';
import type { DomainError, Result } from '@acs/domain';
import type { Page, PagesIndex } from '@acs/project-schema';
import type { ParamType } from './params.js';

export type Segment =
  | { readonly kind: 'literal'; readonly value: string }
  | { readonly kind: 'param'; readonly name: string; readonly type: ParamType };

export type Route = {
  readonly pageId: Page['id'];
  readonly path: string;
  readonly segments: readonly Segment[];
};

/** Routes ordered by specificity (a literal segment before a parameter), and the initial one. */
export type RouteTable = {
  readonly routes: readonly Route[];
  readonly initial: Route;
};

const INDEX_FILE = 'pages/index.json';
const issue = (file: string, path: string, message: string) => ({
  file,
  path,
  keyword: 'reference',
  message,
  params: {},
});

function segmentsOf(path: string, page: Page): readonly Segment[] {
  return path
    .split('/')
    .slice(1)
    .filter((part) => part !== '')
    .map((part): Segment => {
      if (!part.startsWith(':')) return { kind: 'literal', value: part };
      const name = part.slice(1);
      return {
        kind: 'param',
        name,
        type: page.params.find((p) => p.name === name)?.type ?? 'string',
      };
    });
}

/** At the first position where two routes differ, the literal comes first. */
function bySpecificity(a: Route, b: Route): number {
  const length = Math.min(a.segments.length, b.segments.length);
  for (let i = 0; i < length; i += 1) {
    const left = a.segments[i]?.kind;
    const right = b.segments[i]?.kind;
    if (left !== right) return left === 'literal' ? -1 : 1;
  }
  return a.segments.length - b.segments.length;
}

const shapeOf = (route: Route) =>
  route.segments.map((s) => (s.kind === 'literal' ? `l:${s.value}` : `p:${s.type}`)).join('/');

/**
 * Builds the route table from the pages index and the page files, and refuses an index that
 * contradicts them (a route naming no page, a page that disagrees with its route, two routes the
 * same URL can match, a parameterised or missing initial page). The refusals are reported like
 * manifest issues, with the file and the JSON Pointer of the faulty value.
 */
export function buildRouteTable(
  index: PagesIndex,
  pages: readonly Page[],
): Result<RouteTable, DomainError> {
  const issues: ReturnType<typeof issue>[] = [];
  const byId = new Map(pages.map((page) => [page.id, page]));
  const routes: Route[] = [];
  const seen = new Map<string, number>();

  index.routes.forEach((entry, i) => {
    const page = byId.get(entry.pageId);
    if (page === undefined) {
      issues.push(issue(INDEX_FILE, `/routes/${i}/pageId`, 'no page file has this id'));
      return;
    }
    if (page.route !== entry.route) {
      issues.push(
        issue(INDEX_FILE, `/routes/${i}/route`, `the page declares the route ${page.route}`),
      );
    }
    const route: Route = {
      pageId: page.id,
      path: entry.route,
      segments: segmentsOf(entry.route, page),
    };
    const names = new Set(route.segments.flatMap((s) => (s.kind === 'param' ? [s.name] : [])));
    page.params.forEach((param, p) => {
      if (!names.has(param.name)) {
        issues.push(
          issue(`pages/${page.id}.json`, `/params/${p}/name`, 'the route has no such parameter'),
        );
      }
    });
    const shape = shapeOf(route);
    const first = seen.get(shape);
    if (first !== undefined) {
      issues.push(issue(INDEX_FILE, `/routes/${i}/route`, `same URLs as the route ${first}`));
    }
    seen.set(shape, i);
    routes.push(route);
  });

  const initial = routes.find((route) => route.pageId === index.initialPageId);
  if (initial === undefined) {
    issues.push(issue(INDEX_FILE, '/initialPageId', 'the initial page has no route'));
  } else {
    if (initial.segments.some((segment) => segment.kind === 'param')) {
      issues.push(issue(INDEX_FILE, '/initialPageId', 'the initial page cannot have parameters'));
    }
    const root = routes.findIndex((route) => route.path === '/');
    if (root !== -1 && routes[root]?.pageId !== index.initialPageId) {
      issues.push(
        issue(INDEX_FILE, `/routes/${root}/route`, 'the route / belongs to the initial page'),
      );
    }
  }

  if (issues.length > 0 || initial === undefined) {
    return err(
      domainError('MANIFEST_INVALID', 'the routes of the package are inconsistent', {
        details: { issues },
      }),
    );
  }
  return ok({ routes: [...routes].sort(bySpecificity), initial });
}
