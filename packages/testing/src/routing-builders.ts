import type { Page, PagesIndex } from '@acs/project-schema';
import { stableId } from './ids.js';

/**
 * A page with just what routing reads: identifiers derived from its key, no guards, no nodes.
 * Not a valid page for the schema (a page needs at least one node): use it to test code that only
 * looks at routes and parameters.
 */
export function routingPage(key: string, route: string, params: Page['params'] = []): Page {
  return {
    id: stableId<'page'>(`routing.page.${key}`),
    key,
    route,
    params,
    rootNodeId: stableId<'node'>(`routing.node.${key}`),
    guards: [],
    nodes: {},
  };
}

/** The pages index listing every page under its own route, with `initial` shown first. */
export function routingIndex(pages: readonly Page[], initial: Page): PagesIndex {
  return {
    routes: pages.map((page) => ({ pageId: page.id, route: page.route })),
    initialPageId: initial.id,
    menus: [],
  };
}
