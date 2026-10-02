import type { Page } from '@acs/project-schema';
import { stableId } from './ids.js';
import type { FixtureFiles } from './package-builder.js';

export type PageSpec = {
  readonly key: string;
  readonly route: string;
  readonly params?: Page['params'];
  readonly guards?: Page['guards'];
  /** Component of the single node of the page; `info.title@1` by default. */
  readonly component?: string;
};

/**
 * Adds a valid page to a package: one node showing `Page <key>`, its file, and its route in the
 * pages index. It changes `files` in place (a fixture call returns a fresh copy) and returns the
 * page.
 */
export function addPage(files: FixtureFiles, spec: PageSpec): Page {
  const id = stableId<'page'>(`added.page.${spec.key}`);
  const nodeId = stableId<'node'>(`added.node.${spec.key}`);
  const page: Page = {
    id,
    key: spec.key,
    route: spec.route,
    params: spec.params ?? [],
    rootNodeId: nodeId,
    guards: spec.guards ?? [],
    nodes: {
      [nodeId]: {
        id: nodeId,
        component: spec.component ?? 'info.title@1',
        props: { text: `Page ${spec.key}` },
        children: [],
      },
    },
  };
  files[`pages/${id}.json`] = page;
  (files['pages/index.json'] as { routes: unknown[] }).routes.push({
    pageId: id,
    route: spec.route,
  });
  return page;
}
